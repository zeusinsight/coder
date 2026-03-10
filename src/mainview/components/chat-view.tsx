import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { Message } from "./message";
import type { ChatMessage, ImageAttachment } from "../hooks/use-chat";
import type { Thread, PermissionRequest } from "../../bun/types";
import { DiffView } from "./diff-view";
import { useFileMention } from "../hooks/use-file-mention";
import { FileMentionPopup } from "./file-mention-popup";
import { GitDiffSidebar } from "./git-diff-sidebar";
import { CommitPushPopover } from "./commit-push-popover";

function ThinkingShimmer() {
	const text = "Thinking";
	return (
		<span className="inline-block pt-2 text-sm [perspective:500px]">
			{text.split("").map((char, i) => (
				<span
					key={i}
					className="inline-block shimmer-wave-char"
					style={{ animationDelay: `${i * 0.1}s` }}
				>
					{char}
				</span>
			))}
			<span className="shimmer-wave-char inline-block" style={{ animationDelay: `${text.length * 0.1}s` }}>.</span>
			<span className="shimmer-wave-char inline-block" style={{ animationDelay: `${(text.length + 1) * 0.1}s` }}>.</span>
			<span className="shimmer-wave-char inline-block" style={{ animationDelay: `${(text.length + 2) * 0.1}s` }}>.</span>
		</span>
	);
}

function getProjectName(cwd: string) {
	const parts = cwd.split("/").filter(Boolean);
	return parts[parts.length - 1] || cwd;
}

const HARNESSES = [
	{
		id: "claude",
		label: "Claude",
		locked: false,
		icon: (
			<svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
				<path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
			</svg>
		),
	},
	{
		id: "codex",
		label: "Codex",
		locked: true,
		icon: (
			<svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" clipRule="evenodd">
				<path d="M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z" />
			</svg>
		),
	},
];

