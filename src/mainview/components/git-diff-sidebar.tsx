import { useState, useEffect, useCallback, memo, useMemo } from "react";

type DiffFile = {
	path: string;
	status: string;
	diff: string;
};

type Props = {
	rpc: any;
	cwd: string;
	isOpen: boolean;
	onClose: () => void;
};

function StatusBadge({ status }: { status: string }) {
	const colors: Record<string, string> = {
		added: "text-green-400 bg-green-400/10",
		modified: "text-amber-400 bg-amber-400/10",
		deleted: "text-red-400 bg-red-400/10",
		renamed: "text-blue-400 bg-blue-400/10",
	};
	const cls = colors[status] ?? "text-[#888] bg-[#2a2b2e]";
	const label = status.charAt(0).toUpperCase();

	return (
		<span className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded ${cls}`}>
			{label}
		</span>
	);
}

function parseDiffLines(diff: string): { type: "add" | "remove" | "context" | "header"; text: string }[] {
	if (!diff) return [];
	return diff.split("\n").map((line) => {
		if (line.startsWith("+++") || line.startsWith("---")) return { type: "header" as const, text: line };
		if (line.startsWith("@@")) return { type: "header" as const, text: line };
		if (line.startsWith("+")) return { type: "add" as const, text: line.slice(1) };
		if (line.startsWith("-")) return { type: "remove" as const, text: line.slice(1) };
		if (line.startsWith("diff --git")) return { type: "header" as const, text: line };
		if (line.startsWith("index ")) return { type: "header" as const, text: line };
		if (line.startsWith("new file")) return { type: "header" as const, text: line };
		if (line.startsWith("deleted file")) return { type: "header" as const, text: line };
		return { type: "context" as const, text: line.startsWith(" ") ? line.slice(1) : line };
	}).filter((l) => l.type !== "header" || l.text.startsWith("@@"));
}

export const GitDiffSidebar = memo(function GitDiffSidebar({ rpc, cwd, isOpen, onClose }: Props) {
	const [files, setFiles] = useState<DiffFile[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [expandedFile, setExpandedFile] = useState<string | null>(null);

	const fetchDiff = useCallback(async () => {
		if (!rpc || !cwd) return;
		setLoading(true);
		setError(null);
		try {
			const result = await rpc.request.getGitDiff({ cwd });
			setFiles(result.files);
			if (result.error) setError(result.error);
		} catch (e: any) {
			setError(e.message ?? "Failed to fetch git diff");
			setFiles([]);
		} finally {
			setLoading(false);
		}
	}, [rpc, cwd]);

	useEffect(() => {
		if (isOpen) fetchDiff();
	}, [isOpen, fetchDiff]);

	const { addedCount, modifiedCount, deletedCount } = useMemo(() => ({
		addedCount: files.filter((f) => f.status === "added").length,
		modifiedCount: files.filter((f) => f.status === "modified").length,
		deletedCount: files.filter((f) => f.status === "deleted").length,
	}), [files]);

	return (
		<div
			className={`absolute top-0 right-0 h-full w-[420px] flex flex-col bg-[#1b1b1b] border-l border-[#2a2b2e] transition-transform duration-300 ease-in-out z-[100] shadow-2xl ${
				isOpen ? "translate-x-0" : "translate-x-full"
			}`}
		>
			{/* Header */}
			<div className="flex items-center justify-between px-4 h-[52px] border-b border-[#2a2b2e] flex-shrink-0 electrobun-webkit-app-region-drag" onDoubleClick={() => rpc.request.toggleMaximize({})}>
				<div className="flex items-center gap-2.5">
					<svg className="w-4 h-4 text-[#999]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
						<path d="M12 2v6M12 12v2M4 2v2M4 8v6" />
						<circle cx="4" cy="6" r="2" />
						<circle cx="12" cy="10" r="2" />
					</svg>
					<span className="text-[13px] text-[#e0e0e0] font-medium">Git Changes</span>
					{files.length > 0 && (
						<span className="text-[11px] text-[#666] bg-[#2a2b2e] px-1.5 py-0.5 rounded">
							{files.length} file{files.length !== 1 ? "s" : ""}
						</span>
					)}
				</div>
				<div className="flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
					<button
						onClick={fetchDiff}
						className="w-7 h-7 flex items-center justify-center rounded-md text-[#666] hover:text-[#ccc] hover:bg-[#2a2b2e] transition-colors cursor-pointer"
						title="Refresh"
					>
						<svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
							<path d="M2 8a6 6 0 0110.5-4M14 2v4h-4" />
							<path d="M14 8a6 6 0 01-10.5 4M2 14v-4h4" />
						</svg>
					</button>
					<button
						onClick={onClose}
						className="w-7 h-7 flex items-center justify-center rounded-md text-[#666] hover:text-[#ccc] hover:bg-[#2a2b2e] transition-colors cursor-pointer"
						title="Close"
					>
						<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
							<path d="M4 4l8 8M12 4l-8 8" />
						</svg>
					</button>
				</div>
			</div>

			{/* Summary bar */}
			{files.length > 0 && (
				<div className="flex items-center gap-3 px-4 py-2 border-b border-[#232428] text-[11px]">
					{addedCount > 0 && <span className="text-green-400">+{addedCount} added</span>}
					{modifiedCount > 0 && <span className="text-amber-400">~{modifiedCount} modified</span>}
					{deletedCount > 0 && <span className="text-red-400">-{deletedCount} deleted</span>}
				</div>
			)}

			{/* Content */}
			<div className="flex-1 overflow-y-auto">
				{loading && files.length === 0 && (
					<div className="flex items-center justify-center py-12 text-[#555] text-sm">
						<svg className="w-4 h-4 animate-spin mr-2" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
							<path d="M2 8a6 6 0 0110.5-4M14 2v4h-4" />
						</svg>
						Loading changes...
					</div>
				)}

				{error && (
					<div className="px-4 py-3 text-[13px] text-red-400/80">
						{error}
					</div>
				)}

				{!loading && !error && files.length === 0 && (
					<div className="flex flex-col items-center justify-center py-16 text-[#555]">
						<svg className="w-8 h-8 mb-3 text-[#444]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
							<path d="M13 4L6 11L3 8" />
						</svg>
						<span className="text-sm">Working tree clean</span>
						<span className="text-[11px] text-[#444] mt-1">No uncommitted changes</span>
					</div>
				)}

				{files.map((file) => {
					const isExpanded = expandedFile === file.path;
					const diffLines = parseDiffLines(file.diff);
					const hunkLines = diffLines.filter((l) => l.type !== "header");
					const fileName = file.path.split("/").pop() ?? file.path;
					const dirPath = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";

					return (
						<div key={file.path} className="border-b border-[#232428]">
							<button
								onClick={() => setExpandedFile(isExpanded ? null : file.path)}
								className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[#1e1e1e] transition-colors cursor-pointer group"
							>
								<svg
									className={`w-2.5 h-2.5 text-[#555] transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`}
									viewBox="0 0 8 10"
									fill="currentColor"
								>
									<path d="M1 0l6 5-6 5z" />
								</svg>
								<div className="flex-1 min-w-0 flex items-center gap-2">
									<span className="text-[13px] text-[#e0e0e0] truncate font-mono">{fileName}</span>
									{dirPath && (
										<span className="text-[11px] text-[#555] truncate font-mono">{dirPath}</span>
									)}
								</div>
								<StatusBadge status={file.status} />
							</button>

							{isExpanded && hunkLines.length > 0 && (
								<div className="overflow-x-auto mx-3 mb-3 rounded-md border border-[#2a2b2e] bg-[#181818]">
									<div className="text-[12px] font-mono leading-[1.7]">
										{diffLines.map((line, i) => {
											if (line.type === "header") {
												return (
													<div key={i} className="px-3 py-0.5 bg-[#232428] text-[#666] text-[11px] border-b border-[#2a2b2e]">
														{line.text}
													</div>
												);
											}
											return (
												<div
													key={i}
													className={`px-3 whitespace-pre ${
														line.type === "add"
															? "bg-green-500/8 text-green-400"
															: line.type === "remove"
															? "bg-red-500/8 text-red-400"
															: "text-[#888]"
													}`}
												>
													<span className="select-none text-[#555] mr-2 inline-block w-3 text-right">
														{line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
													</span>
													{line.text}
												</div>
											);
										})}
									</div>
								</div>
							)}

							{isExpanded && hunkLines.length === 0 && (
								<div className="px-4 pb-3 text-[12px] text-[#555] italic">
									No diff content available
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
});
