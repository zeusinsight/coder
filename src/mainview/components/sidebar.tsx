import { useState, useMemo, useEffect, useCallback, memo } from "react";
import type { Thread } from "../../bun/types";
import type { ThreadStatus } from "../hooks/use-chat";

function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<kbd
			className={`inline-flex items-center justify-center h-5 min-w-5 px-1 rounded border border-[#444] bg-[#2a2a2a] text-[11px] text-[#999] font-mono leading-none ${className ?? ""}`}
		>
			{children}
		</kbd>
	);
}

function DeleteConfirmDialog({ threadTitle, onConfirm, onCancel }: { threadTitle: string; onConfirm: () => void; onCancel: () => void }) {
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCancel();
			if (e.key === "Enter" && e.metaKey) onConfirm();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onConfirm, onCancel]);

	return (
		<div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/50" onClick={onCancel}>
			<div
				className="bg-[#1e1e1e] border border-[#333] rounded-lg p-5 w-[340px] shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				<h3 className="text-white text-[15px] font-semibold mb-2">Delete thread</h3>
				<p className="text-[#999] text-[13px] mb-5">
					Are you sure you want to delete <span className="text-[#ccc]">"{threadTitle}"</span>? This cannot be undone.
				</p>
				<div className="flex items-center justify-end gap-2">
					<button
						onClick={onCancel}
						className="px-3 py-1.5 text-[13px] text-[#999] hover:text-white rounded border border-[#333] hover:border-[#555] transition-colors cursor-pointer"
					>
						Cancel
					</button>
					<button
						onClick={onConfirm}
						className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-white bg-red-600 hover:bg-red-500 rounded transition-colors cursor-pointer"
					>
						Delete
						<span className="flex items-center gap-0.5">
							<Kbd>&#8984;</Kbd>
							<Kbd>&#9166;</Kbd>
						</span>
					</button>
				</div>
			</div>
		</div>
	);
}

type Props = {
	threads: Thread[];
	activeThreadId: string | null;
	getThreadStatus: (threadId: string) => ThreadStatus;
	onSelect: (id: string) => void;
	onAddProject: () => void;
	onNewThread: (cwd: string) => void;
	onDelete: (id: string) => void;
	onRename: (id: string, title: string) => void;
	onPin: (id: string, pinned: boolean) => void;
	onOpenSettings: () => void;
};

function getProjectName(cwd: string) {
	const parts = cwd.split("/").filter(Boolean);
	return parts[parts.length - 1] || cwd;
}

