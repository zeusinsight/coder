import { useState, useEffect, useCallback, useRef } from "react";
import type { StreamMessage, PermissionRequest } from "../../bun/types";

export type ImageAttachment = {
	mediaType: string;
	dataUrl: string;
};

export type ChatMessage = {
	id: string;
	role: "user" | "assistant" | "tool";
	content: string;
	toolName?: string;
	toolInput?: Record<string, unknown>;
	isStreaming?: boolean;
	createdAt?: number;
	durationMs?: number;
	isAgent?: boolean;
	images?: ImageAttachment[];
};

export type ThreadStatus = "idle" | "working" | "completed" | "pending_approval";

export function useChat(rpc: any, activeThreadId: string | null) {
	const [messages, setMessages] = useState<Map<string, ChatMessage[]>>(new Map());
	const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
	const streamingTextRef = useRef("");

	// Per-thread status tracking
	const [threadStatuses, setThreadStatuses] = useState<Map<string, ThreadStatus>>(new Map());

	const threadMessages = activeThreadId ? messages.get(activeThreadId) ?? [] : [];

	// Clear "completed" when user views the thread
	useEffect(() => {
		if (!activeThreadId) return;
		setThreadStatuses((prev) => {
			const status = prev.get(activeThreadId);
			if (status === "completed") {
				const next = new Map(prev);
				next.set(activeThreadId, "idle");
				return next;
			}
			return prev;
		});
	}, [activeThreadId]);

	// Load saved messages when switching threads
	const loadedThreadsRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		if (!rpc || !activeThreadId) return;
		if (loadedThreadsRef.current.has(activeThreadId)) return;
		loadedThreadsRef.current.add(activeThreadId);
		rpc.request.loadThreadMessages({ threadId: activeThreadId }).then((saved: ChatMessage[]) => {
			if (saved && saved.length > 0) {
				setMessages((prev) => new Map(prev).set(activeThreadId, saved));
			}
		}).catch(() => {});
	}, [rpc, activeThreadId]);

	const activeThreadIdRef = useRef(activeThreadId);
	activeThreadIdRef.current = activeThreadId;

	const handleStreamChunk = useCallback(
		(data: { threadId: string; message: StreamMessage }) => {
			const { threadId, message } = data;

			// Mark thread as working (but don't overwrite pending_approval)
			setThreadStatuses((prev) => {
				const current = prev.get(threadId);
				if (current !== "working" && current !== "pending_approval") {
					return new Map(prev).set(threadId, "working");
				}
				return prev;
			});

			// Partial streaming text
			if (message.type === "assistant_partial" && message.result) {
				streamingTextRef.current += message.result;
				setMessages((prev) => {
					const existing = prev.get(threadId) ?? [];
					const lastMsg = existing[existing.length - 1];
					if (lastMsg?.role === "assistant" && lastMsg.isStreaming) {
						const updated = [...existing];
						updated[updated.length - 1] = {
							...lastMsg,
							content: streamingTextRef.current,
						};
						return new Map(prev).set(threadId, updated);
					}
					return new Map(prev).set(threadId, [
						...existing,
						{
							id: crypto.randomUUID(),
							role: "assistant",
							content: streamingTextRef.current,
							isStreaming: true,
							createdAt: Date.now(),
						},
					]);
				});
				return;
			}

			// Full assistant message
			if (message.type === "assistant") {
				const text = message.result ?? "";
				const toolUse = message.content as { id: string; name: string; input: Record<string, unknown> } | null;

				if (text) {
					streamingTextRef.current = "";
					setMessages((prev) => {
						const existing = prev.get(threadId) ?? [];
						const lastMsg = existing[existing.length - 1];
						if (lastMsg?.role === "assistant" && lastMsg.isStreaming) {
							const updated = [...existing];
							updated[updated.length - 1] = { ...lastMsg, content: text, isStreaming: false };
							return new Map(prev).set(threadId, updated);
						}
						if (text.trim()) {
							return new Map(prev).set(threadId, [
								...existing,
								{ id: crypto.randomUUID(), role: "assistant", content: text, createdAt: Date.now() },
							]);
						}
						return prev;
					});
				}

				if (toolUse) {
					setMessages((prev) => {
						const existing = prev.get(threadId) ?? [];
						return new Map(prev).set(threadId, [
							...existing,
							{
								id: crypto.randomUUID(),
								role: "tool",
								content: "",
								toolName: toolUse.name,
								toolInput: toolUse.input,
								isStreaming: true,
							},
						]);
					});
				}
				return;
			}

			// User message (replays during session resume, or agent-delegated)
			if (message.type === "user" && message.result) {
				setMessages((prev) => {
					const existing = prev.get(threadId) ?? [];
					return new Map(prev).set(threadId, [
						...existing,
						{
							id: crypto.randomUUID(),
							role: "user",
							content: message.result!,
							...(message.isAgent ? { isAgent: true } : {}),
						},
					]);
				});
				return;
			}

			// Result message
			if (message.type === "result") {

				streamingTextRef.current = "";
				setMessages((prev) => {
					const existing = prev.get(threadId) ?? [];
					// Find the last assistant message and attach timing
					const lastAssistantIdx = existing.findLastIndex((m) => m.role === "assistant");
					const updated = existing.map((m, i) => {
						if (m.isStreaming) {
							return { ...m, isStreaming: false };
						}
						if (i === lastAssistantIdx && message.durationMs != null) {
							return {
								...m,
								createdAt: m.createdAt || message.createdAt,
								durationMs: message.durationMs,
							};
						}
						return m;
					});
					return new Map(prev).set(threadId, updated);
				});
				// If user is viewing this thread, go idle; otherwise mark completed
				setThreadStatuses((prev) => {
					const next = new Map(prev);
					next.set(threadId, activeThreadIdRef.current === threadId ? "idle" : "completed");
					return next;
				});
				return;
			}
		},
		[]
	);

	const handleQueryResult = useCallback(
		(data: { threadId: string; success: boolean; error?: string }) => {
			if (data.threadId === "__menu_new_thread__") return;

			streamingTextRef.current = "";

			setMessages((prev) => {
				const existing = prev.get(data.threadId) ?? [];
				let updated = existing.map((m) =>
					m.isStreaming ? { ...m, isStreaming: false } : m
				);
				if (!data.success && data.error) {
					updated = [
						...updated,
						{ id: crypto.randomUUID(), role: "assistant" as const, content: `Error: ${data.error}` },
					];
				}
				return new Map(prev).set(data.threadId, updated);
			});

			// Mark completed if not currently viewing
			setThreadStatuses((prev) => {
				const next = new Map(prev);
				next.set(data.threadId, activeThreadIdRef.current === data.threadId ? "idle" : "completed");
				return next;
			});
		},
		[]
	);

	const playDing = useCallback(() => {
		try {
			const ctx = new AudioContext();
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.frequency.value = 880;
			osc.type = "sine";
			gain.gain.setValueAtTime(0.3, ctx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
			osc.start(ctx.currentTime);
			osc.stop(ctx.currentTime + 0.3);
		} catch {}
	}, []);

	const handlePermissionRequest = useCallback((data: PermissionRequest) => {
		setPermissionRequest(data);
		if (data.threadId) {
			setThreadStatuses((prev) => new Map(prev).set(data.threadId!, "pending_approval"));
		}
		playDing();
	}, [playDing]);

	const sendMessage = useCallback(
		(prompt: string | any[], model?: string, accessMode?: "full" | "restricted", images?: ImageAttachment[], thinkingBudget?: number) => {
			if (!rpc || !activeThreadId) return;
			const textContent = typeof prompt === "string" ? prompt : prompt.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
			if (!textContent.trim() && (!images || images.length === 0)) return;
			streamingTextRef.current = "";
			// Mark as working immediately
			setThreadStatuses((prev) => new Map(prev).set(activeThreadId, "working"));

			setMessages((prev) => {
				const existing = prev.get(activeThreadId) ?? [];
				return new Map(prev).set(activeThreadId, [
					...existing,
					{ id: crypto.randomUUID(), role: "user", content: textContent, createdAt: Date.now(), ...(images && images.length > 0 ? { images } : {}) },
				]);
			});

			rpc.send.sendMessage({ threadId: activeThreadId, prompt, model, accessMode, images, thinkingBudget });
		},
		[rpc, activeThreadId]
	);

	const retryFromMessage = useCallback(
		(messageId: string) => {
			if (!rpc || !activeThreadId) return;
			const currentStatus = threadStatuses.get(activeThreadId);
			if (currentStatus === "working" || currentStatus === "pending_approval") return;
			const currentMessages = messages.get(activeThreadId) ?? [];
			const idx = currentMessages.findIndex((m) => m.id === messageId);
			if (idx === -1) return;

			// Find the user message at or before this index
			let userMsgIdx = idx;
			if (currentMessages[idx].role !== "user") {
				// Find the preceding user message
				for (let i = idx - 1; i >= 0; i--) {
					if (currentMessages[i].role === "user" && !currentMessages[i].isAgent) {
						userMsgIdx = i;
						break;
					}
				}
			}

			const userMsg = currentMessages[userMsgIdx];
			if (!userMsg || userMsg.role !== "user") return;

			// Truncate messages from this point
			const truncated = currentMessages.slice(0, userMsgIdx);
			setMessages((prev) => new Map(prev).set(activeThreadId, truncated));

			// Persist truncated list (include images for user messages)
			rpc.request.overwriteThreadMessages({ threadId: activeThreadId, messages: truncated.map((m: ChatMessage) => ({ id: m.id, role: m.role, content: m.content, toolName: m.toolName, toolInput: m.toolInput, createdAt: m.createdAt, durationMs: m.durationMs, ...(m.images ? { images: m.images } : {}) })) }).catch(() => {});

			// Re-send the user message (with images if present)
			sendMessage(userMsg.content, undefined, undefined, userMsg.images);
		},
		[rpc, activeThreadId, threadStatuses, messages, sendMessage]
	);

	const interruptQuery = useCallback(() => {
		if (!rpc || !activeThreadId) return;
		rpc.send.interruptQuery({ threadId: activeThreadId });
	}, [rpc, activeThreadId]);

	const resolvePermission = useCallback(
		(allow: boolean, updatedInput?: Record<string, unknown>) => {
			if (!rpc || !permissionRequest) return;
			// Restore working status
			if (permissionRequest.threadId) {
				setThreadStatuses((prev) => new Map(prev).set(permissionRequest.threadId!, "working"));
			}
			rpc.send.resolvePermission({ id: permissionRequest.id, allow, updatedInput });
			setPermissionRequest(null);
		},
		[rpc, permissionRequest]
	);

	const getThreadStatus = useCallback(
		(threadId: string): ThreadStatus => threadStatuses.get(threadId) ?? "idle",
		[threadStatuses]
	);

	// Derive streaming state from active thread's status
	const status = activeThreadId ? threadStatuses.get(activeThreadId) : undefined;
	const isStreaming = status === "working" || status === "pending_approval";

	return {
		messages: threadMessages,
		isStreaming,
		permissionRequest,
		sendMessage,
		retryFromMessage,
		interruptQuery,
		resolvePermission,
		handleStreamChunk,
		handleQueryResult,
		handlePermissionRequest,
		getThreadStatus,
	};
}
