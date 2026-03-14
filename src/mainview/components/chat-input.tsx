import { useRef, useEffect, useCallback } from "react";
import type { ImageAttachment } from "../hooks/use-chat";
import type { Thread } from "../../bun/types";
import { FileMentionPopup } from "./file-mention-popup";
import {
	HarnessDropdown,
	ModelSelector,
	ThinkingSelector,
	ModeSelector,
	type ThinkingLevel,
	type ChatMode,
} from "./chat-toolbar-selectors";

export type QueuedMessage = {
	content: string | any[];
	model: string | undefined;
	accessMode: "full" | "restricted";
	images: ImageAttachment[] | undefined;
	budget: number | undefined;
	chatMode: ChatMode;
	displayText: string;
};

type ImageWithId = ImageAttachment & { id: string; base64: string };

type ChatInputProps = {
	thread: Thread;
	rpc: any;
	isStreaming: boolean;
	input: string;
	images: ImageWithId[];
	messageQueue: QueuedMessage[];
	messageQueueRef: React.MutableRefObject<QueuedMessage[]>;
	queueExpanded: boolean;
	chatMode: ChatMode;
	selectedHarness: string;
	selectedModel: string;
	thinkingLevel: ThinkingLevel;
	accessMode: "full" | "restricted";
	fileMention: any;
	onInputChange: (value: string) => void;
	onCursorPosChange: (pos: number) => void;
	onSend: () => void;
	onInterrupt: () => void;
	onImagesChange: (images: ImageWithId[]) => void;
	onQueueChange: (queue: QueuedMessage[]) => void;
	onQueueExpandedChange: (expanded: boolean) => void;
	onChangeHarness: (id: string) => void;
	onChangeModel: (id: string) => void;
	onChangeThinkingLevel: (level: ThinkingLevel) => void;
	onChangeChatMode: (mode: ChatMode) => void;
	onChangeAccessMode: () => void;
	textareaRef: React.RefObject<HTMLTextAreaElement>;
};

