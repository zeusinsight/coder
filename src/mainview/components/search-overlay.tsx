import { useState, useEffect, useRef, useCallback } from "react";

type SearchResult = {
	threadId: string;
	threadTitle: string;
	cwd: string;
	snippet: string;
	role: string;
	matchCount: number;
};

type Props = {
	rpc: any;
	onSelect: (threadId: string) => void;
	onClose: () => void;
};

function getProjectName(cwd: string) {
	const parts = cwd.split("/").filter(Boolean);
	return parts[parts.length - 1] || cwd;
}

function highlightSnippet(snippet: string, query: string) {
	if (!query.trim()) return snippet;
	const idx = snippet.toLowerCase().indexOf(query.toLowerCase());
	if (idx === -1) return snippet;
	return (
		<>
			{snippet.slice(0, idx)}
			<mark className="bg-yellow-400/20 text-yellow-300 rounded-[2px]">
				{snippet.slice(idx, idx + query.length)}
			</mark>
			{snippet.slice(idx + query.length)}
		</>
	);
}

export function SearchOverlay({ rpc, onSelect, onClose }: Props) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [selectedIdx, setSelectedIdx] = useState(0);
	const [isSearching, setIsSearching] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Focus input on open
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// Debounced search
	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		if (!query.trim()) {
			setResults([]);
			setSelectedIdx(0);
			return;
		}
		setIsSearching(true);
		debounceRef.current = setTimeout(async () => {
			try {
				const res = await rpc.request.searchMessages({ query });
				setResults(res);
				setSelectedIdx(0);
			} catch (e) {
				console.error("Search failed:", e);
				setResults([]);
			} finally {
				setIsSearching(false);
			}
		}, 150);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [query, rpc]);

	const handleSelect = useCallback(
		(threadId: string) => {
			onSelect(threadId);
			onClose();
		},
		[onSelect, onClose]
	);

	// Keyboard navigation
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopImmediatePropagation();
				onClose();
			} else if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIdx((i) => Math.max(i - 1, 0));
			} else if (e.key === "Enter") {
				e.preventDefault();
				if (results[selectedIdx]) handleSelect(results[selectedIdx].threadId);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [results, selectedIdx, handleSelect, onClose]);

	// Scroll selected item into view
	const selectedRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		selectedRef.current?.scrollIntoView({ block: "nearest" });
	}, [selectedIdx]);

	return (
		<div
			className="fixed inset-0 z-[30000] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				className="w-[580px] bg-[#1e1e1e] border border-[#2a2b2e] rounded-md shadow-2xl overflow-hidden"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Search input */}
				<div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2a2a]">
					<svg className="w-4 h-4 text-[#666] flex-shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
						<circle cx="8.5" cy="8.5" r="5.5" />
						<path d="M14.5 14.5l3 3" strokeLinecap="round" />
					</svg>
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search threads and messages…"
						className="flex-1 bg-transparent text-[14px] text-white placeholder-[#555] outline-none"
						style={{ fontFamily: "'Geist', sans-serif" }}
					/>
					{isSearching && (
						<svg className="w-4 h-4 text-[#555] animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
							<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
							<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
						</svg>
					)}
					<kbd className="inline-flex items-center justify-center h-5 px-1.5 rounded-md border border-[#444] bg-[#2a2a2a] text-[11px] text-[#666] font-mono leading-none flex-shrink-0">
						esc
					</kbd>
				</div>

				{/* Results */}
				<div className="max-h-[400px] overflow-y-auto">
					{query.trim() && !isSearching && results.length === 0 && (
						<div className="px-4 py-8 text-center text-[#555] text-[13px]" style={{ fontFamily: "'Geist', sans-serif" }}>
							No results for &ldquo;{query}&rdquo;
						</div>
					)}

					{results.map((result, idx) => {
						const isSelected = idx === selectedIdx;
						return (
							<div
								key={result.threadId}
								ref={isSelected ? selectedRef : undefined}
								className={`px-4 py-3 cursor-pointer border-b border-[#222] transition-colors ${
									isSelected ? "bg-[#2a2b2e]" : "hover:bg-[#252525]"
								}`}
								onClick={() => handleSelect(result.threadId)}
							>
								{/* Top row: thread title + project + match count */}
								<div className="flex items-center gap-2 mb-1">
									<span
										className="text-[13px] text-white font-medium truncate flex-1 min-w-0"
										style={{ fontFamily: "'Geist', sans-serif" }}
									>
										{result.threadTitle}
									</span>
									<span
										className="text-[11px] text-[#555] flex-shrink-0"
										style={{ fontFamily: "'Geist Mono', monospace" }}
									>
										{getProjectName(result.cwd)}
									</span>
									{result.matchCount > 1 && (
										<span className="flex-shrink-0 text-[10px] text-[#666] bg-[#2a2a2a] border border-[#3a3a3a] px-1.5 py-0.5 rounded-md">
											{result.matchCount} matches
										</span>
									)}
								</div>

								{/* Snippet */}
								{result.snippet && result.role !== "title" && (
									<div className="flex items-start gap-2">
										<span
											className={`text-[10px] px-1 py-0.5 rounded flex-shrink-0 mt-px ${
												result.role === "user"
													? "bg-blue-900/40 text-blue-400"
													: "bg-purple-900/40 text-purple-400"
											}`}
											style={{ fontFamily: "'Geist Mono', monospace" }}
										>
											{result.role === "user" ? "you" : "claude"}
										</span>
										<p
											className="text-[12px] text-[#777] line-clamp-2 leading-relaxed"
											style={{ fontFamily: "'Geist', sans-serif" }}
										>
											{highlightSnippet(result.snippet, query)}
										</p>
									</div>
								)}
							</div>
						);
					})}

					{/* Empty state when no query */}
					{!query.trim() && (
						<div className="px-4 py-8 text-center text-[#444] text-[13px]" style={{ fontFamily: "'Geist', sans-serif" }}>
							Type to search across all your threads and messages
						</div>
					)}
				</div>

				{/* Footer hint */}
				{results.length > 0 && (
					<div className="px-4 py-2 border-t border-[#222] flex items-center gap-3 text-[11px] text-[#444]" style={{ fontFamily: "'Geist', sans-serif" }}>
						<span className="flex items-center gap-1">
							<kbd className="inline-flex items-center justify-center h-4 w-4 rounded-md border border-[#3a3a3a] bg-[#2a2a2a] text-[10px] text-[#555] font-mono">↑</kbd>
							<kbd className="inline-flex items-center justify-center h-4 w-4 rounded-md border border-[#3a3a3a] bg-[#2a2a2a] text-[10px] text-[#555] font-mono">↓</kbd>
							navigate
						</span>
						<span className="flex items-center gap-1">
							<kbd className="inline-flex items-center justify-center h-4 px-1 rounded-md border border-[#3a3a3a] bg-[#2a2a2a] text-[10px] text-[#555] font-mono">↵</kbd>
							open
						</span>
						<span className="flex items-center gap-1">
							<kbd className="inline-flex items-center justify-center h-4 px-1 rounded-md border border-[#3a3a3a] bg-[#2a2a2a] text-[10px] text-[#555] font-mono">esc</kbd>
							close
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
