import { useState, useRef, useEffect, useCallback, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ChatMessage } from "../hooks/use-chat";
import type { Thread } from "../../bun/types";
import { Message } from "./message";
import { DiffView } from "./diff-view";
import { ToolCallGroup, type GroupedItem } from "./tool-panels";

// ─── Thinking shimmer ─────────────────────────────────────────────────────────

function ThinkingShimmer() {
	const text = "Thinking";
	return (
		<span className="inline-block pt-2 text-sm [perspective:500px]">
			{text.split("").map((char, i) => (
				<span key={i} className="inline-block shimmer-wave-char" style={{ animationDelay: `${i * 0.1}s` }}>
					{char}
				</span>
			))}
			<span className="shimmer-wave-char inline-block" style={{ animationDelay: `${text.length * 0.1}s` }}>.</span>
			<span className="shimmer-wave-char inline-block" style={{ animationDelay: `${(text.length + 1) * 0.1}s` }}>.</span>
			<span className="shimmer-wave-char inline-block" style={{ animationDelay: `${(text.length + 2) * 0.1}s` }}>.</span>
		</span>
	);
}

// ─── Stable memoised message wrapper ─────────────────────────────────────────

const MemoMessage = memo(function MemoMessage({
	message,
	isStreaming,
	onRetry,
}: {
	message: ChatMessage;
	isStreaming: boolean;
	onRetry: (id: string) => void;
}) {
	const handleRetry = useCallback(() => onRetry(message.id), [onRetry, message.id]);
	return <Message message={message} isStreaming={isStreaming} onRetry={handleRetry} />;
});

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
	selectedHarness,
	hasClaudeMd,
	onInitClaudeMd,
}: {
	selectedHarness: string;
	hasClaudeMd: boolean | null;
	onInitClaudeMd: () => void;
}) {
	return (
		<div className="h-full flex flex-col items-center justify-center text-[#444] text-sm py-20 gap-6">
			<span className="text-[#555] text-[15px]">Send a message to start coding</span>
			<div className="flex items-center gap-6 text-[12px] text-[#444]" style={{ fontFamily: "'Geist', sans-serif" }}>
				{[
					{ key: "⌘K", label: "Search" },
					{ key: "⌘N", label: "New thread" },
					{ key: "⌘J", label: "Terminal" },
					{ key: "⇧Tab", label: "Cycle mode" },
				].map(({ key, label }) => (
					<span key={key} className="flex items-center gap-1.5">
						<kbd className="inline-flex items-center justify-center h-5 px-1.5 rounded-md border border-[#333] bg-[#232428] text-[11px] text-[#666] font-mono">{key}</kbd>
						<span>{label}</span>
					</span>
				))}
			</div>
			{hasClaudeMd === false && selectedHarness === "claude" && (
				<button
					onClick={onInitClaudeMd}
					className="flex items-center gap-2 px-4 py-2 text-[13px] text-[#999] border border-[#333] rounded-md hover:text-white hover:border-[#555] hover:bg-[#232428] transition-colors cursor-pointer"
				>
					<svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
						<path d="M8 2v12M5 5l3-3 3 3" />
					</svg>
					Initialize CLAUDE.md
				</button>
			)}
		</div>
	);
}

// ─── MessageList ──────────────────────────────────────────────────────────────

type MessageListProps = {
	thread: Thread;
	rpc: any;
	groupedMessages: GroupedItem[];
	messages: ChatMessage[];
	isStreaming: boolean;
	hasStreamingMessage: boolean;
	selectedHarness: string;
	hasClaudeMd: boolean | null;
	onRetry: (messageId: string) => void;
	onInitClaudeMd: () => void;
};

