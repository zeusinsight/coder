import { useState, useRef, useEffect } from "react";

// ─── Types & Constants ────────────────────────────────────────────────────────

export type ThinkingLevel = "low" | "medium" | "high";
export type ChatMode = "chat" | "build" | "plan";

export const HARNESSES = [
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

export const CLAUDE_MODELS = [
	{ id: "claude-opus-4-6", label: "Claude Opus 4.6", hasThinking: true },
	{ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", hasThinking: true },
	{ id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", hasThinking: false },
];

export const THINKING_LEVELS: { id: ThinkingLevel; label: string; budget: number }[] = [
	{ id: "low", label: "Low", budget: 5000 },
	{ id: "medium", label: "Medium", budget: 20000 },
	{ id: "high", label: "High", budget: 80000 },
];

export const CHAT_MODES: { id: ChatMode; label: string; icon: JSX.Element }[] = [
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

// ─── Dropdown Components ──────────────────────────────────────────────────────

export function ThinkingSelector({ selectedModel, thinkingLevel, onSelect }: { selectedModel: string; thinkingLevel: ThinkingLevel; onSelect: (level: ThinkingLevel) => void }) {
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
					{THINKING_LEVELS.map((level) => (
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
					))}
				</div>
			)}
		</div>
	);
}

export function ModeSelector({ chatMode, onSelect }: { chatMode: ChatMode; onSelect: (mode: ChatMode) => void }) {
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

export function HarnessDropdown({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
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

export function ModelSelector({ selectedModel, onSelect }: { selectedModel: string; onSelect: (id: string) => void }) {
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

export function ContextBar({ usage }: { usage: import("../../bun/types").ContextUsage }) {
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
