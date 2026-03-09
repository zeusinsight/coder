import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { useBranches } from "../hooks/use-branches";

type Props = {
	rpc: any;
	cwd: string;
};

type ListItem = { type: "local" | "remote" | "create"; branch: string };

function formatGitError(raw: string): string {
	// Clean up common git error messages to be more user-friendly
	if (raw.includes("would be overwritten by checkout") || raw.includes("would be overwritten by merge")) {
		const fileMatches = raw.match(/\t(.+)/g);
		const files = fileMatches ? fileMatches.map(f => f.trim()).slice(0, 3) : [];
		const fileList = files.length > 0 ? files.join(", ") : "some files";
		const extra = fileMatches && fileMatches.length > 3 ? ` and ${fileMatches.length - 3} more` : "";
		return `Uncommitted changes in ${fileList}${extra} would be lost. Commit or stash your changes first.`;
	}
	if (raw.includes("not a git repository")) {
		return "This directory is not a git repository.";
	}
	// Strip "error: " and "fatal: " prefixes, and "Aborting" suffix
	let cleaned = raw.replace(/^(error|fatal):\s*/gim, "").replace(/\s*Aborting\.?\s*$/i, "").trim();
	// Take just the first meaningful line
	const firstLine = cleaned.split("\n").find(l => l.trim().length > 0) ?? cleaned;
	return firstLine.length > 150 ? firstLine.slice(0, 147) + "..." : firstLine;
}