const CLAUDE_MODELS = [
	{ id: "claude-opus-4-6", label: "Claude Opus 4.6", hasThinking: true },
	{ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", hasThinking: true },
	{ id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", hasThinking: false },
];

type ThinkingLevel = "low" | "medium" | "high";

const THINKING_LEVELS: { id: ThinkingLevel; label: string; budget: number }[] = [
	{ id: "low", label: "Low", budget: 5000 },
	{ id: "medium", label: "Medium", budget: 20000 },
	{ id: "high", label: "High", budget: 80000 },
];

function ThinkingSelector({ selectedModel, thinkingLevel, onSelect }: { selectedModel: string; thinkingLevel: ThinkingLevel; onSelect: (level: ThinkingLevel) => void }) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const model = CLAUDE_MODELS.find((m) => m.id === selectedModel);
	const hasThinking = model?.hasThinking ?? false;

	if (!hasThinking) {
		return (
			<span className="flex items-center gap-1.5 cursor-default">
				<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<circle cx="8" cy="8" r="6" />
					<path d="M8 5v3" />
					<circle cx="8" cy="11" r="0.5" fill="currentColor" />
				</svg>
				Normal
			</span>
		);
	}

	const current = THINKING_LEVELS.find((l) => l.id === thinkingLevel)!;
	return (
		<div className="relative" ref={ref}>
			<button
				onClick={() => setOpen(!open)}
				className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
			>
				<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<path d="M8 1C5.2 1 3 3.2 3 6c0 1.9 1 3.4 2.5 4.3V12h5v-1.7C12 9.4 13 7.9 13 6c0-2.8-2.2-5-5-5z" />
					<path d="M6 14h4" />
					<path d="M7 12v2M9 12v2" />
				</svg>
				{current.label}
				<svg className={`w-3 h-3 text-[#666] transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
					<path d="M3 5l3 3 3-3" />
				</svg>
			</button>

			{open && (
				<div className="absolute bottom-full left-0 mb-2 bg-[#1b1b1b] border border-[#333] rounded-md overflow-hidden shadow-xl whitespace-nowrap">
					{THINKING_LEVELS.map((level) => {
						return (
							<button
								key={level.id}
								onClick={() => { onSelect(level.id); setOpen(false); }}
								className={`w-full flex items-center gap-3 px-3 py-2.5 text-[13px] transition-colors cursor-pointer ${
									thinkingLevel === level.id ? "bg-[#2a2b2e] text-white" : "text-[#999] hover:bg-[#1e1e1e] hover:text-white"
								}`}
							>
								<span className="flex-shrink-0">{level.label}</span>
								<span className="text-[11px] text-[#666] font-mono flex-shrink-0">{(level.budget / 1000).toFixed(0)}k tokens</span>
								{thinkingLevel === level.id && (
									<svg className="w-3.5 h-3.5 text-[#888] ml-auto flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<path d="M13 4L6 11L3 8" />
									</svg>
								)}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}

type ChatMode = "chat" | "build" | "plan";

const CHAT_MODES: { id: ChatMode; label: string; icon: JSX.Element }[] = [
	{
		id: "chat",
		label: "Chat",
		icon: (
			<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
				<path d="M2 3h12v8H4l-2 2V3z" />
			</svg>
		),
	},
	{
		id: "build",
		label: "Build",
		icon: (
			<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
				<path d="M9.5 1.5L6 8h4l-3.5 6.5" />
			</svg>
		),
	},
	{
		id: "plan",
		label: "Plan",
		icon: (
			<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
				<path d="M4 2v12M4 2l8 4-8 4" />
			</svg>
		),
	},
];

function ModeSelector({ chatMode, onSelect }: { chatMode: ChatMode; onSelect: (mode: ChatMode) => void }) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const current = CHAT_MODES.find((m) => m.id === chatMode)!;

	return (
		<div className="relative" ref={ref}>
			<button
				onClick={() => setOpen(!open)}
				className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
			>
				{current.icon}
				{current.label}
				<svg className={`w-3 h-3 text-[#666] transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
					<path d="M3 5l3 3 3-3" />
				</svg>
			</button>

			{open && (
				<div className="absolute bottom-full left-0 mb-2 bg-[#1b1b1b] border border-[#333] rounded-md overflow-hidden shadow-xl whitespace-nowrap">
					{CHAT_MODES.map((mode) => {
						const desc = mode.id === "chat" ? "General conversation" : mode.id === "build" ? "Write & edit code" : "Plan without coding";
						return (
							<button
								key={mode.id}
								onClick={() => { onSelect(mode.id); setOpen(false); }}
								className={`w-full flex items-center gap-3 px-3 py-2.5 text-[13px] transition-colors cursor-pointer ${
									chatMode === mode.id ? "bg-[#2a2b2e] text-white" : "text-[#999] hover:bg-[#1e1e1e] hover:text-white"
								}`}
							>
								<span className="flex-shrink-0">{mode.label}</span>
								<span className="text-[11px] text-[#666] flex-shrink-0">{desc}</span>
								{chatMode === mode.id && (
									<svg className="w-3.5 h-3.5 text-[#888] ml-auto flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<path d="M13 4L6 11L3 8" />
									</svg>
								)}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}

function HarnessDropdown({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const current = HARNESSES.find((h) => h.id === selected)!;

	return (
		<div className="relative" ref={ref}>
			<button
				onClick={() => setOpen(!open)}
				className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
			>
				{current.icon}
				{current.label}
				<svg className={`w-3 h-3 text-[#666] transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
					<path d="M3 5l3 3 3-3" />
				</svg>
			</button>

			{open && (
				<div className="absolute bottom-full left-0 mb-2 w-[180px] bg-[#1b1b1b] border border-[#333] rounded-md overflow-hidden shadow-xl">
					{HARNESSES.map((h) => (
						<button
							key={h.id}
							onClick={() => { if (!h.locked) { onSelect(h.id); setOpen(false); } }}
							className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] transition-colors ${
								h.locked ? "cursor-not-allowed opacity-50" :
								selected === h.id ? "bg-[#2a2b2e] text-white cursor-pointer" : "text-[#999] hover:bg-[#1e1e1e] hover:text-white cursor-pointer"
							}`}
						>
							{h.icon}
							{h.label}
							{h.locked ? (
								<svg className="w-3.5 h-3.5 ml-auto text-[#555]" viewBox="0 0 16 16" fill="currentColor">
									<path d="M11.5 7V5a3.5 3.5 0 10-7 0v2H3v7h10V7h-1.5zM6 5a2 2 0 114 0v2H6V5zm5.5 7.5h-7v-4h7v4z" />
								</svg>
							) : selected === h.id ? (
								<svg className="w-3.5 h-3.5 ml-auto text-[#888]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<path d="M13 4L6 11L3 8" />
								</svg>
							) : null}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

function ModelSelector({ selectedModel, onSelect }: { selectedModel: string; onSelect: (id: string) => void }) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const current = CLAUDE_MODELS.find((m) => m.id === selectedModel)!;

	return (
		<div className="relative" ref={ref}>
			<button
				onClick={() => setOpen(!open)}
				className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
			>
				{current.label}
				<svg className={`w-3 h-3 text-[#666] transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
					<path d="M3 5l3 3 3-3" />
				</svg>
			</button>

			{open && (
				<div className="absolute bottom-full left-0 mb-2 bg-[#1b1b1b] border border-[#333] rounded-md overflow-hidden shadow-xl whitespace-nowrap">
					{CLAUDE_MODELS.map((m) => (
						<button
							key={m.id}
							onClick={() => { onSelect(m.id); setOpen(false); }}
							className={`w-full flex items-center gap-3 px-3 py-2.5 text-[13px] transition-colors cursor-pointer ${
								selectedModel === m.id ? "bg-[#2a2b2e] text-white" : "text-[#999] hover:bg-[#1e1e1e] hover:text-white"
							}`}
						>
							<span className="flex-shrink-0">{m.label}</span>
							<span className="text-[11px] text-[#666] font-mono flex-shrink-0">{m.id}</span>
							{selectedModel === m.id && (
								<svg className="w-3.5 h-3.5 text-[#888] ml-auto flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<path d="M13 4L6 11L3 8" />
								</svg>
							)}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

function ContextBar({ usage }: { usage: import("../../bun/types").ContextUsage }) {
	const total = usage.inputTokens + usage.outputTokens;
	const pct = Math.min(Math.round((total / usage.contextWindow) * 100), 100);
	const fillColor = pct >= 80 ? "#f87171" : pct >= 60 ? "#fb923c" : "#555";
	const textColor = pct >= 80 ? "text-red-400" : pct >= 60 ? "text-orange-400" : "text-[#666]";
	const totalK = (total / 1000).toFixed(0);
	const windowK = (usage.contextWindow / 1000).toFixed(0);

	return (
		<span className={`flex items-center gap-1.5 text-[11px] font-mono ${textColor}`} title={`${totalK}k / ${windowK}k tokens (${pct}%)`}>
			<svg className="w-[60px] h-[6px]" viewBox="0 0 60 6" fill="none">
				<rect x="0" y="0" width="60" height="6" rx="1" fill="#2a2b2e" />
				<rect x="0" y="0" width={Math.round((pct / 100) * 60)} height="6" rx="1" fill={fillColor} />
			</svg>
			<span>{pct}%</span>
		</span>
	);
}

// Stable wrapper to avoid new onRetry closure per message on every render
const MemoMessage = memo(function MemoMessage({ message, isStreaming, onRetry }: { message: ChatMessage; isStreaming: boolean; onRetry: (id: string) => void }) {
	const handleRetry = useCallback(() => onRetry(message.id), [onRetry, message.id]);
	return <Message message={message} isStreaming={isStreaming} onRetry={handleRetry} />;
});

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

export function ChatView({ rpc, thread, messages, isStreaming, contextUsage, onSend, onRetry, onInterrupt, permissionRequest, onResolvePermission, onThreadUpdated, onToggleTerminal, showTerminal }: Props) {
	const [input, setInput] = useState("");
	const [cursorPos, setCursorPos] = useState(0);
	const [selectedHarness, setSelectedHarness] = useState("claude");
	const [selectedModel, setSelectedModel] = useState("claude-opus-4-6");
	const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>("medium");
	const [accessMode, setAccessMode] = useState<"full" | "restricted">("full");
	const [chatMode, setChatMode] = useState<ChatMode>("chat");
	const [images, setImages] = useState<(ImageAttachment & { id: string; base64: string })[]>([]);
	const [gitDiffOpen, setGitDiffOpen] = useState(false);
	const [commitPopoverOpen, setCommitPopoverOpen] = useState(false);
	const [userScrolledUp, setUserScrolledUp] = useState(false);
	const userScrolledUpRef = useRef(false);
	const bottomRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Per-thread draft persistence
	const draftsRef = useRef<Map<string, string>>(() => {
		// Load all drafts from localStorage on first render
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
	// Lazily initialize the ref (React passes the function through on first render)
	if (typeof draftsRef.current === "function") {
		draftsRef.current = (draftsRef.current as any)();
	}

	const saveDraftsToStorage = useCallback(() => {
		const obj: Record<string, string> = {};
		for (const [k, v] of draftsRef.current.entries()) {
			if (v.trim()) obj[k] = v;
		}
		try { localStorage.setItem("coder-drafts", JSON.stringify(obj)); } catch {}
	}, []);

	// Update draft in memory on every keystroke, persist on debounce
	const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const setInputWithDraft = useCallback((value: string) => {
		setInput(value);
		if (thread) {
			if (value.trim()) {
				draftsRef.current.set(thread.id, value);
			} else {
				draftsRef.current.delete(thread.id);
			}
			if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
			draftTimerRef.current = setTimeout(saveDraftsToStorage, 500);
		}
	}, [thread, saveDraftsToStorage]);

	// @ file mention autocomplete
	const fileMention = useFileMention(rpc, thread?.cwd, input, cursorPos);

	// Sync settings + draft from thread when switching
	const prevSyncThreadId = useRef<string | null>(null);
	useEffect(() => {
		if (!thread || thread.id === prevSyncThreadId.current) return;
		prevSyncThreadId.current = thread.id;
		setSelectedHarness(thread.harness ?? "claude");
		setSelectedModel(thread.model ?? "claude-opus-4-6");
		setThinkingLevel(thread.thinkingLevel ?? "medium");
		setAccessMode(thread.accessMode ?? "full");
		setChatMode(thread.chatMode ?? "chat");
		// Restore draft for this thread
		setInput(draftsRef.current.get(thread.id) ?? "");
		// Auto-focus chat input
		requestAnimationFrame(() => textareaRef.current?.focus());
	}, [thread]);

	// Check if project has CLAUDE.md (for init prompt)
	const [hasClaudeMd, setHasClaudeMd] = useState<boolean | null>(null);
	useEffect(() => {
		if (!rpc || !thread) { setHasClaudeMd(null); return; }
		setHasClaudeMd(null);
		rpc.request.checkFileExists({ cwd: thread.cwd, path: "CLAUDE.md" }).then((exists: boolean) => {
			setHasClaudeMd(exists);
		}).catch(() => setHasClaudeMd(null));
	}, [rpc, thread?.id, thread?.cwd]);

	// Persist settings on change
	const saveSettings = (harness: string, model: string, mode: "full" | "restricted", thinking: ThinkingLevel, modeVal?: ChatMode) => {
		if (!rpc || !thread) return;
		rpc.request.updateThreadSettings({ id: thread.id, harness, model, accessMode: mode, thinkingLevel: thinking, chatMode: modeVal })
			.then((updated: Thread) => onThreadUpdated(updated))
			.catch(() => {});
	};

	const changeHarness = (id: string) => {
		setSelectedHarness(id);
		saveSettings(id, selectedModel, accessMode, thinkingLevel, chatMode);
	};
	const changeModel = (id: string) => {
		setSelectedModel(id);
		saveSettings(selectedHarness, id, accessMode, thinkingLevel, chatMode);
	};
	const changeThinkingLevel = (level: ThinkingLevel) => {
		setThinkingLevel(level);
		saveSettings(selectedHarness, selectedModel, accessMode, level, chatMode);
	};
	const changeChatMode = (mode: ChatMode) => {
		setChatMode(mode);
		saveSettings(selectedHarness, selectedModel, accessMode, thinkingLevel, mode);
	};
	const changeAccessMode = () => {
		const next = accessMode === "full" ? "restricted" : "full";
		setAccessMode(next);
		saveSettings(selectedHarness, selectedModel, next, thinkingLevel, chatMode);
	};

	const scrollThrottleRef = useRef<number | null>(null);
	const handleScroll = useCallback(() => {
		if (scrollThrottleRef.current !== null) return;
		scrollThrottleRef.current = requestAnimationFrame(() => {
			scrollThrottleRef.current = null;
			const el = scrollContainerRef.current;
			if (!el) return;
			const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
			const wasScrolledUp = userScrolledUpRef.current;
			userScrolledUpRef.current = !isNearBottom;
			// Only trigger state update if the value actually changed
			if (wasScrolledUp !== !isNearBottom) {
				setUserScrolledUp(!isNearBottom);
			}
		});
	}, []);

	const scrollToBottom = useCallback(() => {
		userScrolledUpRef.current = false;
		setUserScrolledUp(false);
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	const prevThreadId = useRef(thread?.id);
	const prevIsStreaming = useRef(isStreaming);
	const threadJustSwitchedRef = useRef(false);
	useEffect(() => {
		const threadChanged = thread?.id !== prevThreadId.current;
		prevThreadId.current = thread?.id;
		if (threadChanged) {
			userScrolledUpRef.current = false;
			setUserScrolledUp(false);
			threadJustSwitchedRef.current = true;
			bottomRef.current?.scrollIntoView({ behavior: "instant" });
		} else if (threadJustSwitchedRef.current) {
			// Messages just loaded after a thread switch — scroll instantly, no animation
			threadJustSwitchedRef.current = false;
			userScrolledUpRef.current = false;
			setUserScrolledUp(false);
			bottomRef.current?.scrollIntoView({ behavior: "instant" });
		} else if (!userScrolledUpRef.current) {
			bottomRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [messages, thread?.id]);

	// Reset scroll lock when streaming ends
	useEffect(() => {
		if (prevIsStreaming.current && !isStreaming) {
			userScrolledUpRef.current = false;
			setUserScrolledUp(false);
		}
		prevIsStreaming.current = isStreaming;
	}, [isStreaming]);

	useEffect(() => {
		const el = textareaRef.current;
		if (el) {
			el.style.height = "auto";
			el.style.height = Math.min(el.scrollHeight, 200) + "px";
		}
	}, [input]);

	const handlePaste = useCallback((e: React.ClipboardEvent) => {
		const items = Array.from(e.clipboardData.items);
		for (const item of items) {
			if (item.type.startsWith("image/")) {
				e.preventDefault();
				const file = item.getAsFile();
				if (!file) continue;
				const reader = new FileReader();
				reader.onload = () => {
					const dataUrl = reader.result as string;
					const base64 = dataUrl.split(",")[1];
					setImages((prev) => [...prev, { id: crypto.randomUUID(), dataUrl, base64, mediaType: item.type }]);
				};
				reader.readAsDataURL(file);
			}
		}
	}, []);

	const handleDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		for (const file of Array.from(e.dataTransfer.files)) {
			if (file.type.startsWith("image/")) {
				const reader = new FileReader();
				reader.onload = () => {
					const dataUrl = reader.result as string;
					const base64 = dataUrl.split(",")[1];
					setImages((prev) => [...prev, { id: crypto.randomUUID(), dataUrl, base64, mediaType: file.type }]);
				};
				reader.readAsDataURL(file);
			}
		}
	}, []);

	const handleSend = () => {
		if ((!input.trim() && images.length === 0) || isStreaming) return;
		const model = selectedHarness === "claude" ? selectedModel : undefined;
		const modelDef = CLAUDE_MODELS.find((m) => m.id === selectedModel);
		const budget = modelDef?.hasThinking ? THINKING_LEVELS.find((l) => l.id === thinkingLevel)?.budget : undefined;
		if (images.length > 0) {
			const contentBlocks: any[] = [];
			for (const img of images) {
				contentBlocks.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
			}
			if (input.trim()) {
				contentBlocks.push({ type: "text", text: input.trim() });
			}
			const imageAttachments = images.map((img) => ({ mediaType: img.mediaType, dataUrl: img.dataUrl }));
			onSend(contentBlocks, model, accessMode, imageAttachments, budget, chatMode);
		} else {
			onSend(input.trim(), model, accessMode, undefined, budget, chatMode);
		}
		setInputWithDraft("");
		setImages([]);
	};

	// Group consecutive tool messages — memoized to avoid recomputation on every render
	// Must be before the early return to respect Rules of Hooks
	const groupedMessages = useMemo(() => groupToolMessages(messages), [messages]);

	const hasStreamingMessage = useMemo(() => messages.some((m) => m.role === "assistant" && m.isStreaming), [messages]);

	// Plan approval: detect when streaming ends in plan mode
	const [pendingPlanApproval, setPendingPlanApproval] = useState(false);
	const wasStreamingRef = useRef(false);
	useEffect(() => {
		if (isStreaming) {
			wasStreamingRef.current = true;
		} else if (wasStreamingRef.current) {
			wasStreamingRef.current = false;
			if (chatMode === "plan" && messages.length > 0) {
				const last = messages[messages.length - 1];
				if (last.role === "assistant" && last.content.trim()) {
					setPendingPlanApproval(true);
				}
			}
		}
	}, [isStreaming, chatMode, messages]);

	// Clear plan approval when user switches mode or thread
	useEffect(() => {
		setPendingPlanApproval(false);
	}, [thread?.id]);

	const handleAcceptPlan = () => {
		setPendingPlanApproval(false);
		// Find the last assistant message (the plan)
		const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
		if (!lastAssistant) return;
		const model = selectedHarness === "claude" ? selectedModel : undefined;
		const modelDef = CLAUDE_MODELS.find((m) => m.id === selectedModel);
		const budget = modelDef?.hasThinking ? THINKING_LEVELS.find((l) => l.id === thinkingLevel)?.budget : undefined;
		// Switch to build mode and send the plan as implementation instruction
		setChatMode("build");
		saveSettings(selectedHarness, selectedModel, accessMode, thinkingLevel, "build");
		onSend("Implement the plan above.", model, accessMode, undefined, budget, "build");
	};

	const handleDeclinePlan = () => {
		setPendingPlanApproval(false);
	};

	if (!thread) {
		return (
			<div className="flex-1 flex flex-col min-h-0 bg-[#181818]">
				<div className="h-[52px] flex-shrink-0 electrobun-webkit-app-region-drag" />
				<div className="flex-1 flex flex-col items-center justify-center text-[#444]">
					<div className="text-5xl mb-4 font-mono font-bold">{"</>"}</div>
					<div className="text-lg font-semibold text-[#555]">Coder</div>
					<div className="text-sm mt-1 text-[#444]">Select or create a project to start</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#181818] relative">
			{/* Top Bar */}
			<div className="flex items-center justify-between px-4 h-[52px] border-b border-[#2a2b2e] bg-[#1e1e1e] electrobun-webkit-app-region-drag">
				<div className="flex items-center gap-3 min-w-0">
					<span className="text-[#e0e0e0] text-sm font-medium truncate max-w-[400px]">
						{thread.title}
					</span>
					<span className="text-[10px] text-[#888] bg-[#2a2b2e] px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0">
						{getProjectName(thread.cwd)}
					</span>
				</div>
				<div className="flex items-center gap-2 ml-4 flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
					{contextUsage && <ContextBar usage={contextUsage} />}
						<div className="relative">
						<button
							onClick={() => setCommitPopoverOpen(!commitPopoverOpen)}
							className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors cursor-pointer border ${
								commitPopoverOpen
									? "text-emerald-400 bg-emerald-600/10 border-emerald-600/20 hover:bg-emerald-600/20"
									: "text-[#999] bg-transparent border-[#2a2b2e] hover:text-white hover:bg-[#2a2b2e]"
							}`}
							title="Commit & Push"
						>
							<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<path d="M8 13V3M4 7l4-4 4 4" />
							</svg>
							Push
						</button>
						{commitPopoverOpen && (
							<CommitPushPopover rpc={rpc} cwd={thread.cwd} onClose={() => setCommitPopoverOpen(false)} />
						)}
					</div>
					<button
						onClick={() => setGitDiffOpen(!gitDiffOpen)}
						className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors cursor-pointer border ${
							gitDiffOpen
								? "text-violet-400 bg-violet-600/10 border-violet-600/20 hover:bg-violet-600/20"
								: "text-[#999] bg-transparent border-[#2a2b2e] hover:text-white hover:bg-[#2a2b2e]"
						}`}
						title="Git changes"
					>
						<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
							<path d="M12 2v6M12 12v2M4 2v2M4 8v6" />
							<circle cx="4" cy="6" r="2" />
							<circle cx="12" cy="10" r="2" />
						</svg>
						Diff
					</button>
					{onToggleTerminal && (
						<button
							onClick={onToggleTerminal}
							className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors cursor-pointer border ${
								showTerminal
									? "text-cyan-400 bg-cyan-600/10 border-cyan-600/20 hover:bg-cyan-600/20"
									: "text-[#999] bg-transparent border-[#2a2b2e] hover:text-white hover:bg-[#2a2b2e]"
							}`}
							title="Toggle Terminal (Ctrl+`)"
						>
							<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<path d="M4 5l3 3-3 3" />
								<path d="M9 11h3" />
							</svg>
							Terminal
						</button>
					)}
				</div>
			</div>

			{/* Messages */}
			<div className="flex-1 overflow-y-auto px-6 py-6 relative" ref={scrollContainerRef} onScroll={handleScroll}>
				<div className="max-w-4xl mx-auto">
					{messages.length === 0 && !isStreaming && (
						<div className="h-full flex flex-col items-center justify-center text-[#444] text-sm py-20 gap-4">
							<span>Send a message to start coding</span>
							{hasClaudeMd === false && selectedHarness === "claude" && (
								<button
									onClick={() => {
										const model = selectedHarness === "claude" ? selectedModel : undefined;
										const modelDef = CLAUDE_MODELS.find((m) => m.id === selectedModel);
										const budget = modelDef?.hasThinking ? THINKING_LEVELS.find((l) => l.id === thinkingLevel)?.budget : undefined;
										onSend("/init", model, accessMode, undefined, budget, chatMode);
										// Re-check after a delay to update the state
										setTimeout(() => {
											rpc?.request.checkFileExists({ cwd: thread!.cwd, path: "CLAUDE.md" }).then((exists: boolean) => setHasClaudeMd(exists)).catch(() => {});
										}, 5000);
									}}
									className="flex items-center gap-2 px-4 py-2 text-[13px] text-[#999] border border-[#333] rounded-md hover:text-white hover:border-[#555] hover:bg-[#232428] transition-colors cursor-pointer"
								>
									<svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
										<path d="M8 2v12M5 5l3-3 3 3" />
									</svg>
									Initialize CLAUDE.md
								</button>
							)}
						</div>
					)}
					{groupedMessages.map((item, i) => {
						if (item.type === "tool-group") {
							return <ToolCallGroup key={`tg-${item.messages[0]?.id ?? i}`} tools={item.messages} />;
						}
						if (item.type === "file-edit") {
							const tool = item.message;
							return (
								<div key={tool.id} className="my-5">
									<DiffView
										filePath={String(tool.toolInput?.file_path ?? "")}
										oldStr={String(tool.toolInput?.old_string ?? "")}
										newStr={String(tool.toolInput?.new_string ?? "")}
									/>
								</div>
							);
						}
						return (
							<MemoMessage
								key={item.message.id}
								message={item.message}
								isStreaming={isStreaming}
								onRetry={onRetry}
							/>
						);
					})}
					{isStreaming && !hasStreamingMessage && (
						<ThinkingShimmer />
					)}
					<div ref={bottomRef} />
				</div>
				{/* Floating scroll-to-bottom button */}
				{userScrolledUp && messages.length > 0 && (
					<div className="sticky bottom-4 flex justify-center pointer-events-none">
						<button
							onClick={scrollToBottom}
							className="pointer-events-auto bg-[#232428] border border-[#2a2b2e] rounded-md px-4 py-2 text-[13px] text-[#999] hover:text-white hover:bg-[#2a2b2e] transition-colors cursor-pointer shadow-lg flex items-center gap-2"
						>
							<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<path d="M8 3v10M4 9l4 4 4-4" />
							</svg>
							Scroll to bottom
						</button>
					</div>
				)}
			</div>

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

			{/* Input Area */}
			<div className="px-6 pb-12">
				<div className="max-w-4xl mx-auto">
					<div
						className="bg-[#1b1b1b] rounded-md"
						onDrop={handleDrop}
						onDragOver={(e) => e.preventDefault()}
					>
						{/* Text input */}
						<div className="px-5 pt-4 pb-2 relative">
							{fileMention.isOpen && (
								<FileMentionPopup
									items={fileMention.items}
									selectedIndex={fileMention.selectedIndex}
									onSelect={(entry) => {
										const result = fileMention.applySelection(entry);
										if (result) {
											setInputWithDraft(result.newInput);
											setCursorPos(result.newCursorPos);
											requestAnimationFrame(() => {
												textareaRef.current?.setSelectionRange(result.newCursorPos, result.newCursorPos);
												textareaRef.current?.focus();
											});
										}
									}}
								/>
							)}
							<textarea
								ref={textareaRef}
								value={input}
								onChange={(e) => {
									setInputWithDraft(e.target.value);
									setCursorPos(e.target.selectionStart ?? 0);
								}}
								onSelect={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
								onPaste={handlePaste}
								onKeyDown={(e) => {
									const mentionResult = fileMention.handleKeyDown(e);
									if (mentionResult && typeof mentionResult === "object") {
										setInputWithDraft(mentionResult.newInput);
										setCursorPos(mentionResult.newCursorPos);
										requestAnimationFrame(() => {
											textareaRef.current?.setSelectionRange(mentionResult.newCursorPos, mentionResult.newCursorPos);
										});
										return;
									}
									if (mentionResult === true) return;

									if (e.key === "Tab" && e.shiftKey) {
										e.preventDefault();
										const modes: ChatMode[] = ["chat", "build", "plan"];
										const idx = modes.indexOf(chatMode);
										const next = modes[(idx + 1) % modes.length];
										changeChatMode(next);
									}
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										handleSend();
									}
								}}
								placeholder="Ask anything, @tag files/folder, or use /model"
								rows={1}
								className="w-full bg-transparent text-[#d9d9d9] placeholder-[#4e4e4e] text-[14px] resize-none outline-none min-h-[24px]"
								style={{ fontFamily: "'Geist Mono', monospace" }}
							/>
						</div>
						{/* Image thumbnails */}
						{images.length > 0 && (
							<div className="flex items-center gap-2 px-5 pb-2">
								{images.map((img) => (
									<div key={img.id} className="relative group/thumb">
										<img src={img.dataUrl} alt="" className="w-16 h-16 object-cover rounded-md border border-[#2a2b2e]" />
										<button
											onClick={() => setImages((prev) => prev.filter((i) => i.id !== img.id))}
											className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#333] border border-[#555] rounded-md flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity cursor-pointer hover:bg-[#555]"
										>
											<svg className="w-2.5 h-2.5 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
												<path d="M4 4l8 8M12 4l-8 8" />
											</svg>
										</button>
									</div>
								))}
							</div>
						)}
						{/* Bottom bar */}
						<div className="flex items-center justify-between px-5 py-3">
							<div className="flex items-center gap-5 text-[13px] text-[#d9d9d9]" style={{ fontFamily: "'Geist Mono', monospace" }}>
								<input
									ref={fileInputRef}
									type="file"
									accept="image/*"
									multiple
									className="hidden"
									onChange={(e) => {
										for (const file of Array.from(e.target.files ?? [])) {
											if (file.type.startsWith("image/")) {
												const reader = new FileReader();
												reader.onload = () => {
													const dataUrl = reader.result as string;
													const base64 = dataUrl.split(",")[1];
													setImages((prev) => [...prev, { id: crypto.randomUUID(), dataUrl, base64, mediaType: file.type }]);
												};
												reader.readAsDataURL(file);
											}
										}
										e.target.value = "";
									}}
								/>
								<button
									onClick={() => fileInputRef.current?.click()}
									className="flex items-center justify-center w-6 h-6 rounded-md text-[#666] hover:text-[#ccc] hover:bg-[#2a2b2e] transition-colors cursor-pointer"
									title="Add image"
								>
									<svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
										<path d="M8 3v10M3 8h10" />
									</svg>
								</button>
								<HarnessDropdown selected={selectedHarness} onSelect={changeHarness} />
								{selectedHarness === "claude" && (
									<>
										<ModelSelector selectedModel={selectedModel} onSelect={changeModel} />
										<ThinkingSelector selectedModel={selectedModel} thinkingLevel={thinkingLevel} onSelect={changeThinkingLevel} />
									</>
								)}
								<ModeSelector chatMode={chatMode} onSelect={changeChatMode} />
								<button
									onClick={changeAccessMode}
									className="flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
								>
									{accessMode === "full" ? (
										<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
											<rect x="1" y="7" width="14" height="8" rx="2" />
											<path d="M4 7V5a4 4 0 018 0" />
										</svg>
									) : (
										<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
											<rect x="1" y="7" width="14" height="8" rx="2" />
											<path d="M4 7V5a4 4 0 018 0v2" />
										</svg>
									)}
									{accessMode === "full" ? "Full Access" : "Restricted"}
								</button>
							</div>
							{isStreaming ? (
								<button
									onClick={onInterrupt}
									className="w-8 h-8 rounded-md bg-gradient-to-b from-[#e0e0e0] to-[#c0c0c0] flex items-center justify-center hover:from-white hover:to-[#d0d0d0] transition-all cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.3)] active:shadow-[0_0px_1px_rgba(0,0,0,0.3)] active:translate-y-[1px]"
								>
									<svg className="w-3 h-3" viewBox="0 0 12 12" fill="#1b1b1b">
										<rect x="2.5" y="2.5" width="7" height="7" rx="1" />
									</svg>
								</button>
							) : (
								<button
									onClick={handleSend}
									disabled={!input.trim()}
									className="w-8 h-8 rounded-md bg-gradient-to-b from-[#e0e0e0] to-[#c0c0c0] flex items-center justify-center hover:from-white hover:to-[#d0d0d0] transition-all disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.3)] active:shadow-[0_0px_1px_rgba(0,0,0,0.3)] active:translate-y-[1px]"
								>
									<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="#1b1b1b">
										<path d="M8 2l6 6H9v6H7V8H2z" />
									</svg>
								</button>
							)}
						</div>
					</div>
				</div>
			</div>

			<GitDiffSidebar
				rpc={rpc}
				cwd={thread.cwd}
				isOpen={gitDiffOpen}
				onClose={() => setGitDiffOpen(false)}
			/>
		</div>
	);
}

// Group consecutive tool messages together
type GroupedItem =
	| { type: "message"; message: ChatMessage }
	| { type: "tool-group"; messages: ChatMessage[] }
	| { type: "file-edit"; message: ChatMessage };

function groupToolMessages(messages: ChatMessage[]): GroupedItem[] {
	const result: GroupedItem[] = [];
	let toolBuffer: ChatMessage[] = [];

	const flushTools = () => {
		if (toolBuffer.length > 0) {
			result.push({ type: "tool-group", messages: [...toolBuffer] });
			toolBuffer = [];
		}
	};

	for (const msg of messages) {
		if (msg.role === "tool" && msg.toolName === "Edit" && msg.toolInput && "old_string" in msg.toolInput && "new_string" in msg.toolInput) {
			flushTools();
			result.push({ type: "file-edit", message: msg });
		} else if (msg.role === "tool" && msg.toolName !== "Agent") {
			toolBuffer.push(msg);
		} else if (msg.role === "tool" && msg.toolName === "Agent") {
			// Skip Agent tool calls — handled by agent message rendering
		} else {
			flushTools();
			result.push({ type: "message", message: msg });
		}
	}
	flushTools();
	return result;
}

const TOOL_ICON_MAP: Record<string, JSX.Element> = {
	Bash: (
		<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
			<path d="M4 5l3 3-3 3" /><path d="M9 11h3" />
		</svg>
	),
	Read: (
		<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
			<path d="M3 2h7l3 3v9H3V2z" /><path d="M6 8h4M6 11h2" />
		</svg>
	),
	Write: (
		<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
			<path d="M3 2h7l3 3v9H3V2z" /><path d="M8 7v4M6 9h4" />
		</svg>
	),
	Edit: (
		<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
			<path d="M11 2l3 3-9 9H2v-3z" />
		</svg>
	),
	Glob: (
		<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
			<circle cx="7" cy="7" r="4" /><path d="M12 12l-2.5-2.5" />
		</svg>
	),
	Grep: (
		<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
			<circle cx="7" cy="7" r="4" /><path d="M12 12l-2.5-2.5" /><path d="M5.5 7h3" />
		</svg>
	),
	WebFetch: (
		<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
			<circle cx="8" cy="8" r="6" /><path d="M2 8h12" /><ellipse cx="8" cy="8" rx="3" ry="6" />
		</svg>
	),
	WebSearch: (
		<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
			<circle cx="7" cy="7" r="4" /><path d="M12 12l-2.5-2.5" /><circle cx="7" cy="7" r="1.5" />
		</svg>
	),
};

const ToolCallGroup = memo(function ToolCallGroup({ tools }: { tools: ChatMessage[] }) {
	const [expanded, setExpanded] = useState(false);

	const uniqueToolNames = useMemo(() => {
		const seen = new Set<string>();
		for (const t of tools) {
			if (t.toolName) seen.add(t.toolName);
		}
		return Array.from(seen);
	}, [tools]);

	return (
		<div className="my-5">
			<div className="bg-[#232428] rounded-md border border-[#2a2b2e] overflow-hidden">
				<button
					onClick={() => setExpanded(!expanded)}
					className="w-full flex items-center gap-2.5 px-5 py-3 text-[13px] text-[#777] hover:bg-[#282930] cursor-pointer transition-colors"
				>
					<svg
						className={`w-3 h-3 transition-transform flex-shrink-0 ${expanded ? "rotate-90" : ""}`}
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M6 4l4 4-4 4" />
					</svg>
					<span className="uppercase tracking-wider font-medium">
						Tool Calls ({tools.length})
					</span>
					<span className="flex items-center gap-1.5 ml-1 text-[#555]">
						{uniqueToolNames.map((name) => (
							<span key={name} title={name}>
								{TOOL_ICON_MAP[name] ?? null}
							</span>
						))}
					</span>
				</button>
				{expanded && (
					<div className="px-5 pb-4 space-y-1">
						{tools.map((tool) => (
							<div key={tool.id}>
								<div className="flex items-center gap-3 py-1">
									<span className="w-4 h-4 text-[#555] flex-shrink-0">{TOOL_ICON_MAP[tool.toolName ?? ""] ?? <span className="block w-[6px] h-[6px] rounded-full bg-[#555] mt-[5px] ml-[5px]" />}</span>
									<span className="text-[#888] text-[13px] font-mono">
										<span className="text-[#999]">{formatToolLabel(tool.toolName ?? "")}</span>
										{tool.toolInput && Object.keys(tool.toolInput).length > 0 && (
											<span className="text-[#666]">
												{" "}
												{formatToolInput(tool.toolInput)}
											</span>
										)}
									</span>
								</div>
								{tool.toolName === "Edit" && tool.toolInput && "old_string" in tool.toolInput && "new_string" in tool.toolInput && (
									<DiffView
										filePath={String(tool.toolInput.file_path ?? "")}
										oldStr={String(tool.toolInput.old_string)}
										newStr={String(tool.toolInput.new_string)}
									/>
								)}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
});

function formatToolLabel(toolName: string): string {
	const labels: Record<string, string> = {
		Bash: "Command run complete",
		Read: "File read complete",
		Write: "File write complete",
		Edit: "File edit complete",
		Glob: "File search complete",
		Grep: "Content search complete",
		WebFetch: "Web fetch complete",
		WebSearch: "Web search complete",
	};
	return labels[toolName] ?? `${toolName} complete`;
}

function formatToolInput(input: Record<string, unknown>): string {
	const command = input.command ?? input.file_path ?? input.pattern ?? input.query ?? input.url;
	if (typeof command === "string") {
		const short = command.length > 80 ? command.slice(0, 80) + "..." : command;
		return short;
	}
	return "";
}

// --- Inline permission / question panels ---

type AskQuestion = {
	question: string;
	header: string;
	options: { label: string; description: string }[];
	multiSelect: boolean;
};

function isAskUserQuestion(request: PermissionRequest): boolean {
	return (
		request.toolName === "AskUserQuestion" &&
		Array.isArray((request.toolInput as any)?.questions)
	);
}

function AskQuestionPanel({ request, onResolve }: { request: PermissionRequest; onResolve: (allow: boolean, updatedInput?: Record<string, unknown>) => void }) {
	const questions = (request.toolInput as { questions: AskQuestion[] }).questions;
	const [currentIdx, setCurrentIdx] = useState(0);
	const [answers, setAnswers] = useState<Record<string, string>>({});
	const [customInput, setCustomInput] = useState("");

	const q = questions[currentIdx];
	const total = questions.length;
	const selectedAnswer = answers[q.question];

	const selectOption = (label: string) => {
		const newAnswers = { ...answers, [q.question]: label };
		setAnswers(newAnswers);
		setCustomInput("");

		// Auto-advance to next question or submit
		if (currentIdx < total - 1) {
			setTimeout(() => setCurrentIdx(currentIdx + 1), 150);
		} else {
			setTimeout(() => onResolve(true, { ...request.toolInput, answers: newAnswers }), 150);
		}
	};

	const submitCustom = () => {
		if (!customInput.trim()) return;
		selectOption(customInput.trim());
	};

	return (
		<div className="border-t border-[#2a2b2e] bg-[#1b1b1b]">
			<div className="max-w-3xl mx-auto px-6 py-4">
				{/* Header */}
				<div className="flex items-center justify-between mb-4">
					<p className="text-[#e0e0e0] text-[15px] font-medium">{q.question}</p>
					<div className="flex items-center gap-2 flex-shrink-0 ml-4">
						{total > 1 && (
							<div className="flex items-center gap-1.5 text-[12px] text-[#666]">
								<button
									onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
									disabled={currentIdx === 0}
									className="hover:text-[#aaa] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
								>
									<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 4L6 8l4 4" /></svg>
								</button>
								<span>{currentIdx + 1} sur {total}</span>
								<button
									onClick={() => setCurrentIdx(Math.min(total - 1, currentIdx + 1))}
									disabled={currentIdx === total - 1}
									className="hover:text-[#aaa] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
								>
									<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 4l4 4-4 4" /></svg>
								</button>
							</div>
						)}
						<button
							onClick={() => onResolve(false)}
							className="text-[#666] hover:text-[#aaa] ml-1"
						>
							<svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
						</button>
					</div>
				</div>

				{/* Options */}
				<div className="flex flex-col">
					{q.options.map((opt, i) => (
						<button
							key={opt.label}
							onClick={() => selectOption(opt.label)}
							className={`flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-[#232428] last:border-b-0 ${
								selectedAnswer === opt.label
									? "bg-[#232428] text-white"
									: "text-[#b0b0b0] hover:bg-[#1e1e1e]"
							}`}
						>
							<span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-medium flex-shrink-0 ${
								selectedAnswer === opt.label ? "bg-[#e0e0e0] text-[#1b1b1b]" : "bg-[#2a2b2e] text-[#888]"
							}`}>
								{i + 1}
							</span>
							<span className="text-[14px]">{opt.label}</span>
							{selectedAnswer === opt.label && (
								<svg className="w-4 h-4 ml-auto text-[#888]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 4l4 4-4 4" /></svg>
							)}
						</button>
					))}

					{/* Custom input row */}
					<div className="flex items-center gap-3 px-3 py-3">
						<span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#2a2b2e] text-[#888]">
							<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M11 2L5 14M3 5l2 2-2 2M11 9l2 2-2 2" /></svg>
						</span>
						<input
							type="text"
							value={customInput}
							onChange={(e) => setCustomInput(e.target.value)}
							onKeyDown={(e) => { if (e.key === "Enter") submitCustom(); }}
							placeholder="Other..."
							className="flex-1 bg-transparent text-[14px] text-[#999] placeholder-[#555] outline-none"
						/>
						<button
							onClick={() => onResolve(false)}
							className="px-3 py-1 text-[12px] text-[#888] border border-[#333] rounded hover:border-[#555] hover:text-white transition-colors cursor-pointer"
						>
							Skip
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function formatPermissionInput(toolName: string, toolInput: Record<string, unknown>): string {
	if (toolName === "WebSearch" && toolInput.query) return String(toolInput.query);
	if (toolName === "WebFetch" && toolInput.url) return String(toolInput.url);
	if (toolName === "Bash" && toolInput.command) return String(toolInput.command);
	if (toolName === "Read" && toolInput.file_path) return String(toolInput.file_path);
	if (toolName === "Write" && toolInput.file_path) return String(toolInput.file_path);
	if (toolName === "Edit" && toolInput.file_path) return String(toolInput.file_path);
	if (toolName === "Glob" && toolInput.pattern) return String(toolInput.pattern);
	if (toolName === "Grep" && toolInput.pattern) return String(toolInput.pattern);
	const first = Object.values(toolInput).find((v) => typeof v === "string");
	return typeof first === "string" ? first : "";
}

const TOOL_ICONS: Record<string, string> = {
	WebSearch: "Search the web",
	WebFetch: "Fetch a webpage",
	Bash: "Run a command",
	Read: "Read a file",
	Write: "Write a file",
	Edit: "Edit a file",
	Glob: "Search files",
	Grep: "Search content",
};

function PermissionPanel({ request, onResolve }: { request: PermissionRequest; onResolve: (allow: boolean, updatedInput?: Record<string, unknown>) => void }) {
	const detail = formatPermissionInput(request.toolName, request.toolInput);
	const description = TOOL_ICONS[request.toolName] ?? `Use ${request.toolName}`;

	return (
		<div className="border-t border-[#2a2b2e] bg-[#1b1b1b]">
			<div className="max-w-4xl mx-auto px-6 py-3">
				<div className="flex items-center gap-3">
					{/* Left: info */}
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 mb-0.5">
							<span className="text-[13px] text-[#888]">{description}</span>
							<span className="text-[11px] text-[#555] bg-[#232428] px-1.5 py-0.5 rounded font-mono">{request.toolName}</span>
						</div>
						{detail && (
							<p className="text-[14px] text-[#e0e0e0] truncate">{detail}</p>
						)}
					</div>
					{/* Right: actions */}
					<div className="flex items-center gap-2 flex-shrink-0">
						<button
							onClick={() => onResolve(false)}
							className="px-4 py-1.5 text-[13px] text-[#999] hover:text-white transition-colors cursor-pointer"
						>
							Deny
						</button>
						<button
							onClick={() => onResolve(true)}
							className="px-4 py-1.5 text-[13px] bg-[#e0e0e0] text-[#1b1b1b] font-medium rounded-md hover:bg-white transition-colors cursor-pointer"
						>
							Allow
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function PlanApprovalPanel({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
	return (
		<div className="border-t border-[#2a2b2e] bg-[#1b1b1b]">
			<div className="max-w-4xl mx-auto px-6 py-3">
				<div className="flex items-center gap-3">
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 mb-0.5">
							<svg className="w-4 h-4 text-[#888]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<path d="M4 2v12M4 2l8 4-8 4" />
							</svg>
							<span className="text-[13px] text-[#888]">Plan ready</span>
						</div>
						<p className="text-[14px] text-[#e0e0e0]">Accept to implement this plan, or decline to continue chatting.</p>
					</div>
					<div className="flex items-center gap-2 flex-shrink-0">
						<button
							onClick={onDecline}
							className="px-4 py-1.5 text-[13px] text-[#999] hover:text-white transition-colors cursor-pointer"
						>
							Decline
						</button>
						<button
							onClick={onAccept}
							className="px-4 py-1.5 text-[13px] bg-[#e0e0e0] text-[#1b1b1b] font-medium rounded-md hover:bg-white transition-colors cursor-pointer"
						>
							Accept & Build
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
