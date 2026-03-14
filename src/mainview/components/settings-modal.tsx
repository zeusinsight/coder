import { useState, useEffect } from "react";
import type { AppSettings } from "../../bun/types";
import { HARNESSES, CLAUDE_MODELS } from "./chat-toolbar-selectors";

type Props = {
	rpc: any;
	onClose: () => void;
};

// Models available per harness id (only unlocked harnesses with real model lists)
const HARNESS_MODELS: Record<string, { id: string; label: string }[]> = {
	claude: CLAUDE_MODELS.map(({ id, label }) => ({ id, label })),
};

export function SettingsModal({ rpc, onClose }: Props) {
	const [groqApiKey, setGroqApiKey] = useState("");
	const [defaultModels, setDefaultModels] = useState<Record<string, string>>({});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		rpc.request.getSettings({}).then((settings: AppSettings) => {
			setGroqApiKey(settings.groqApiKey ?? "");
			setDefaultModels(settings.defaultModels ?? {});
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
			defaultModels: Object.keys(defaultModels).length > 0 ? defaultModels : undefined,
		};
		await rpc.request.updateSettings(settings);
		setSaving(false);
		onClose();
	};

	const setDefaultModel = (harnessId: string, modelId: string) => {
		setDefaultModels((prev) => ({ ...prev, [harnessId]: modelId }));
	};

	// Unlocked harnesses that have model options
	const configurableHarnesses = HARNESSES.filter((h) => !h.locked && HARNESS_MODELS[h.id]);

	return (
		<div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/50" onClick={onClose}>
			<div
				className="bg-[#1e1e1e] border border-[#2a2b2e] rounded-md p-6 w-[460px] shadow-2xl"
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
					<div className="space-y-6">
						{/* Default Models */}
						<div>
							<label
								className="block text-[13px] text-[#999] mb-3 font-medium"
								style={{ fontFamily: "'Geist', sans-serif" }}
							>
								Default Model
							</label>
							<div className="space-y-3">
								{configurableHarnesses.map((harness) => {
									const models = HARNESS_MODELS[harness.id];
									const selected = defaultModels[harness.id] ?? models[0].id;
									return (
										<div key={harness.id}>
											<div className="flex items-center gap-2 mb-2">
												<span className="text-[#666]">{harness.icon}</span>
												<span
													className="text-[12px] text-[#666]"
													style={{ fontFamily: "'Geist', sans-serif" }}
												>
													{harness.label}
												</span>
											</div>
											<div className="flex gap-1.5 flex-wrap">
												{models.map((model) => {
													const isSelected = selected === model.id;
													return (
														<button
															key={model.id}
															onClick={() => setDefaultModel(harness.id, model.id)}
															className={`px-3 py-1.5 rounded-md text-[12px] transition-colors cursor-pointer border ${
																isSelected
																	? "bg-[#2a2b2e] border-[#555] text-white"
																	: "bg-transparent border-[#333] text-[#777] hover:border-[#444] hover:text-[#aaa]"
															}`}
															style={{ fontFamily: "'Geist', sans-serif" }}
														>
															{model.label}
														</button>
													);
												})}
											</div>
										</div>
									);
								})}
							</div>
						</div>

						{/* Divider */}
						<div className="border-t border-[#2a2b2e]" />

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
								className="w-full bg-[#2a2a2a] border border-[#333] rounded-md px-3 py-2 text-[13px] text-white placeholder-[#555] outline-none focus:border-[#666] transition-colors"
								style={{ fontFamily: "'Geist Mono', monospace" }}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleSave();
								}}
							/>
						</div>
					</div>
				)}

				{/* Actions */}
				<div className="flex items-center justify-end gap-2 mt-6">
					<button
						onClick={onClose}
						className="px-3 py-1.5 text-[13px] text-[#999] hover:text-white rounded-md border border-[#333] hover:border-[#555] transition-colors cursor-pointer"
					>
						Cancel
					</button>
					<button
						onClick={handleSave}
						disabled={loading || saving}
						className="px-4 py-1.5 text-[13px] text-white bg-[#333] hover:bg-[#444] rounded-md border border-[#555] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{saving ? "Saving..." : "Save"}
					</button>
				</div>
			</div>
		</div>
	);
}
