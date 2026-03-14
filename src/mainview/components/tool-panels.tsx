import { useState, useMemo, memo } from "react";
import type { ChatMessage, ImageAttachment } from "../hooks/use-chat";
import type { PermissionRequest } from "../../bun/types";
import { DiffView } from "./diff-view";

// ─── Message Grouping ─────────────────────────────────────────────────────────

export type GroupedItem =
	| { type: "message"; message: ChatMessage }
	| { type: "tool-group"; messages: ChatMessage[] }
	| { type: "file-edit"; message: ChatMessage };

export function groupToolMessages(messages: ChatMessage[]): GroupedItem[] {
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

// ─── Tool Call Group ──────────────────────────────────────────────────────────

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

export const ToolCallGroup = memo(function ToolCallGroup({ tools }: { tools: ChatMessage[] }) {
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

// ─── Permission / Question Panels ─────────────────────────────────────────────

type AskQuestion = {
	question: string;
	header: string;
	options: { label: string; description: string }[];
	multiSelect: boolean;
};

export function isAskUserQuestion(request: PermissionRequest): boolean {
	return (
		request.toolName === "AskUserQuestion" &&
		Array.isArray((request.toolInput as any)?.questions)
	);
}

export function AskQuestionPanel({ request, onResolve }: { request: PermissionRequest; onResolve: (allow: boolean, updatedInput?: Record<string, unknown>) => void }) {
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
						<button onClick={() => onResolve(false)} className="text-[#666] hover:text-[#aaa] ml-1">
							<svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
						</button>
					</div>
				</div>
				<div className="flex flex-col">
					{q.options.map((opt, i) => (
						<button
							key={opt.label}
							onClick={() => selectOption(opt.label)}
							className={`flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-[#232428] last:border-b-0 ${
								selectedAnswer === opt.label ? "bg-[#232428] text-white" : "text-[#b0b0b0] hover:bg-[#1e1e1e]"
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

export function PermissionPanel({ request, onResolve }: { request: PermissionRequest; onResolve: (allow: boolean, updatedInput?: Record<string, unknown>) => void }) {
	const detail = formatPermissionInput(request.toolName, request.toolInput);
	const description = TOOL_ICONS[request.toolName] ?? `Use ${request.toolName}`;

	return (
		<div className="border-t border-[#2a2b2e] bg-[#1b1b1b]">
			<div className="max-w-4xl mx-auto px-6 py-3">
				<div className="flex items-center gap-3">
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 mb-0.5">
							<span className="text-[13px] text-[#888]">{description}</span>
							<span className="text-[11px] text-[#555] bg-[#232428] px-1.5 py-0.5 rounded font-mono">{request.toolName}</span>
						</div>
						{detail && <p className="text-[14px] text-[#e0e0e0] truncate">{detail}</p>}
					</div>
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

export function PlanApprovalPanel({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
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
