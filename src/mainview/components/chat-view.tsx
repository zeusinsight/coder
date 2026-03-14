import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { ChatMessage, ImageAttachment } from "../hooks/use-chat";
import type { Thread, PermissionRequest, AppSettings } from "../../bun/types";
import { useFileMention } from "../hooks/use-file-mention";
import { ChatToolbar } from "./chat-toolbar";
import { ChatInput, type QueuedMessage } from "./chat-input";
import { MessageList } from "./message-list";
import { groupToolMessages } from "./tool-panels";
import { isAskUserQuestion, AskQuestionPanel, PermissionPanel, PlanApprovalPanel } from "./tool-panels";
import { CLAUDE_MODELS, THINKING_LEVELS, type ThinkingLevel, type ChatMode } from "./chat-toolbar-selectors";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
	rpc: any;
	thread: Thread | null;
	messages: ChatMessage[];
	isStreaming: boolean;
	contextUsage: import("../../bun/types").ContextUsage | null;
	onSend: (prompt: string | any[], model?: string, accessMode?: "full" | "restricted", images?: ImageAttachment[], thinkingBudget?: number, chatMode?: "chat" | "build" | "plan") => void;
	onRetry: (messageId: string) => void;
	onInterrupt: () => void;
	permissionRequest: PermissionRequest | null;
	onResolvePermission: (allow: boolean, updatedInput?: Record<string, unknown>) => void;
	onThreadUpdated: (thread: Thread) => void;
	onToggleTerminal?: () => void;
	showTerminal?: boolean;
};

// ─── ChatView (orchestrator) ──────────────────────────────────────────────────

