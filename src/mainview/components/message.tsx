import { useState, useRef, memo, useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../hooks/use-chat";
import { CodeBlock } from "./code-block";
import { useTerminal } from "../hooks/use-terminal";

// Stable reference to avoid react-markdown re-initializing plugins on every render
const REMARK_PLUGINS = [remarkGfm];

type Props = {
	message: ChatMessage;
	onRetry?: () => void;
	isStreaming?: boolean;
};

export const Message = memo(function Message({ message, onRetry, isStreaming }: Props) {
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout>>();

	const handleCopy = () => {
		navigator.clipboard.writeText(message.content);
		setCopied(true);
		clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => setCopied(false), 2000);
	};

	if (message.role === "user") {
		if (message.isAgent) {
			const truncated = message.content.length > 100 ? message.content.slice(0, 100) + "..." : message.content;
			return (
				<div className="my-4">
					<div className="bg-[#232428] rounded-full border border-[#2a2b2e] px-5 py-2.5 inline-flex items-center gap-2.5 font-mono text-[13px] text-[#999]">
						<svg className="w-4 h-4 text-blue-500 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
							<path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
						</svg>
						<span><span className="text-[#ccc] uppercase tracking-wider">Agent Started</span> ({truncated})</span>
					</div>
				</div>
			);
		}
		return (
			<div className="flex flex-col items-end mb-6 group">
				<div className="max-w-[80%] bg-[#232428] text-[#e0e0e0] border border-[#2a2b2e] px-4 py-2.5 rounded-2xl rounded-br-md text-[15px] leading-relaxed">
					{message.images && message.images.length > 0 && (
						<div className="flex flex-wrap gap-2 mb-2">
							{message.images.map((img, i) => (
								<img key={i} src={img.dataUrl} alt="" className="max-w-[300px] rounded-lg" />
							))}
						</div>
					)}
					{message.content}
				</div>
				{!isStreaming && onRetry && (
					<button
						onClick={onRetry}
						className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 mr-1 text-[#555] hover:text-[#999] cursor-pointer"
						title="Retry"
					>
						<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
							<path d="M1 2v5h5" />
							<path d="M3.5 10A5.5 5.5 0 1 0 4 4.5L1 7" />
						</svg>
					</button>
				)}
			</div>
		);
	}

	// Tool messages are handled by ToolCallGroup in chat-view
	if (message.role === "tool") return null;

	const segments = useMemo(() => parseSegments(message.content), [message.content]);
	const { runCommand } = useTerminal();

	// Assistant message
	return (
		<div className="mb-2 group">
			<div className="text-[#e0e0e0] text-[15px] leading-[1.7]">
				{segments.map((seg, i) =>
					seg.type === "code" ? (
						<CodeBlock key={i} code={seg.code} language={seg.language} onRunInTerminal={runCommand} />
					) : (
						<div key={i} className="prose prose-invert prose-base max-w-none prose-headings:text-[#e0e0e0] prose-p:my-1 prose-p:leading-[1.7] prose-p:text-[15px] prose-code:text-[#e0e0e0] prose-code:bg-[#2a2b2e] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-code:font-normal prose-pre:bg-[#111] prose-pre:border prose-pre:border-[#2a2b2e] prose-pre:rounded-lg">
							<Markdown remarkPlugins={REMARK_PLUGINS}>{seg.text}</Markdown>
						</div>
					)
				)}
				{message.isStreaming && (
					<span className="inline-block w-1.5 h-5 bg-blue-400 animate-pulse ml-0.5 rounded-sm" />
				)}
			</div>
			{!message.isStreaming && message.content && (
				<div className="flex items-center gap-3 mt-1.5">
					<p className="text-[#4a4a4a] text-[12px]">
						{message.createdAt ? formatTimestamp(message.createdAt) : ""}
						{message.durationMs != null && ` - ${formatDuration(message.durationMs)}`}
					</p>
					<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
						<button
							onClick={handleCopy}
							className="text-[#4a4a4a] hover:text-[#999] transition-colors cursor-pointer"
							title={copied ? "Copied" : "Copy"}
						>
							{copied ? (
								<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
									<path d="M13 4L6 11L3 8" />
								</svg>
							) : (
								<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
									<rect x="5" y="5" width="8" height="8" rx="1.5" />
									<path d="M3 11V3h8" />
								</svg>
							)}
						</button>
						{!isStreaming && onRetry && (
							<button
								onClick={onRetry}
								className="text-[#4a4a4a] hover:text-[#999] transition-colors cursor-pointer"
								title="Retry"
							>
								<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
									<path d="M1 2v5h5" />
									<path d="M3.5 10A5.5 5.5 0 1 0 4 4.5L1 7" />
								</svg>
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
});

type Segment =
	| { type: "text"; text: string }
	| { type: "code"; code: string; language: string };

function parseSegments(content: string): Segment[] {
	const segments: Segment[] = [];
	// Match fenced code blocks: ```lang\n...\n```
	const regex = /^```(\w*)\n([\s\S]*?)^```$/gm;
	let lastIndex = 0;
	let match;

	while ((match = regex.exec(content)) !== null) {
		// Text before the code block
		if (match.index > lastIndex) {
			const text = content.slice(lastIndex, match.index).trim();
			if (text) segments.push({ type: "text", text });
		}
		segments.push({ type: "code", language: match[1] || "", code: match[2].replace(/\n$/, "") });
		lastIndex = match.index + match[0].length;
	}

	// Remaining text
	if (lastIndex < content.length) {
		const text = content.slice(lastIndex).trim();
		if (text) segments.push({ type: "text", text });
	}

	// If no code blocks found, return the whole content as text
	if (segments.length === 0) {
		return [{ type: "text", text: content }];
	}

	return segments;
}

function formatTimestamp(ts: number) {
	return new Date(ts).toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
}

function formatDuration(ms: number) {
	if (ms < 1000) return `${ms}ms`;
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.round(seconds % 60);
	return `${minutes}m ${remainingSeconds}s`;
}