export function ChatInput({
	thread,
	rpc,
	isStreaming,
	input,
	images,
	messageQueue,
	messageQueueRef,
	queueExpanded,
	chatMode,
	selectedHarness,
	selectedModel,
	thinkingLevel,
	accessMode,
	fileMention,
	onInputChange,
	onCursorPosChange,
	onSend,
	onInterrupt,
	onImagesChange,
	onQueueChange,
	onQueueExpandedChange,
	onChangeHarness,
	onChangeModel,
	onChangeThinkingLevel,
	onChangeChatMode,
	onChangeAccessMode,
	textareaRef,
}: ChatInputProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Auto-resize textarea
	useEffect(() => {
		const el = textareaRef.current;
		if (el) {
			el.style.height = "auto";
			el.style.height = Math.min(el.scrollHeight, 200) + "px";
		}
	}, [input, textareaRef]);

	const handlePaste = useCallback((e: React.ClipboardEvent) => {
		const items = Array.from(e.clipboardData.items);
		for (const item of items) {
			if (item.type.startsWith("image/")) {
				e.preventDefault();
				const file = item.getAsFile();
				if (!file) continue;
				const reader = new FileReader();
				reader.onload = () => {
					const dataUrl = reader.result as string;
					const base64 = dataUrl.split(",")[1];
					onImagesChange([...images, { id: crypto.randomUUID(), dataUrl, base64, mediaType: item.type }]);
				};
				reader.readAsDataURL(file);
			}
		}
	}, [images, onImagesChange]);

	const handleDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		const newImages = [...images];
		for (const file of Array.from(e.dataTransfer.files)) {
			if (file.type.startsWith("image/")) {
				const reader = new FileReader();
				reader.onload = () => {
					const dataUrl = reader.result as string;
					const base64 = dataUrl.split(",")[1];
					onImagesChange([...newImages, { id: crypto.randomUUID(), dataUrl, base64, mediaType: file.type }]);
				};
				reader.readAsDataURL(file);
			}
		}
	}, [images, onImagesChange]);

	const clearQueue = () => {
		messageQueueRef.current = [];
		onQueueChange([]);
		onQueueExpandedChange(false);
	};

	const removeQueueItem = (idx: number) => {
		const next = messageQueue.filter((_, i) => i !== idx);
		messageQueueRef.current = next;
		onQueueChange(next);
		if (next.length <= 1) onQueueExpandedChange(false);
	};

	return (
		<div className="px-6 pb-12">
			<div className="max-w-4xl mx-auto">
				<div
					className="bg-[#1b1b1b] rounded-md"
					onDrop={handleDrop}
					onDragOver={(e) => e.preventDefault()}
				>
					{/* Queued message indicator */}
					{messageQueue.length > 0 && (
						<div className="border-b border-[#222326]" style={{ fontFamily: "'Geist Mono', monospace" }}>
							{/* Collapsed / summary row — always visible */}
							<div
								className="flex items-center gap-2.5 px-5 pt-3 pb-2.5 cursor-pointer select-none group/queue"
								onClick={() => messageQueue.length > 1 && onQueueExpandedChange(!queueExpanded)}
							>
								{messageQueue.length > 1 ? (
									<svg
										className={`w-2.5 h-2.5 text-[#3a3a42] flex-shrink-0 transition-transform duration-150 ${queueExpanded ? "rotate-90" : ""}`}
										viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
									>
										<path d="M3 2l4 3-4 3" />
									</svg>
								) : (
									<div className="w-1.5 h-1.5 rounded-full bg-[#3a3a42] flex-shrink-0" />
								)}
								<span className="text-[11px] text-[#4a4a54] truncate flex-1 leading-none">{messageQueue[0].displayText}</span>
								{messageQueue.length > 1 && !queueExpanded && (
									<span className="text-[11px] text-[#3a3a42] flex-shrink-0 group-hover/queue:opacity-0 transition-opacity">+{messageQueue.length - 1}</span>
								)}
								<button
									onClick={(e) => { e.stopPropagation(); clearQueue(); }}
									className="flex-shrink-0 text-[#333338] hover:text-[#666] transition-colors cursor-pointer ml-1"
									title="Clear all"
								>
									<svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
										<path d="M2 2l8 8M10 2l-8 8" />
									</svg>
								</button>
							</div>
							{/* Expanded list */}
							{queueExpanded && messageQueue.length > 1 && (
								<div className="pb-1">
									{messageQueue.map((msg, i) => (
										<div key={i} className="flex items-center gap-2.5 px-5 py-1.5 group/item hover:bg-[#1e1e22] transition-colors">
											<span className="text-[10px] text-[#2e2e36] flex-shrink-0 w-3 text-right">{i + 1}</span>
											<span className="text-[11px] text-[#3d3d48] truncate flex-1 leading-none">{msg.displayText}</span>
											<button
												onClick={() => removeQueueItem(i)}
												className="flex-shrink-0 text-[#2a2a32] hover:text-[#666] transition-colors cursor-pointer opacity-0 group-hover/item:opacity-100"
											>
												<svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
													<path d="M2 2l6 6M8 2l-6 6" />
												</svg>
											</button>
										</div>
									))}
								</div>
							)}
						</div>
					)}

					{/* Text input */}
					<div className="px-5 pt-4 pb-2 relative">
						{fileMention.isOpen && (
							<FileMentionPopup
								items={fileMention.items}
								selectedIndex={fileMention.selectedIndex}
								onSelect={(entry: any) => {
									const result = fileMention.applySelection(entry);
									if (result) {
										onInputChange(result.newInput);
										onCursorPosChange(result.newCursorPos);
										requestAnimationFrame(() => {
											textareaRef.current?.setSelectionRange(result.newCursorPos, result.newCursorPos);
											textareaRef.current?.focus();
										});
									}
								}}
							/>
						)}
						<textarea
							ref={textareaRef}
							value={input}
							onChange={(e) => {
								onInputChange(e.target.value);
								onCursorPosChange(e.target.selectionStart ?? 0);
							}}
							onSelect={(e) => onCursorPosChange((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
							onPaste={handlePaste}
							onKeyDown={(e) => {
								const mentionResult = fileMention.handleKeyDown(e);
								if (mentionResult && typeof mentionResult === "object") {
									onInputChange(mentionResult.newInput);
									onCursorPosChange(mentionResult.newCursorPos);
									requestAnimationFrame(() => {
										textareaRef.current?.setSelectionRange(mentionResult.newCursorPos, mentionResult.newCursorPos);
									});
									return;
								}
								if (mentionResult === true) return;

								if (e.key === "Tab" && e.shiftKey) {
									e.preventDefault();
									const modes: ChatMode[] = ["chat", "build", "plan"];
									const idx = modes.indexOf(chatMode);
									onChangeChatMode(modes[(idx + 1) % modes.length]);
								}
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									onSend();
								}
							}}
							placeholder="Ask anything, @tag files/folder, or use /model"
							rows={1}
							className="w-full bg-transparent text-[#d9d9d9] placeholder-[#4e4e4e] text-[14px] resize-none outline-none min-h-[24px]"
							style={{ fontFamily: "'Geist Mono', monospace" }}
						/>
					</div>

					{/* Image thumbnails */}
					{images.length > 0 && (
						<div className="flex items-center gap-2 px-5 pb-2">
							{images.map((img) => (
								<div key={img.id} className="relative group/thumb">
									<img src={img.dataUrl} alt="" className="w-16 h-16 object-cover rounded-md border border-[#2a2b2e]" />
									<button
										onClick={() => onImagesChange(images.filter((i) => i.id !== img.id))}
										className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#333] border border-[#555] rounded-md flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity cursor-pointer hover:bg-[#555]"
									>
										<svg className="w-2.5 h-2.5 text-white" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
											<path d="M4 4l8 8M12 4l-8 8" />
										</svg>
									</button>
								</div>
							))}
						</div>
					)}

					{/* Bottom bar */}
					<div className="flex items-center justify-between px-5 py-3">
						<div className="flex items-center gap-5 text-[13px] text-[#d9d9d9]" style={{ fontFamily: "'Geist Mono', monospace" }}>
							<input
								ref={fileInputRef}
								type="file"
								accept="image/*"
								multiple
								className="hidden"
								onChange={(e) => {
									for (const file of Array.from(e.target.files ?? [])) {
										if (file.type.startsWith("image/")) {
											const reader = new FileReader();
											reader.onload = () => {
												const dataUrl = reader.result as string;
												const base64 = dataUrl.split(",")[1];
												onImagesChange([...images, { id: crypto.randomUUID(), dataUrl, base64, mediaType: file.type }]);
											};
											reader.readAsDataURL(file);
										}
									}
									e.target.value = "";
								}}
							/>
							<button
								onClick={() => fileInputRef.current?.click()}
								className="flex items-center justify-center w-6 h-6 rounded-md text-[#666] hover:text-[#ccc] hover:bg-[#2a2b2e] transition-colors cursor-pointer"
								title="Add image"
							>
								<svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
									<path d="M8 3v10M3 8h10" />
								</svg>
							</button>
							<HarnessDropdown selected={selectedHarness} onSelect={onChangeHarness} />
							{selectedHarness === "claude" && (
								<>
									<ModelSelector selectedModel={selectedModel} onSelect={onChangeModel} />
									<ThinkingSelector selectedModel={selectedModel} thinkingLevel={thinkingLevel} onSelect={onChangeThinkingLevel} />
								</>
							)}
							<ModeSelector chatMode={chatMode} onSelect={onChangeChatMode} />
							<button
								onClick={onChangeAccessMode}
								className="flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
							>
								{accessMode === "full" ? (
									<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
										<rect x="1" y="7" width="14" height="8" rx="2" />
										<path d="M4 7V5a4 4 0 018 0" />
									</svg>
								) : (
									<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
										<rect x="1" y="7" width="14" height="8" rx="2" />
										<path d="M4 7V5a4 4 0 018 0v2" />
									</svg>
								)}
								{accessMode === "full" ? "Full Access" : "Restricted"}
							</button>
						</div>
						{isStreaming ? (
							<button
								onClick={onInterrupt}
								className="w-8 h-8 rounded-md bg-gradient-to-b from-[#e0e0e0] to-[#c0c0c0] flex items-center justify-center hover:from-white hover:to-[#d0d0d0] transition-all cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.3)] active:shadow-[0_0px_1px_rgba(0,0,0,0.3)] active:translate-y-[1px]"
							>
								<svg className="w-3 h-3" viewBox="0 0 12 12" fill="#1b1b1b">
									<rect x="2.5" y="2.5" width="7" height="7" rx="1" />
								</svg>
							</button>
						) : (
							<button
								onClick={onSend}
								disabled={!input.trim() && images.length === 0}
								className="w-8 h-8 rounded-md bg-gradient-to-b from-[#e0e0e0] to-[#c0c0c0] flex items-center justify-center hover:from-white hover:to-[#d0d0d0] transition-all disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.3)] active:shadow-[0_0px_1px_rgba(0,0,0,0.3)] active:translate-y-[1px]"
							>
								<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="#1b1b1b">
									<path d="M8 2l6 6H9v6H7V8H2z" />
								</svg>
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
