import { useState, useEffect } from "react";
import type { AppSettings } from "../../bun/types";

type Props = {
	rpc: any;
	onClose: () => void;
};

export function SettingsModal({ rpc, onClose }: Props) {
	const [groqApiKey, setGroqApiKey] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		rpc.request.getSettings({}).then((settings: AppSettings) => {
			setGroqApiKey(settings.groqApiKey ?? "");
			setLoading(false);
		});
	}, [rpc]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onClose]);

	const handleSave = async () => {
		setSaving(true);
		const settings: AppSettings = {
			groqApiKey: groqApiKey.trim() || undefined,
		};
		await rpc.request.updateSettings(settings);
		setSaving(false);
		onClose();
	};

	return (
		<div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/50" onClick={onClose}>
			<div
				className="bg-[#1e1e1e] border border-[#333] rounded-lg p-6 w-[420px] shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				<h3
					className="text-white text-[17px] font-semibold mb-5"
					style={{ fontFamily: "'Geist', sans-serif" }}
				>
					Settings
				</h3>

				{loading ? (
					<div className="text-[#666] text-[13px] py-4 text-center">Loading...</div>
				) : (
					<div className="space-y-4">
						{/* Groq API Key */}
						<div>
							<label
								className="block text-[13px] text-[#999] mb-1.5 font-medium"
								style={{ fontFamily: "'Geist', sans-serif" }}
							>
								Groq API Key
							</label>
							<input
								type="password"
								value={groqApiKey}
								onChange={(e) => setGroqApiKey(e.target.value)}
								placeholder="gsk_..."
								spellCheck={false}
								className="w-full bg-[#2a2a2a] border border-[#444] rounded px-3 py-2 text-[13px] text-white placeholder-[#555] outline-none focus:border-[#666] transition-colors"
								style={{ fontFamily: "'Geist Mono', monospace" }}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleSave();
								}}
							/>
							<p className="text-[11px] text-[#555] mt-1.5">
								For upcoming Groq-powered features. Get your key at{" "}
								<span className="text-[#777]">console.groq.com</span>
							</p>
						</div>
					</div>
				)}

				{/* Actions */}
				<div className="flex items-center justify-end gap-2 mt-6">
					<button
						onClick={onClose}
						className="px-3 py-1.5 text-[13px] text-[#999] hover:text-white rounded border border-[#333] hover:border-[#555] transition-colors cursor-pointer"
					>
						Cancel
					</button>
					<button
						onClick={handleSave}
						disabled={loading || saving}
						className="px-4 py-1.5 text-[13px] text-white bg-[#333] hover:bg-[#444] rounded border border-[#555] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{saving ? "Saving..." : "Save"}
					</button>
				</div>
			</div>
		</div>
	);
}
