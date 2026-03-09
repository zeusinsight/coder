import { useState, useEffect, useCallback, useRef, useReducer, useMemo } from "react";
import type { StreamMessage, PermissionRequest, ContextUsage } from "../../bun/types";

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

const EMPTY_MESSAGES: ChatMessage[] = [];

export function useChat(rpc: any, activeThreadId: string | null) {
	// Performance: use ref + reducer tick for batched renders during streaming
	const messagesRef = useRef(new Map<string, ChatMessage[]>());
	const [renderTick, forceRender] = useReducer((c: number) => c + 1, 0);
	const pendingRafRef = useRef<number | null>(null);

	// Schedule a batched render at next animation frame (max ~60fps during streaming)
	const scheduleRender = useCallback(() => {
		if (pendingRafRef.current === null) {
			pendingRafRef.current = requestAnimationFrame(() => {
				pendingRafRef.current = null;
				forceRender();
			});
		}
	}, []);

	// Force an immediate render (for non-streaming updates)
	const flushRender = useCallback(() => {
		if (pendingRafRef.current !== null) {
			cancelAnimationFrame(pendingRafRef.current);
			pendingRafRef.current = null;
		}
		forceRender();
	}, []);

	const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
	const streamingChunksRef = useRef<string[]>([]);
	const streamingTextRef = useRef("");

	// Per-thread status tracking
	const [threadStatuses, setThreadStatuses] = useState<Map<string, ThreadStatus>>(new Map());

	// Per-thread context usage tracking
	const [contextUsages, setContextUsages] = useState<Map<string, ContextUsage>>(new Map());

	const threadMessages = useMemo(
		() => (activeThreadId ? messagesRef.current.get(activeThreadId) ?? EMPTY_MESSAGES : EMPTY_MESSAGES),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[activeThreadId, renderTick]
	);

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
				messagesRef.current.set(activeThreadId, saved);
				flushRender();
			}
		}).catch(() => {});
		// Load saved context usage for this thread
		rpc.request.loadContextUsage({ threadId: activeThreadId }).then((saved: ContextUsage | null) => {
			if (saved) {
				setContextUsages((prev) => new Map(prev).set(activeThreadId!, saved));
			}
		}).catch(() => {});
	}, [rpc, activeThreadId, flushRender]);

	const activeThreadIdRef = useRef(activeThreadId);
	activeThreadIdRef.current = activeThreadId;

	// Cleanup rAF on unmount
	useEffect(() => {
		return () => {
			if (pendingRafRef.current !== null) {
				cancelAnimationFrame(pendingRafRef.current);
			}
		};
	}, []);

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

			// Partial streaming text — batched at ~60fps
			if (message.type === "assistant_partial" && message.result) {
				streamingChunksRef.current.push(message.result);
				streamingTextRef.current = streamingChunksRef.current.join("");
				const map = messagesRef.current;
				const existing = map.get(threadId) ?? [];
				const lastMsg = existing[existing.length - 1];
				if (lastMsg?.role === "assistant" && lastMsg.isStreaming) {
					// Mutate in place for performance — only update the content
					const updated = existing.slice();
					updated[updated.length - 1] = {
						...lastMsg,
						content: streamingTextRef.current,
					};
					map.set(threadId, updated);
				} else {
					map.set(threadId, [
						...existing,
						{
							id: crypto.randomUUID(),
							role: "assistant",
							content: streamingTextRef.current,
							isStreaming: true,
							createdAt: Date.now(),
						},
					]);
				}
				scheduleRender();
				return;
			}

			// Full assistant message
			if (message.type === "assistant") {
				const text = message.result ?? "";
				const toolUse = message.content as { id: string; name: string; input: Record<string, unknown> } | null;

				if (text) {
					streamingChunksRef.current = [];
					streamingTextRef.current = "";
					const map = messagesRef.current;
					const existing = map.get(threadId) ?? [];
					const lastMsg = existing[existing.length - 1];
					if (lastMsg?.role === "assistant" && lastMsg.isStreaming) {
						const updated = existing.slice();
						updated[updated.length - 1] = { ...lastMsg, content: text, isStreaming: false };
						map.set(threadId, updated);
					} else if (text.trim()) {
						map.set(threadId, [
							...existing,
							{ id: crypto.randomUUID(), role: "assistant", content: text, createdAt: Date.now() },
						]);
					}
				}

				if (toolUse) {
					const map = messagesRef.current;
					const existing = map.get(threadId) ?? [];
					map.set(threadId, [
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
				}
				flushRender();
				return;
			}

			// User message (replays during session resume, or agent-delegated)
			if (message.type === "user" && message.result) {
				const map = messagesRef.current;
				const existing = map.get(threadId) ?? [];
				map.set(threadId, [
					...existing,
					{
						id: crypto.randomUUID(),
						role: "user",
						content: message.result!,
						...(message.isAgent ? { isAgent: true } : {}),
					},
				]);
				flushRender();
				return;
			}

			// Result message
			if (message.type === "result") {
				streamingChunksRef.current = [];
				streamingTextRef.current = "";
				const map = messagesRef.current;
				const existing = map.get(threadId) ?? [];
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
				map.set(threadId, updated);

				// If user is viewing this thread, go idle; otherwise mark completed
				setThreadStatuses((prev) => {
					const next = new Map(prev);
					next.set(threadId, activeThreadIdRef.current === threadId ? "idle" : "completed");
					return next;
				});
				flushRender();
				return;
			}
		},
		[scheduleRender, flushRender]
	);

	const handleQueryResult = useCallback(
		(data: { threadId: string; success: boolean; error?: string }) => {
			if (data.threadId === "__menu_new_thread__") return;

			streamingChunksRef.current = [];
			streamingTextRef.current = "";

			const map = messagesRef.current;
			const existing = map.get(data.threadId) ?? [];
			let updated = existing.map((m) =>
				m.isStreaming ? { ...m, isStreaming: false } : m
			);
			if (!data.success && data.error) {
				updated = [
					...updated,
					{ id: crypto.randomUUID(), role: "assistant" as const, content: `Error: ${data.error}` },
				];
			}
			map.set(data.threadId, updated);
			flushRender();

			// Mark completed if not currently viewing
			setThreadStatuses((prev) => {
				const next = new Map(prev);
				next.set(data.threadId, activeThreadIdRef.current === data.threadId ? "idle" : "completed");
				return next;
			});
		},
		[flushRender]
	);

	const audioCtxRef = useRef<AudioContext | null>(null);
	const playDing = useCallback(() => {
		try {
			if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
			const ctx = audioCtxRef.current;
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

	const handleContextUsage = useCallback((data: ContextUsage) => {
		setContextUsages((prev) => new Map(prev).set(data.threadId, data));
	}, []);

	const handlePermissionRequest = useCallback((data: PermissionRequest) => {
		setPermissionRequest(data);
		if (data.threadId) {
			setThreadStatuses((prev) => new Map(prev).set(data.threadId!, "pending_approval"));
		}
		playDing();
	}, [playDing]);

	const sendMessage = useCallback(
		(prompt: string | any[], model?: string, accessMode?: "full" | "restricted", images?: ImageAttachment[], thinkingBudget?: number, chatMode?: "chat" | "build" | "plan") => {
			if (!rpc || !activeThreadId) return;
			const textContent = typeof prompt === "string" ? prompt : prompt.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
			if (!textContent.trim() && (!images || images.length === 0)) return;
			streamingChunksRef.current = [];
			streamingTextRef.current = "";
			// Mark as working immediately
			setThreadStatuses((prev) => new Map(prev).set(activeThreadId, "working"));

			const existing = messagesRef.current.get(activeThreadId) ?? [];
			messagesRef.current.set(activeThreadId, [
				...existing,
				{ id: crypto.randomUUID(), role: "user", content: textContent, createdAt: Date.now(), ...(images && images.length > 0 ? { images } : {}) },
			]);
			flushRender();

			rpc.send.sendMessage({ threadId: activeThreadId, prompt, model, accessMode, images, thinkingBudget, chatMode });
		},
		[rpc, activeThreadId, flushRender]
	);

	const retryFromMessage = useCallback(
		(messageId: string) => {
			if (!rpc || !activeThreadId) return;
			const currentStatus = threadStatuses.get(activeThreadId);
			if (currentStatus === "working" || currentStatus === "pending_approval") return;
			const currentMessages = messagesRef.current.get(activeThreadId) ?? [];
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
			messagesRef.current.set(activeThreadId, truncated);
			flushRender();

			// Persist truncated list (include images for user messages)
			rpc.request.overwriteThreadMessages({ threadId: activeThreadId, messages: truncated.map((m: ChatMessage) => ({ id: m.id, role: m.role, content: m.content, toolName: m.toolName, toolInput: m.toolInput, createdAt: m.createdAt, durationMs: m.durationMs, ...(m.images ? { images: m.images } : {}) })) }).catch(() => {});

			// Re-send the user message (with images if present)
			sendMessage(userMsg.content, undefined, undefined, userMsg.images);
		},
		[rpc, activeThreadId, threadStatuses, sendMessage, flushRender]
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

	// Derive context usage for active thread
	const contextUsage = activeThreadId ? contextUsages.get(activeThreadId) ?? null : null;

	// Preload thread messages on hover (before the thread is selected)
	const preloadThread = useCallback((threadId: string) => {
		if (!rpc || loadedThreadsRef.current.has(threadId)) return;
		loadedThreadsRef.current.add(threadId);
		rpc.request.loadThreadMessages({ threadId }).then((saved: ChatMessage[]) => {
			if (saved && saved.length > 0) {
				messagesRef.current.set(threadId, saved);
			}
		}).catch(() => {
			// Remove from loaded set so it can be retried
			loadedThreadsRef.current.delete(threadId);
		});
	}, [rpc]);

	// Cleanup messages for deleted threads to prevent memory leaks
	const cleanupThread = useCallback((threadId: string) => {
		messagesRef.current.delete(threadId);
		loadedThreadsRef.current.delete(threadId);
		setThreadStatuses((prev) => {
			if (prev.has(threadId)) {
				const next = new Map(prev);
				next.delete(threadId);
				return next;
			}
			return prev;
		});
	}, []);

	return {
		messages: threadMessages,
		isStreaming,
		contextUsage,
		permissionRequest,
		sendMessage,
		retryFromMessage,
		interruptQuery,
		resolvePermission,
		handleStreamChunk,
		handleQueryResult,
		handlePermissionRequest,
		handleContextUsage,
		getThreadStatus,
		cleanupThread,
		preloadThread,
	};
}