export function MessageList({
	thread,
	rpc,
	groupedMessages,
	messages,
	isStreaming,
	hasStreamingMessage,
	selectedHarness,
	hasClaudeMd,
	onRetry,
	onInitClaudeMd,
}: MessageListProps) {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	// Ref mirrors state to avoid stale closures in RAF/scroll handlers
	const userScrolledUpRef = useRef(false);
	const [userScrolledUp, setUserScrolledUpState] = useState(false);
	const setUserScrolledUp = useCallback((v: boolean) => {
		userScrolledUpRef.current = v;
		setUserScrolledUpState(v);
	}, []);

	const prevThreadIdRef = useRef(thread?.id);
	const prevIsStreamingRef = useRef(isStreaming);
	const threadJustSwitchedRef = useRef(false);

	// ─ Virtualizer ──────────────────────────────────────────────────────────
	const virtualizer = useVirtualizer({
		count: groupedMessages.length,
		getScrollElement: () => scrollContainerRef.current,
		estimateSize: (i) => {
			const item = groupedMessages[i];
			if (item.type === "tool-group") return 56;
			if (item.type === "file-edit") return 180;
			return 120;
		},
		measureElement: (el) => el.getBoundingClientRect().height,
		overscan: 5,
	});

	// ─ Scroll helpers ────────────────────────────────────────────────────────
	const scrollToBottom = useCallback((instant = false) => {
		setUserScrolledUp(false);
		const count = groupedMessages.length;
		if (count > 0) {
			virtualizer.scrollToIndex(count - 1, { behavior: instant ? "auto" : "smooth" });
		} else {
			scrollContainerRef.current?.scrollTo({ top: 0, behavior: instant ? "instant" : "smooth" });
		}
	}, [groupedMessages.length, virtualizer, setUserScrolledUp]);

	const scrollThrottleRef = useRef<number | null>(null);
	const handleScroll = useCallback(() => {
		if (scrollThrottleRef.current !== null) return;
		scrollThrottleRef.current = requestAnimationFrame(() => {
			scrollThrottleRef.current = null;
			const el = scrollContainerRef.current;
			if (!el) return;
			const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
			const wasScrolledUp = userScrolledUpRef.current;
			userScrolledUpRef.current = !isNearBottom;
			if (wasScrolledUp !== !isNearBottom) setUserScrolledUpState(!isNearBottom);
		});
	}, []);

	// ─ Auto-scroll on new messages / thread switch ───────────────────────────
	useEffect(() => {
		const threadChanged = thread?.id !== prevThreadIdRef.current;
		prevThreadIdRef.current = thread?.id;
		if (threadChanged) {
			userScrolledUpRef.current = false;
			setUserScrolledUpState(false);
			threadJustSwitchedRef.current = true;
			scrollToBottom(true);
		} else if (threadJustSwitchedRef.current) {
			threadJustSwitchedRef.current = false;
			userScrolledUpRef.current = false;
			setUserScrolledUpState(false);
			scrollToBottom(true);
		} else if (!userScrolledUpRef.current) {
			scrollToBottom(false);
		}
	}, [messages, thread?.id]);

	// ─ Reset scroll lock when streaming ends ────────────────────────────────
	useEffect(() => {
		if (prevIsStreamingRef.current && !isStreaming) {
			setUserScrolledUp(false);
		}
		prevIsStreamingRef.current = isStreaming;
	}, [isStreaming, setUserScrolledUp]);

	// ─ Render ────────────────────────────────────────────────────────────────
	const virtualItems = virtualizer.getVirtualItems();

	return (
		<div
			className="flex-1 overflow-y-auto px-6 py-6 relative"
			ref={scrollContainerRef}
			onScroll={handleScroll}
		>
			<div className="max-w-4xl mx-auto">
				{/* Empty state */}
				{messages.length === 0 && !isStreaming && (
					<EmptyState
						selectedHarness={selectedHarness}
						hasClaudeMd={hasClaudeMd}
						onInitClaudeMd={onInitClaudeMd}
					/>
				)}

				{/* Virtualised message list */}
				{groupedMessages.length > 0 && (
					<div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
						{virtualItems.map((virtualItem) => {
							const item = groupedMessages[virtualItem.index];
							return (
								<div
									key={virtualItem.key}
									data-index={virtualItem.index}
									ref={virtualizer.measureElement}
									style={{
										position: "absolute",
										top: 0,
										left: 0,
										width: "100%",
										transform: `translateY(${virtualItem.start}px)`,
									}}
								>
									{item.type === "tool-group" && <ToolCallGroup tools={item.messages} />}
									{item.type === "file-edit" && (
										<div className="my-5">
											<DiffView
												filePath={String(item.message.toolInput?.file_path ?? "")}
												oldStr={String(item.message.toolInput?.old_string ?? "")}
												newStr={String(item.message.toolInput?.new_string ?? "")}
											/>
										</div>
									)}
									{item.type === "message" && (
										<MemoMessage
											message={item.message}
											isStreaming={isStreaming}
											onRetry={onRetry}
										/>
									)}
								</div>
							);
						})}
					</div>
				)}

				{/* Thinking shimmer — below the virtual list so it appears at the bottom */}
				{isStreaming && !hasStreamingMessage && <ThinkingShimmer />}
			</div>

			{/* Floating scroll-to-bottom button */}
			{userScrolledUp && messages.length > 0 && (
				<div className="sticky bottom-4 flex justify-center pointer-events-none">
					<button
						onClick={() => scrollToBottom(false)}
						className="pointer-events-auto bg-[#232428] border border-[#2a2b2e] rounded-md px-4 py-2 text-[13px] text-[#999] hover:text-white hover:bg-[#2a2b2e] transition-colors cursor-pointer shadow-lg flex items-center gap-2"
					>
						<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M8 3v10M4 9l4 4 4-4" />
						</svg>
						Scroll to bottom
					</button>
				</div>
			)}
		</div>
	);
}
