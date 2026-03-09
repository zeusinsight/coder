import { useEffect, useRef, memo } from "react";
import type { FileEntry } from "../hooks/use-file-mention";

type Props = {
	items: FileEntry[];
	selectedIndex: number;
	onSelect: (entry: FileEntry) => void;
};

export const FileMentionPopup = memo(function FileMentionPopup({ items, selectedIndex, onSelect }: Props) {
	const listRef = useRef<HTMLDivElement>(null);

	// Scroll selected item into view
	useEffect(() => {
		const el = listRef.current?.children[selectedIndex] as HTMLElement;
		el?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	if (items.length === 0) return null;

	return (
		<div className="absolute bottom-full left-0 right-0 mb-1 z-50">
			<div
				ref={listRef}
				className="bg-[#1b1b1b] border border-[#333] rounded-lg overflow-hidden shadow-xl max-h-[240px] overflow-y-auto"
			>
				{items.map((entry, i) => (
					<button
						key={entry.path}
						onMouseDown={(e) => {
							e.preventDefault(); // Prevent textarea blur
							onSelect(entry);
						}}
						className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors cursor-pointer ${
							i === selectedIndex
								? "bg-[#2a2b2e] text-white"
								: "text-[#999] hover:bg-[#1e1e1e] hover:text-white"
						}`}
					>
						{entry.isDirectory ? (
							<svg
								className="w-4 h-4 flex-shrink-0 text-[#e8a854]"
								viewBox="0 0 16 16"
								fill="currentColor"
							>
								<path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" />
							</svg>
						) : (
							<svg
								className="w-4 h-4 flex-shrink-0 text-[#888]"
								viewBox="0 0 16 16"
								fill="currentColor"
							>
								<path d="M3.5 1A1.5 1.5 0 002 2.5v11A1.5 1.5 0 003.5 15h9a1.5 1.5 0 001.5-1.5v-8A1.5 1.5 0 0012.5 5H9.621a1.5 1.5 0 01-1.06-.44L7.44 3.44A1.5 1.5 0 006.378 3H5V2.5A1.5 1.5 0 003.5 1z" />
							</svg>
						)}
						<span className="truncate" style={{ fontFamily: "'Geist Mono', monospace" }}>
							{entry.name}
						</span>
						{entry.isDirectory && (
							<span className="text-[#555] ml-auto flex-shrink-0">/</span>
						)}
					</button>
				))}
			</div>
		</div>
	);
});
