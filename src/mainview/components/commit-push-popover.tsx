import { useState, useEffect, useRef } from "react";
import type { AppSettings } from "../../bun/types";

type Props = {
	rpc: any;
	cwd: string;
	onClose: () => void;
};

export function CommitPushPopover({ rpc, cwd, onClose }: Props) {
	const [message, setMessage] = useState("");
	const [generating, setGenerating] = useState(false);
	const [pushing, setPushing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Auto-generate commit message if user has a Groq API key
	useEffect(() => {
		let cancelled = false;
		rpc.request.getSettings({}).then((settings: AppSettings) => {
			if (cancelled) return;
			if (settings.groqApiKey) {
				setGenerating(true);
				rpc.request.generateCommitMessage({ cwd }).then((result: { message: string; error?: string }) => {
					if (cancelled) return;
					setGenerating(false);
					if (result.error) {
						setError(result.error);
					} else if (result.message) {
						setMessage(result.message);
					}
				}).catch(() => {
					if (!cancelled) setGenerating(false);
				});
			} else {
				inputRef.current?.focus();
			}
		});
		return () => { cancelled = true; };
	}, [rpc, cwd]);

	// Close on click outside
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) onClose();
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [onClose]);

	// Close on Escape
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onClose]);

	// Focus input when generation completes
	useEffect(() => {
		if (!generating && message) {
			inputRef.current?.focus();
		}
	}, [generating, message]);

	const handleCommitAndPush = async () => {
		if (!message.trim()) return;
		setPushing(true);
		setError(null);
		try {
			const result = await rpc.request.commitAndPush({ cwd, message: message.trim() });
			if (result.success) {
				setSuccess(true);
				setTimeout(onClose, 1200);
			} else {
				setError(result.error ?? "Failed to commit and push");
				setPushing(false);
			}
		} catch (e: any) {
			setError(e.message ?? "Failed to commit and push");
			setPushing(false);
		}
	};

	return (
		<div
			ref={ref}
			className="absolute top-full right-0 mt-1 w-[380px] bg-[#1b1b1b] border border-[#333] rounded-lg shadow-2xl z-[200]"
			onMouseDown={(e) => e.stopPropagation()}
		>
			<div className="p-4">
				<div className="flex items-center gap-2 mb-3">
					<svg className="w-4 h-4 text-[#999]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
						<path d="M12 2v6M12 12v2M4 2v2M4 8v6" />
						<circle cx="4" cy="6" r="2" />
						<circle cx="12" cy="10" r="2" />
					</svg>
					<span className="text-[13px] text-[#e0e0e0] font-medium" style={{ fontFamily: "'Geist', sans-serif" }}>
						Commit & Push
					</span>
				</div>

				{generating ? (
					<div className="flex items-center gap-2 py-3 px-3 bg-[#232428] rounded-md mb-3">
						<svg className="w-3.5 h-3.5 animate-spin text-[#888]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
							<path d="M2 8a6 6 0 0110.5-4M14 2v4h-4" />
						</svg>
						<span className="text-[13px] text-[#888]">Generating commit message...</span>
					</div>
				) : (
					<textarea
						ref={inputRef as any}
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								handleCommitAndPush();
							}
						}}
						placeholder="Commit message..."
						disabled={pushing || success}
						rows={4}
						className="w-full bg-[#232428] border border-[#333] rounded-md px-3 py-2 text-[13px] text-white placeholder-[#555] outline-none focus:border-[#555] transition-colors mb-3 disabled:opacity-50 resize-none"
						style={{ fontFamily: "'Geist Mono', monospace" }}
					/>
				)}

				{error && (
					<div className="text-[12px] text-red-400 mb-3 px-1 break-words max-h-[60px] overflow-y-auto">
						{error}
					</div>
				)}

				{success ? (
					<div className="flex items-center gap-2 text-[13px] text-emerald-400">
						<svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M13 4L6 11L3 8" />
						</svg>
						Pushed successfully
					</div>
				) : (
					<button
						onClick={handleCommitAndPush}
						disabled={generating || pushing || !message.trim()}
						className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[13px] text-white bg-[#333] hover:bg-[#444] rounded-md border border-[#555] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
					>
						{pushing ? (
							<>
								<svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
									<path d="M2 8a6 6 0 0110.5-4M14 2v4h-4" />
								</svg>
								Pushing...
							</>
						) : (
							<>
								<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
									<path d="M8 13V3M4 7l4-4 4 4" />
								</svg>
								Commit & Push
							</>
						)}
					</button>
				)}
			</div>
		</div>
	);
}