const ThreadItem = memo(function ThreadItem({
	thread,
	isActive,
	status,
	editingId,
	editTitle,
	onSelect,
	onStartRename,
	onCommitRename,
	onSetEditingId,
	onSetEditTitle,
	onPin,
	onDelete,
}: {
	thread: Thread;
	isActive: boolean;
	status: ThreadStatus;
	editingId: string | null;
	editTitle: string;
	onSelect: (id: string) => void;
	onStartRename: (thread: Thread, e: React.MouseEvent) => void;
	onCommitRename: () => void;
	onSetEditingId: (id: string | null) => void;
	onSetEditTitle: (title: string) => void;
	onPin: (id: string, pinned: boolean) => void;
	onDelete: (thread: Thread) => void;
}) {
	return (
		<div
			className={`group/thread flex items-center px-3 h-[32px] cursor-pointer ${
				isActive ? "bg-[#2a2b2e]" : "hover:bg-[#252525]"
			}`}
			onClick={() => onSelect(thread.id)}
		>
			{/* Pin indicator */}
			{thread.pinned && (
				<svg className="w-3 h-3 text-[#666] flex-shrink-0 mr-1.5" viewBox="0 0 16 16" fill="currentColor">
					<path d="M9.828 1.282a1 1 0 0 1 1.414 0l3.476 3.476a1 1 0 0 1 0 1.414L13.1 7.79l-.353 2.122a1 1 0 0 1-.293.572L10.2 12.74a.5.5 0 0 1-.765-.052L7 9.3 3.854 12.446a.5.5 0 0 1-.708-.708L6.3 8.6 2.912 6.165a.5.5 0 0 1-.052-.765l2.256-2.254a1 1 0 0 1 .572-.293L7.81 2.5l1.618-1.618z" />
				</svg>
			)}
			{/* Status dot + label */}
			{status === "completed" && (
				<>
					<span className="w-[7px] h-[7px] rounded-full bg-emerald-500 flex-shrink-0 mr-1.5" />
					<span className="text-emerald-400 text-[13px] mr-1.5 flex-shrink-0" style={{ fontFamily: "'Geist Mono', monospace" }}>
						Completed
					</span>
				</>
			)}
			{(status === "working" || status === "pending_approval") && (
				<>
					{status === "pending_approval" && (
						<svg className="w-3 h-3 text-amber-500 flex-shrink-0 mr-1" viewBox="0 0 16 16" fill="currentColor">
							<path d="M8 1.5a4.5 4.5 0 00-4.5 4.5c0 1.855-.606 3.26-1.2 4.2a8.5 8.5 0 01-.459.632l-.006.008A.5.5 0 002.2 11.5h11.6a.5.5 0 00.365-.66l-.006-.008a8.5 8.5 0 01-.46-.632c-.593-.94-1.199-2.345-1.199-4.2A4.5 4.5 0 008 1.5zM6.5 13a1.5 1.5 0 003 0h-3z" />
						</svg>
					)}
					<span className="w-[7px] h-[7px] rounded-full bg-amber-500 flex-shrink-0 mr-1.5" />
					<span className="text-amber-400 text-[13px] mr-1.5 flex-shrink-0" style={{ fontFamily: "'Geist Mono', monospace" }}>
						Working
					</span>
				</>
			)}

			{/* Thread title */}
			{editingId === thread.id ? (
				<input
					autoFocus
					value={editTitle}
					onChange={(e) => onSetEditTitle(e.target.value)}
					onBlur={onCommitRename}
					onKeyDown={(e) => {
						if (e.key === "Enter") onCommitRename();
						if (e.key === "Escape") onSetEditingId(null);
					}}
					className="flex-1 bg-[#333] text-white text-[13px] px-1.5 py-0.5 outline-none border border-[#555]"
					style={{ fontFamily: "'Geist Mono', monospace" }}
					onClick={(e) => e.stopPropagation()}
				/>
			) : (
				<span
					className="text-[13px] text-[#ccc] truncate flex-1 min-w-0"
					style={{ fontFamily: "'Geist Mono', monospace" }}
				>
					{thread.title}
				</span>
			)}

			{/* Timestamp + hover actions in fixed-width slot */}
			<div className="w-[60px] flex-shrink-0 ml-1 flex items-center justify-end">
				<span className="text-[#555] text-[11px] whitespace-nowrap group-hover/thread:hidden" style={{ fontFamily: "'Geist', sans-serif" }}>
					{formatTime(thread.updatedAt)}
				</span>
				{editingId !== thread.id && (
					<div className="hidden group-hover/thread:flex gap-1">
					<button
						onClick={(e) => {
							e.stopPropagation();
							onPin(thread.id, !thread.pinned);
						}}
						className={`w-5 h-5 flex items-center justify-center hover:bg-[#333] rounded transition-colors ${thread.pinned ? "text-[#aaa]" : "text-[#555] hover:text-[#aaa]"}`}
						title={thread.pinned ? "Unpin" : "Pin"}
					>
						<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
							<path d="M9.828 1.282a1 1 0 0 1 1.414 0l3.476 3.476a1 1 0 0 1 0 1.414L13.1 7.79l-.353 2.122a1 1 0 0 1-.293.572L10.2 12.74a.5.5 0 0 1-.765-.052L7 9.3 3.854 12.446a.5.5 0 0 1-.708-.708L6.3 8.6 2.912 6.165a.5.5 0 0 1-.052-.765l2.256-2.254a1 1 0 0 1 .572-.293L7.81 2.5l1.618-1.618z" />
						</svg>
					</button>
					<button
						onClick={(e) => onStartRename(thread, e)}
						className="w-5 h-5 flex items-center justify-center text-[#555] hover:text-[#aaa] hover:bg-[#333] rounded text-[12px] transition-colors"
						title="Rename"
					>
						&#9998;
					</button>
					<button
						onClick={(e) => {
							e.stopPropagation();
							onDelete(thread);
						}}
						className="w-5 h-5 flex items-center justify-center text-[#555] hover:text-red-400 hover:bg-[#333] rounded text-[12px] transition-colors"
						title="Delete"
					>
						&#10005;
					</button>
				</div>
			)}
			</div>
		</div>
	);
});

