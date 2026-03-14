import { useState } from "react";
import type { Thread } from "../../bun/types";
import { ContextBar } from "./chat-toolbar-selectors";
import { GitDiffSidebar } from "./git-diff-sidebar";
import { CommitPushPopover } from "./commit-push-popover";

function getProjectName(cwd: string) {
	const parts = cwd.split("/").filter(Boolean);
	return parts[parts.length - 1] || cwd;
}

type ChatToolbarProps = {
	rpc: any;
	thread: Thread;
	contextUsage: import("../../bun/types").ContextUsage | null;
	showTerminal?: boolean;
	onToggleTerminal?: () => void;
};

export function ChatToolbar({ rpc, thread, contextUsage, showTerminal, onToggleTerminal }: ChatToolbarProps) {
	const [gitDiffOpen, setGitDiffOpen] = useState(false);
	const [commitPopoverOpen, setCommitPopoverOpen] = useState(false);

	return (
		<>
			<div
				className="flex items-center justify-between px-4 h-[52px] border-b border-[#2a2b2e] bg-[#1e1e1e] electrobun-webkit-app-region-drag"
				onDoubleClick={() => rpc.request.toggleMaximize({})}
			>
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

			<GitDiffSidebar
				rpc={rpc}
				cwd={thread.cwd}
				isOpen={gitDiffOpen}
				onClose={() => setGitDiffOpen(false)}
			/>
		</>
	);
}
