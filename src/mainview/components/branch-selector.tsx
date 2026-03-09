import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { useBranches } from "../hooks/use-branches";

type Props = {
	rpc: any;
	cwd: string;
};

export const BranchSelector = memo(function BranchSelector({ rpc, cwd }: Props) {
	const { currentBranch, localBranches, remoteBranches, loading, error, refresh, switchBranch } = useBranches(rpc, cwd);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [switching, setSwitching] = useState(false);
	const [showRemote, setShowRemote] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
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

	const handleSelect = async (branch: string, create: boolean = false) => {
		if (branch === currentBranch && !create) return;
		setSwitching(true);
		await switchBranch(branch, create);
		setSwitching(false);
		setOpen(false);
		setQuery("");
	};

	const handleCheckoutRemote = async (remoteBranch: string) => {
		// "origin/feature-x" → "feature-x"
		const localName = remoteBranch.replace(/^[^/]+\//, "");
		setSwitching(true);
		await switchBranch(localName, false);
		setSwitching(false);
		setOpen(false);
		setQuery("");
	};

	// Don't render if not a git repo
	if (!currentBranch && !loading) return null;

	return (
		<>
			{/* Branch badge button */}
			<button
				ref={buttonRef}
				onClick={(e) => {
					e.stopPropagation();
					setOpen((o) => !o);
				}}
				className="flex items-center gap-1 max-w-[120px] px-1.5 py-0.5 rounded bg-[#252525] hover:bg-[#2e2e2e] border border-[#333] hover:border-[#444] transition-colors cursor-pointer"
				title={currentBranch ?? "Loading..."}
			>
				{/* Git branch icon */}
				<svg className="w-3 h-3 text-[#888] flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
					<path fillRule="evenodd" d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6A2.5 2.5 0 013.5 6V5.372a2.25 2.25 0 111.5 0V6a1 1 0 001 1h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 10.628V12.75a2.25 2.25 0 101.5 0v-2.122a2.25 2.25 0 11-1.5 0z" clipRule="evenodd" />
				</svg>
				{switching || loading ? (
					<svg className="w-3 h-3 text-[#888] animate-spin flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
						<circle cx="8" cy="8" r="6" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
					</svg>
				) : (
					<span className="text-[11px] text-[#999] truncate" style={{ fontFamily: "'Geist Mono', monospace" }}>
						{currentBranch ?? "..."}
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
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									setOpen(false);
									setQuery("");
								}
								if (e.key === "Enter" && canCreate) {
									handleSelect(query.trim(), true);
								}
								if (e.key === "Enter" && !canCreate && filteredLocal.length === 1) {
									handleSelect(filteredLocal[0]);
								}
							}}
							placeholder="Switch or create branch..."
							className="w-full bg-[#252525] border border-[#333] rounded px-2 py-1.5 text-[12px] text-white placeholder-[#555] outline-none focus:border-[#555]"
							style={{ fontFamily: "'Geist Mono', monospace" }}
						/>
					</div>

					{/* Error message */}
					{error && (
						<div className="px-3 py-2 text-[11px] text-red-400 bg-red-500/10 border-b border-[#2a2b2e]">
							{error.length > 120 ? error.slice(0, 120) + "..." : error}
						</div>
					)}

					{/* Branch list */}
					<div className="max-h-[280px] overflow-y-auto">
						{/* Local branches */}
						{filteredLocal.length > 0 && (
							<div>
								<div className="px-3 py-1.5 text-[10px] text-[#666] uppercase tracking-wider font-medium" style={{ fontFamily: "'Geist', sans-serif" }}>
									Local
								</div>
								{filteredLocal.map((branch) => (
									<button
										key={branch}
										onClick={() => handleSelect(branch)}
										className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors cursor-pointer ${
											branch === currentBranch
												? "text-white bg-[#2a2b2e]"
												: "text-[#ccc] hover:bg-[#252525]"
										}`}
										style={{ fontFamily: "'Geist Mono', monospace" }}
									>
										{branch === currentBranch && (
											<svg className="w-3 h-3 text-emerald-400 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
												<path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
											</svg>
										)}
										<span className={`truncate ${branch !== currentBranch ? "ml-5" : ""}`}>{branch}</span>
									</button>
								))}
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
									filteredRemote.map((branch) => (
										<button
											key={branch}
											onClick={() => handleCheckoutRemote(branch)}
											className="w-full flex items-center gap-2 px-3 py-1.5 ml-5 text-[12px] text-[#888] hover:text-[#ccc] hover:bg-[#252525] transition-colors cursor-pointer"
											style={{ fontFamily: "'Geist Mono', monospace" }}
										>
											<span className="truncate">{branch}</span>
										</button>
									))}
							</div>
						)}

						{/* Create new branch option */}
						{canCreate && (
							<div className="border-t border-[#2a2b2e]">
								<button
									onClick={() => handleSelect(query.trim(), true)}
									className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-emerald-400 hover:bg-[#252525] transition-colors cursor-pointer"
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
						)}

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