export const Sidebar = memo(function Sidebar({ threads, activeThreadId, getThreadStatus, onSelect, onAddProject, onNewThread, onDelete, onRename, onPin, onOpenSettings }: Props) {
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState("");
	const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
	const [deletingThread, setDeletingThread] = useState<Thread | null>(null);

	const confirmDelete = useCallback(() => {
		if (deletingThread) {
			onDelete(deletingThread.id);
			setDeletingThread(null);
		}
	}, [deletingThread, onDelete]);

	const startRename = (thread: Thread, e: React.MouseEvent) => {
		e.stopPropagation();
		setEditingId(thread.id);
		setEditTitle(thread.title);
	};

	const commitRename = () => {
		if (editingId && editTitle.trim()) {
			onRename(editingId, editTitle.trim());
		}
		setEditingId(null);
	};

	const toggleProject = (cwd: string) => {
		setCollapsedProjects((prev) => {
			const next = new Set(prev);
			if (next.has(cwd)) next.delete(cwd);
			else next.add(cwd);
			return next;
		});
	};

	const projects = useMemo(() => {
		const map = new Map<string, Thread[]>();
		for (const thread of threads) {
			const existing = map.get(thread.cwd) ?? [];
			existing.push(thread);
			map.set(thread.cwd, existing);
		}
		return Array.from(map.entries()).map(([cwd, threads]) => ({
			cwd,
			name: getProjectName(cwd),
			threads: threads.sort((a, b) => {
				if (a.pinned && !b.pinned) return -1;
				if (!a.pinned && b.pinned) return 1;
				return 0;
			}),
		}));
	}, [threads]);

	return (
		<div className="w-[280px] min-w-[280px] bg-[#1e1e1e] border-r border-[#2a2b2e] flex flex-col h-full select-none">
			{/* Header with traffic light space */}
			<div className="pl-[76px] pr-4 pt-[10px] h-[52px] flex items-center gap-2.5 electrobun-webkit-app-region-drag">
				<span className="text-white font-bold text-[22px] tracking-tight" style={{ fontFamily: "'Geist', sans-serif" }}>
					Coder
				</span>
				<span className="text-[10px] text-[#888] bg-[#2e2e2e] px-1.5 py-[2px] uppercase tracking-wider font-medium border border-[#3a3a3a]">
					Alpha
				</span>
			</div>

			{/* Project list */}
			<div className="flex-1 overflow-y-auto pt-4 pb-1 px-2">
				{projects.map((project) => {
					const isCollapsed = collapsedProjects.has(project.cwd);
					return (
						<div key={project.cwd} className="mb-4">
							{/* Project header */}
							<div className="group flex items-center px-2 py-2 hover:bg-[#252525]">
								<button
									onClick={() => toggleProject(project.cwd)}
									className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
								>
									{/* Chevron */}
									<svg
										className={`w-3.5 h-3.5 text-[#666] transition-transform flex-shrink-0 ${isCollapsed ? "-rotate-90" : ""}`}
										viewBox="0 0 16 16"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<path d="M4 6l4 4 4-4" />
									</svg>
									{/* Project icon — dark square with italic N */}
									<span className="w-[22px] h-[22px] bg-[#2a2a2a] border border-[#3a3a3a] flex items-center justify-center flex-shrink-0">
										<span className="text-[11px] font-bold text-white italic" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
											N
										</span>
									</span>
									{/* Project name */}
									<span className="text-white text-[15px] font-semibold" style={{ fontFamily: "'Geist', sans-serif" }}>
										{project.name}
									</span>
								</button>
								{/* New thread button */}
								<button
									onClick={() => onNewThread(project.cwd)}
									className="hidden group-hover:flex items-center justify-center w-5 h-5 text-[#555] hover:text-[#aaa] transition-colors flex-shrink-0"
									title="New thread"
								>
									<svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
										<path d="M6 2v8M2 6h8" />
									</svg>
								</button>
							</div>

							{/* Thread list */}
							{!isCollapsed && project.threads.length > 0 && (
								<div className="mt-1 ml-[15px] border-l border-[#333]">
									{project.threads.map((thread) => (
									<ThreadItem
										key={thread.id}
										thread={thread}
										isActive={activeThreadId === thread.id}
										status={getThreadStatus(thread.id)}
										editingId={editingId}
										editTitle={editTitle}
										onSelect={onSelect}
										onStartRename={startRename}
										onCommitRename={commitRename}
										onSetEditingId={setEditingId}
										onSetEditTitle={setEditTitle}
										onPin={onPin}
										onDelete={setDeletingThread}
									/>
								))}
								</div>
							)}
						</div>
					);
				})}
				{threads.length === 0 && (
					<div className="p-4 text-[#555] text-xs text-center">
						No projects yet. Add one to start.
					</div>
				)}
			</div>

			{/* Add project + Settings */}
			<div className="px-4 py-4 border-t border-[#2a2b2e] flex items-center justify-between">
				<button
					onClick={onOpenSettings}
					className="w-7 h-7 flex items-center justify-center text-[#555] hover:text-white hover:bg-[#2a2a2a] rounded transition-colors cursor-pointer"
					title="Settings"
				>
					<svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
						<path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
					</svg>
				</button>
				<button
					onClick={onAddProject}
					className="text-[#888] text-[13px] tracking-[0.15em] uppercase hover:text-white cursor-pointer transition-colors"
					style={{ fontFamily: "'Geist', sans-serif" }}
				>
					+ &nbsp;Add Project
				</button>
				{/* Spacer to keep Add Project centered */}
				<div className="w-7" />
			</div>

			{deletingThread && (
				<DeleteConfirmDialog
					threadTitle={deletingThread.title}
					onConfirm={confirmDelete}
					onCancel={() => setDeletingThread(null)}
				/>
			)}
		</div>
	);
});

function formatTime(dateStr: string) {
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMin = Math.floor(diffMs / 60000);
	const diffHr = Math.floor(diffMs / 3600000);

	if (diffMin < 1) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHr < 24) return `${diffHr}h ago`;
	return date.toLocaleDateString();
}
