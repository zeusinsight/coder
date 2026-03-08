import { memo, useMemo } from "react";

type Props = {
	filePath: string;
	oldStr: string;
	newStr: string;
};

export const DiffView = memo(function DiffView({ filePath, oldStr, newStr }: Props) {
	const oldLines = useMemo(() => oldStr.split("\n"), [oldStr]);
	const newLines = useMemo(() => newStr.split("\n"), [newStr]);

	return (
		<div className="rounded-lg border border-[#2a2b2e] bg-[#1b1b1b] font-mono text-[13px] overflow-hidden my-2">
			<div className="flex items-center px-4 py-2 bg-[#232428] border-b border-[#2a2b2e]">
				<span className="text-[12px] text-[#888]">{filePath}</span>
			</div>
			<div className="overflow-x-auto p-3">
				{oldLines.map((line, i) => (
					<div key={`old-${i}`} className="bg-red-500/10 text-red-400 px-2 leading-[1.6] whitespace-pre">
						<span className="select-none text-red-400/50 mr-2">-</span>{line}
					</div>
				))}
				{newLines.map((line, i) => (
					<div key={`new-${i}`} className="bg-green-500/10 text-green-400 px-2 leading-[1.6] whitespace-pre">
						<span className="select-none text-green-400/50 mr-2">+</span>{line}
					</div>
				))}
			</div>
		</div>
	);
});