export const BranchSelector = memo(function BranchSelector({ rpc, cwd }: Props) {
	const { currentBranch, localBranches, remoteBranches, loading, error, refresh, switchBranch } = useBranches(rpc, cwd);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [switching, setSwitching] = useState(false);
	const [showRemote, setShowRemote] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

	// Position dropdown relative to the button
	const updatePosition = useCallback(() => {
		if (!buttonRef.current) return;
		const rect = buttonRef.current.getBoundingClientRect();
		setDropdownPos({
			top: rect.bottom + 4,
			left: rect.left,
		});
	}, []);

	// Click outside to close
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			const target = e.target as Node;
			if (
				buttonRef.current && !buttonRef.current.contains(target) &&
				dropdownRef.current && !dropdownRef.current.contains(target)
			) {
				setOpen(false);
				setQuery("");
				setActiveIndex(0);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	// Focus input and position when opening
	useEffect(() => {
		if (open) {
			updatePosition();
			refresh();
			setActiveIndex(0);
			setTimeout(() => inputRef.current?.focus(), 0);
		}
	}, [open, refresh, updatePosition]);

	const filteredLocal = useMemo(() => {
		if (!query) return localBranches;
		const q = query.toLowerCase();
		return localBranches.filter((b) => b.toLowerCase().includes(q));
	}, [localBranches, query]);

	const filteredRemote = useMemo(() => {
		if (!query) return remoteBranches;
		const q = query.toLowerCase();
		return remoteBranches.filter((b) => b.toLowerCase().includes(q));
	}, [remoteBranches, query]);

	const canCreate = query.trim() && !localBranches.includes(query.trim()) && !localBranches.some((b) => b.toLowerCase() === query.trim().toLowerCase());

	// Build a flat list of all selectable items for keyboard nav
	const selectableItems = useMemo(() => {
		const items: ListItem[] = [];
		for (const b of filteredLocal) items.push({ type: "local", branch: b });
		if (showRemote) {
			for (const b of filteredRemote) items.push({ type: "remote", branch: b });
		}
		if (canCreate) items.push({ type: "create", branch: query.trim() });
		return items;
	}, [filteredLocal, filteredRemote, showRemote, canCreate, query]);

	// Reset activeIndex when list changes
	useEffect(() => {
		setActiveIndex(0);
	}, [query, showRemote]);

	const close = () => {
		setOpen(false);
		setQuery("");
		setActiveIndex(0);
	};

	const handleSelect = async (branch: string, create: boolean = false) => {
		if (branch === currentBranch && !create) return;
		setSwitching(true);
		await switchBranch(branch, create);
		setSwitching(false);
		// Only close if the switch succeeded (no error)
	};

	// Close dropdown when branch actually changes (success)
	const prevBranchRef = useRef(currentBranch);
	useEffect(() => {
		if (prevBranchRef.current !== currentBranch && currentBranch) {
			close();
		}
		prevBranchRef.current = currentBranch;
	}, [currentBranch]);

	const handleCheckoutRemote = async (remoteBranch: string) => {
		const localName = remoteBranch.replace(/^[^/]+\//, "");
		setSwitching(true);
		await switchBranch(localName, false);
		setSwitching(false);
	};

	const handleItemAction = (item: ListItem) => {
		if (item.type === "local") handleSelect(item.branch);
		else if (item.type === "remote") handleCheckoutRemote(item.branch);
		else if (item.type === "create") handleSelect(item.branch, true);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			close();
			return;
		}
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActiveIndex((i) => Math.min(i + 1, selectableItems.length - 1));
			return;
		}
		if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIndex((i) => Math.max(i - 1, 0));
			return;
		}
		if (e.key === "Enter") {
			e.preventDefault();
			if (selectableItems.length > 0 && activeIndex < selectableItems.length) {
				handleItemAction(selectableItems[activeIndex]);
			}
			return;
		}
	};

	// Scroll active item into view
	useEffect(() => {
		if (!open || !listRef.current) return;
		const active = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
		if (active) active.scrollIntoView({ block: "nearest" });
	}, [activeIndex, open]);

	// Detached HEAD or not a git repo
	const isDetached = currentBranch === "HEAD";
	const displayBranch = isDetached ? "detached" : currentBranch;

	// Don't render if not a git repo
	if (!currentBranch && !loading) return null;

	// Track the flat index across sections
	let itemIndex = 0;

	return (
		<>
			{/* Branch badge button */}
			<button
				ref={buttonRef}
				onClick={(e) => {
					e.stopPropagation();
					setOpen((o) => !o);
				}}
				className={`flex items-center gap-1 max-w-[120px] px-1.5 py-0.5 rounded bg-[#252525] hover:bg-[#2e2e2e] border hover:border-[#444] transition-colors cursor-pointer ${isDetached ? "border-amber-500/40" : "border-[#333]"}`}
				title={currentBranch ?? "Loading..."}
			>
				{/* Git branch icon */}
				<svg className={`w-3 h-3 flex-shrink-0 ${isDetached ? "text-amber-500" : "text-[#888]"}`} viewBox="0 0 16 16" fill="currentColor">
					<path fillRule="evenodd" d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6A2.5 2.5 0 013.5 6V5.372a2.25 2.25 0 111.5 0V6a1 1 0 001 1h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 10.628V12.75a2.25 2.25 0 101.5 0v-2.122a2.25 2.25 0 11-1.5 0z" clipRule="evenodd" />
				</svg>
				{switching || loading ? (
					<svg className="w-3 h-3 text-[#888] animate-spin flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
						<circle cx="8" cy="8" r="6" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
					</svg>
				) : (
					<span className={`text-[11px] truncate ${isDetached ? "text-amber-400 italic" : "text-[#999]"}`} style={{ fontFamily: "'Geist Mono', monospace" }}>
						{displayBranch ?? "..."}
					</span>
				)}
				{/* Dropdown chevron */}
				<svg className="w-2.5 h-2.5 text-[#666] flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
					<path d="M4 6l4 4 4-4" />
				</svg>
			</button>

			{/* Dropdown — rendered via portal to avoid overflow clipping */}
			{open && createPortal(
				<div
					ref={dropdownRef}
					className="fixed w-[240px] bg-[#1e1e1e] border border-[#333] rounded-lg shadow-2xl z-[10000] overflow-hidden"
					style={{ top: dropdownPos.top, left: dropdownPos.left }}
				>
					{/* Search / create input */}
					<div className="p-2 border-b border-[#2a2b2e]">
						<input
							ref={inputRef}
							type="text"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Switch or create branch..."
							className="w-full bg-[#252525] border border-[#333] rounded px-2 py-1.5 text-[12px] text-white placeholder-[#555] outline-none focus:border-[#555]"
							style={{ fontFamily: "'Geist Mono', monospace" }}
						/>
					</div>

					{/* Error message */}
					{error && (
						<div className="px-3 py-2.5 text-[12px] text-red-300 bg-red-500/10 border-b border-red-500/20 leading-relaxed">
							<div className="flex items-start gap-2">
								<svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor">
									<path fillRule="evenodd" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7.25 5a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0V5zm.75 6.5a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
								</svg>
								<span>{formatGitError(error)}</span>
							</div>
						</div>
					)}

					{/* Branch list */}
					<div ref={listRef} className="max-h-[280px] overflow-y-auto">
						{/* Local branches */}
						{filteredLocal.length > 0 && (
							<div>
								<div className="px-3 py-1.5 text-[10px] text-[#666] uppercase tracking-wider font-medium" style={{ fontFamily: "'Geist', sans-serif" }}>
									Local
								</div>
								{filteredLocal.map((branch) => {
									const idx = itemIndex++;
									return (
										<button
											key={branch}
											data-index={idx}
											onClick={() => handleSelect(branch)}
											onMouseEnter={() => setActiveIndex(idx)}
											className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors cursor-pointer ${
												idx === activeIndex
													? "bg-[#2a2b2e] text-white"
													: branch === currentBranch
														? "text-white"
														: "text-[#ccc] hover:bg-[#252525]"
											}`}
											style={{ fontFamily: "'Geist Mono', monospace" }}
										>
											{branch === currentBranch ? (
												<svg className="w-3 h-3 text-emerald-400 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
													<path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
												</svg>
											) : (
												<span className="w-3 flex-shrink-0" />
											)}
											<span className="truncate">{branch}</span>
										</button>
									);
								})}
							</div>
						)}

						{/* Remote branches (collapsible) */}
						{filteredRemote.length > 0 && (
							<div className="border-t border-[#2a2b2e]">
								<button
									onClick={() => setShowRemote((s) => !s)}
									className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-[#666] uppercase tracking-wider font-medium hover:text-[#999] transition-colors cursor-pointer"
									style={{ fontFamily: "'Geist', sans-serif" }}
								>
									<svg
										className={`w-2.5 h-2.5 transition-transform ${showRemote ? "" : "-rotate-90"}`}
										viewBox="0 0 16 16"
										fill="none"
										stroke="currentColor"
										strokeWidth="2.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<path d="M4 6l4 4 4-4" />
									</svg>
									Remote ({filteredRemote.length})
								</button>
								{showRemote &&
									filteredRemote.map((branch) => {
										const idx = itemIndex++;
										return (
											<button
												key={branch}
												data-index={idx}
												onClick={() => handleCheckoutRemote(branch)}
												onMouseEnter={() => setActiveIndex(idx)}
												className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors cursor-pointer ${
													idx === activeIndex
														? "bg-[#2a2b2e] text-[#ccc]"
														: "text-[#888] hover:text-[#ccc] hover:bg-[#252525]"
												}`}
												style={{ fontFamily: "'Geist Mono', monospace" }}
											>
												<span className="w-3 flex-shrink-0" />
												<span className="truncate">{branch}</span>
											</button>
										);
									})}
							</div>
						)}

						{/* Create new branch option */}
						{canCreate && (() => {
							const idx = itemIndex++;
							return (
								<div className="border-t border-[#2a2b2e]">
									<button
										data-index={idx}
										onClick={() => handleSelect(query.trim(), true)}
										onMouseEnter={() => setActiveIndex(idx)}
										className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] text-emerald-400 transition-colors cursor-pointer ${
											idx === activeIndex ? "bg-[#252525]" : ""
										}`}
										style={{ fontFamily: "'Geist Mono', monospace" }}
									>
										<svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
											<path d="M8 3v10M3 8h10" />
										</svg>
										<span>
											Create <span className="font-semibold">{query.trim()}</span>
										</span>
									</button>
								</div>
							);
						})()}

						{/* Empty state */}
						{filteredLocal.length === 0 && filteredRemote.length === 0 && !canCreate && (
							<div className="px-3 py-4 text-[12px] text-[#555] text-center">No branches found</div>
						)}
					</div>
				</div>,
				document.body
			)}
		</>
	);
});