export function ChatView({
	rpc,
	thread,
	messages,
	isStreaming,
	contextUsage,
	onSend,
	onRetry,
	onInterrupt,
	permissionRequest,
	onResolvePermission,
	onThreadUpdated,
	onToggleTerminal,
	showTerminal,
}: Props) {
	// ─ Input state ──────────────────────────────────────────────────────────
	const [input, setInput] = useState("");
	const [cursorPos, setCursorPos] = useState(0);
	const [images, setImages] = useState<(ImageAttachment & { id: string; base64: string })[]>([]);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// ─ App-wide settings (for defaults) ─────────────────────────────────────
	const [appSettings, setAppSettings] = useState<AppSettings>({});
	useEffect(() => {
		rpc.request.getSettings({}).then((s: AppSettings) => setAppSettings(s)).catch(() => {});
	}, [rpc]);

	// ─ Settings state ────────────────────────────────────────────────────────
	const [selectedHarness, setSelectedHarness] = useState("claude");
	const [selectedModel, setSelectedModel] = useState("claude-opus-4-6");
	const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>("medium");
	const [accessMode, setAccessMode] = useState<"full" | "restricted">("full");
	const [chatMode, setChatMode] = useState<ChatMode>("chat");

	// ─ Message queue ─────────────────────────────────────────────────────────
	const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
	const messageQueueRef = useRef<QueuedMessage[]>([]);
	const [queueExpanded, setQueueExpanded] = useState(false);

	// ─ Draft persistence ─────────────────────────────────────────────────────
	const draftsRef = useRef<Map<string, string>>(() => {
		const map = new Map<string, string>();
		try {
			const saved = localStorage.getItem("coder-drafts");
			if (saved) {
				const parsed = JSON.parse(saved);
				for (const [k, v] of Object.entries(parsed)) {
					if (typeof v === "string" && v.trim()) map.set(k, v);
				}
			}
		} catch {}
		return map;
	});
	if (typeof draftsRef.current === "function") {
		draftsRef.current = (draftsRef.current as any)();
	}

	const saveDraftsToStorage = useCallback(() => {
		const obj: Record<string, string> = {};
		for (const [k, v] of (draftsRef.current as Map<string, string>).entries()) {
			if (v.trim()) obj[k] = v;
		}
		try { localStorage.setItem("coder-drafts", JSON.stringify(obj)); } catch {}
	}, []);

	const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const setInputWithDraft = useCallback((value: string) => {
		setInput(value);
		if (thread) {
			if (value.trim()) {
				(draftsRef.current as Map<string, string>).set(thread.id, value);
			} else {
				(draftsRef.current as Map<string, string>).delete(thread.id);
			}
			if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
			draftTimerRef.current = setTimeout(saveDraftsToStorage, 500);
		}
	}, [thread, saveDraftsToStorage]);

	// ─ File mention autocomplete ─────────────────────────────────────────────
	const fileMention = useFileMention(rpc, thread?.cwd, input, cursorPos);

	// ─ Sync settings + draft when thread switches ────────────────────────────
	const prevSyncThreadId = useRef<string | null>(null);
	useEffect(() => {
		if (!thread || thread.id === prevSyncThreadId.current) return;
		prevSyncThreadId.current = thread.id;
		const harness = thread.harness ?? "claude";
		const defaultModel = appSettings.defaultModels?.[harness] ?? "claude-opus-4-6";
		setSelectedHarness(harness);
		setSelectedModel(thread.model ?? defaultModel);
		setThinkingLevel(thread.thinkingLevel ?? "medium");
		setAccessMode(thread.accessMode ?? "full");
		setChatMode(thread.chatMode ?? "chat");
		setInput((draftsRef.current as Map<string, string>).get(thread.id) ?? "");
		requestAnimationFrame(() => textareaRef.current?.focus());
	}, [thread, appSettings]);

	// ─ CLAUDE.md detection ───────────────────────────────────────────────────
	const [hasClaudeMd, setHasClaudeMd] = useState<boolean | null>(null);
	useEffect(() => {
		if (!rpc || !thread) { setHasClaudeMd(null); return; }
		setHasClaudeMd(null);
		rpc.request.checkFileExists({ cwd: thread.cwd, path: "CLAUDE.md" })
			.then((exists: boolean) => setHasClaudeMd(exists))
			.catch(() => setHasClaudeMd(null));
	}, [rpc, thread?.id, thread?.cwd]);

	// ─ Settings persistence ──────────────────────────────────────────────────
	const saveSettings = useCallback((harness: string, model: string, mode: "full" | "restricted", thinking: ThinkingLevel, modeVal?: ChatMode) => {
		if (!rpc || !thread) return;
		rpc.request.updateThreadSettings({ id: thread.id, harness, model, accessMode: mode, thinkingLevel: thinking, chatMode: modeVal })
			.then((updated: Thread) => onThreadUpdated(updated))
			.catch(() => {});
	}, [rpc, thread, onThreadUpdated]);

	const changeHarness = useCallback((id: string) => { setSelectedHarness(id); saveSettings(id, selectedModel, accessMode, thinkingLevel, chatMode); }, [saveSettings, selectedModel, accessMode, thinkingLevel, chatMode]);
	const changeModel = useCallback((id: string) => { setSelectedModel(id); saveSettings(selectedHarness, id, accessMode, thinkingLevel, chatMode); }, [saveSettings, selectedHarness, accessMode, thinkingLevel, chatMode]);
	const changeThinkingLevel = useCallback((level: ThinkingLevel) => { setThinkingLevel(level); saveSettings(selectedHarness, selectedModel, accessMode, level, chatMode); }, [saveSettings, selectedHarness, selectedModel, accessMode, chatMode]);
	const changeChatMode = useCallback((mode: ChatMode) => { setChatMode(mode); saveSettings(selectedHarness, selectedModel, accessMode, thinkingLevel, mode); }, [saveSettings, selectedHarness, selectedModel, accessMode, thinkingLevel]);
	const changeAccessMode = useCallback(() => {
		const next = accessMode === "full" ? "restricted" : "full";
		setAccessMode(next);
		saveSettings(selectedHarness, selectedModel, next, thinkingLevel, chatMode);
	}, [saveSettings, selectedHarness, selectedModel, accessMode, thinkingLevel, chatMode]);

	// ─ handleSend ────────────────────────────────────────────────────────────
	const handleSend = useCallback(() => {
		if (!input.trim() && images.length === 0) return;
		const model = selectedHarness === "claude" ? selectedModel : undefined;
		const modelDef = CLAUDE_MODELS.find((m) => m.id === selectedModel);
		const budget = modelDef?.hasThinking ? THINKING_LEVELS.find((l) => l.id === thinkingLevel)?.budget : undefined;

		let content: string | any[];
		let imageAttachments: ImageAttachment[] | undefined;

		if (images.length > 0) {
			const contentBlocks: any[] = [];
			for (const img of images) {
				contentBlocks.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
			}
			if (input.trim()) contentBlocks.push({ type: "text", text: input.trim() });
			content = contentBlocks;
			imageAttachments = images.map((img) => ({ mediaType: img.mediaType, dataUrl: img.dataUrl }));
		} else {
			content = input.trim();
		}

		if (isStreaming) {
			const queued: QueuedMessage = { content, model, accessMode, images: imageAttachments, budget, chatMode, displayText: input.trim() || "📎 image" };
			messageQueueRef.current = [...messageQueueRef.current, queued];
			setMessageQueue([...messageQueueRef.current]);
		} else {
			onSend(content, model, accessMode, imageAttachments, budget, chatMode);
		}
		setInputWithDraft("");
		setImages([]);
	}, [input, images, selectedHarness, selectedModel, thinkingLevel, accessMode, chatMode, isStreaming, onSend, setInputWithDraft]);

	// ─ Derived message data ──────────────────────────────────────────────────
	const groupedMessages = useMemo(() => groupToolMessages(messages), [messages]);
	const hasStreamingMessage = useMemo(() => messages.some((m) => m.role === "assistant" && m.isStreaming), [messages]);

	// ─ Plan approval ─────────────────────────────────────────────────────────
	const [pendingPlanApproval, setPendingPlanApproval] = useState(false);
	const wasStreamingRef = useRef(false);
	useEffect(() => {
		if (isStreaming) {
			wasStreamingRef.current = true;
		} else if (wasStreamingRef.current) {
			wasStreamingRef.current = false;
			if (chatMode === "plan" && messages.length > 0) {
				const last = messages[messages.length - 1];
				if (last.role === "assistant" && last.content.trim()) setPendingPlanApproval(true);
			}
			// Auto-send next queued message when streaming finishes
			if (messageQueueRef.current.length > 0) {
				const [next, ...remaining] = messageQueueRef.current;
				messageQueueRef.current = remaining;
				setMessageQueue([...remaining]);
				onSend(next.content, next.model, next.accessMode, next.images, next.budget, next.chatMode);
			}
		}
	}, [isStreaming, chatMode, messages]);

	// Clear queue + plan approval on thread switch
	useEffect(() => {
		setPendingPlanApproval(false);
		messageQueueRef.current = [];
		setMessageQueue([]);
		setQueueExpanded(false);
	}, [thread?.id]);

	const handleAcceptPlan = useCallback(() => {
		setPendingPlanApproval(false);
		const model = selectedHarness === "claude" ? selectedModel : undefined;
		const modelDef = CLAUDE_MODELS.find((m) => m.id === selectedModel);
		const budget = modelDef?.hasThinking ? THINKING_LEVELS.find((l) => l.id === thinkingLevel)?.budget : undefined;
		setChatMode("build");
		saveSettings(selectedHarness, selectedModel, accessMode, thinkingLevel, "build");
		onSend("Implement the plan above.", model, accessMode, undefined, budget, "build");
	}, [selectedHarness, selectedModel, thinkingLevel, accessMode, saveSettings, onSend]);

	const handleDeclinePlan = useCallback(() => setPendingPlanApproval(false), []);

	const handleInitClaudeMd = useCallback(() => {
		if (!thread) return;
		const model = selectedHarness === "claude" ? selectedModel : undefined;
		const modelDef = CLAUDE_MODELS.find((m) => m.id === selectedModel);
		const budget = modelDef?.hasThinking ? THINKING_LEVELS.find((l) => l.id === thinkingLevel)?.budget : undefined;
		onSend("/init", model, accessMode, undefined, budget, chatMode);
		setTimeout(() => {
			rpc?.request.checkFileExists({ cwd: thread.cwd, path: "CLAUDE.md" })
				.then((exists: boolean) => setHasClaudeMd(exists))
				.catch(() => {});
		}, 5000);
	}, [thread, selectedHarness, selectedModel, thinkingLevel, accessMode, chatMode, onSend, rpc]);

	// ─ No-thread shell ───────────────────────────────────────────────────────
	if (!thread) {
		return (
			<div className="flex-1 flex flex-col min-h-0 bg-[#181818]">
				<div className="h-[52px] flex-shrink-0 electrobun-webkit-app-region-drag" onDoubleClick={() => rpc.request.toggleMaximize({})} />
				<div className="flex-1 flex flex-col items-center justify-center text-[#444]">
					<svg className="w-16 h-16 mb-4" viewBox="0 0 1024 1024">
						<rect width="1024" height="1024" rx="228" fill="#181818"/>
						<rect x="2" y="2" width="1020" height="1020" rx="226" fill="none" stroke="#2a2b2e" strokeWidth="3"/>
						<path d="M280 340 L480 512 L280 684" fill="none" stroke="#555" strokeWidth="64" strokeLinecap="round" strokeLinejoin="round"/>
						<line x1="560" y1="684" x2="744" y2="684" stroke="#555" strokeWidth="64" strokeLinecap="round"/>
					</svg>
					<div className="text-lg font-semibold text-[#555]">Koda</div>
					<div className="text-sm mt-1 text-[#444]">Select or create a project to start</div>
				</div>
			</div>
		);
	}

	// ─ Main render ───────────────────────────────────────────────────────────
	return (
		<div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#181818] relative overflow-hidden">
			<ChatToolbar
				rpc={rpc}
				thread={thread}
				contextUsage={contextUsage}
				showTerminal={showTerminal}
				onToggleTerminal={onToggleTerminal}
			/>

			<MessageList
				thread={thread}
				rpc={rpc}
				groupedMessages={groupedMessages}
				messages={messages}
				isStreaming={isStreaming}
				hasStreamingMessage={hasStreamingMessage}
				selectedHarness={selectedHarness}
				hasClaudeMd={hasClaudeMd}
				onRetry={onRetry}
				onInitClaudeMd={handleInitClaudeMd}
			/>

			{/* Inline permission / question panel */}
			{permissionRequest && (
				isAskUserQuestion(permissionRequest) ? (
					<AskQuestionPanel request={permissionRequest} onResolve={onResolvePermission} />
				) : (
					<PermissionPanel request={permissionRequest} onResolve={onResolvePermission} />
				)
			)}

			{/* Plan approval panel */}
			{pendingPlanApproval && !isStreaming && !permissionRequest && (
				<PlanApprovalPanel onAccept={handleAcceptPlan} onDecline={handleDeclinePlan} />
			)}

			<ChatInput
				thread={thread}
				rpc={rpc}
				isStreaming={isStreaming}
				input={input}
				images={images}
				messageQueue={messageQueue}
				messageQueueRef={messageQueueRef}
				queueExpanded={queueExpanded}
				chatMode={chatMode}
				selectedHarness={selectedHarness}
				selectedModel={selectedModel}
				thinkingLevel={thinkingLevel}
				accessMode={accessMode}
				fileMention={fileMention}
				onInputChange={setInputWithDraft}
				onCursorPosChange={setCursorPos}
				onSend={handleSend}
				onInterrupt={onInterrupt}
				onImagesChange={setImages}
				onQueueChange={setMessageQueue}
				onQueueExpandedChange={setQueueExpanded}
				onChangeHarness={changeHarness}
				onChangeModel={changeModel}
				onChangeThinkingLevel={changeThinkingLevel}
				onChangeChatMode={changeChatMode}
				onChangeAccessMode={changeAccessMode}
				textareaRef={textareaRef}
			/>
		</div>
	);
}
