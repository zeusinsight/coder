import { useState } from "react";
import type { PermissionRequest } from "../../bun/types";

type Props = {
	request: PermissionRequest;
	onResolve: (allow: boolean, updatedInput?: Record<string, unknown>) => void;
};

type AskQuestion = {
	question: string;
	header: string;
	options: { label: string; description: string }[];
	multiSelect: boolean;
};

function isAskUserQuestion(request: PermissionRequest): boolean {
	return (
		request.toolName === "AskUserQuestion" &&
		Array.isArray((request.toolInput as any)?.questions)
	);
}

function AskUserQuestionDialog({ request, onResolve }: Props) {
	const questions = (request.toolInput as { questions: AskQuestion[] }).questions;
	const [answers, setAnswers] = useState<Record<string, string>>({});

	const setAnswer = (question: string, value: string) => {
		setAnswers((prev) => ({ ...prev, [question]: value }));
	};

	const allAnswered = questions.every((q) => answers[q.question]);

	const handleSubmit = () => {
		onResolve(true, { ...request.toolInput, answers });
	};

	return (
		<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
			<div className="bg-[#232428] border border-[#2a2b2e] rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6">
				{questions.map((q) => (
					<div key={q.question} className="mb-5">
						<p className="text-sm font-medium text-[#e0e0e0] mb-1">{q.header}</p>
						<p className="text-sm text-[#999] mb-3">{q.question}</p>
						<div className="flex flex-col gap-2">
							{q.options.map((opt) => (
								<button
									key={opt.label}
									onClick={() => setAnswer(q.question, opt.label)}
									className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
										answers[q.question] === opt.label
											? "border-blue-500 bg-blue-600/20 text-white"
											: "border-[#333] bg-[#1e1f22] text-[#999] hover:border-[#444]"
									}`}
								>
									<span className="font-medium">{opt.label}</span>
									<span className="text-[#666] ml-2">- {opt.description}</span>
								</button>
							))}
						</div>
					</div>
				))}
				<div className="flex gap-3 justify-end mt-2">
					<button
						onClick={() => onResolve(false)}
						className="px-4 py-2 bg-[#2a2b2e] hover:bg-[#333] text-[#999] text-sm font-medium rounded-lg transition-colors border border-[#333]"
					>
						Dismiss
					</button>
					<button
						onClick={handleSubmit}
						disabled={!allAnswered}
						className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
					>
						Submit
					</button>
				</div>
			</div>
		</div>
	);
}

export function PermissionDialog({ request, onResolve }: Props) {
	if (isAskUserQuestion(request)) {
		return <AskUserQuestionDialog request={request} onResolve={onResolve} />;
	}

	return (
		<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
			<div className="bg-[#232428] border border-[#2a2b2e] rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6">
				<h3 className="text-lg font-semibold text-[#e0e0e0] mb-2">Permission Request</h3>
				<p className="text-sm text-[#888] mb-4">
					Claude wants to use <span className="text-blue-400 font-mono">{request.toolName}</span>
				</p>
				<div className="bg-[#1a1b1e] rounded-lg p-3 mb-5 max-h-60 overflow-y-auto border border-[#2a2b2e]">
					<pre className="text-xs text-[#999] whitespace-pre-wrap font-mono">
						{JSON.stringify(request.toolInput, null, 2)}
					</pre>
				</div>
				<div className="flex gap-3 justify-end">
					<button
						onClick={() => onResolve(false)}
						className="px-4 py-2 bg-[#2a2b2e] hover:bg-[#333] text-[#999] text-sm font-medium rounded-lg transition-colors border border-[#333]"
					>
						Deny
					</button>
					<button
						onClick={() => onResolve(true)}
						className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
					>
						Allow
					</button>
				</div>
			</div>
		</div>
	);
}
