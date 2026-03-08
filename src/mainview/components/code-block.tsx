import { useState, useEffect, useRef } from "react";
import { codeToHtml } from "shiki";

type Props = {
	code: string;
	language: string;
};

const LANGUAGE_LABELS: Record<string, string> = {
	js: "JavaScript",
	jsx: "JavaScript",
	ts: "TypeScript",
	tsx: "TypeScript",
	py: "Python",
	python: "Python",
	rb: "Ruby",
	ruby: "Ruby",
	rs: "Rust",
	rust: "Rust",
	go: "Go",
	java: "Java",
	cpp: "C++",
	c: "C",
	cs: "C#",
	csharp: "C#",
	sh: "Shell",
	bash: "Shell",
	zsh: "Shell",
	shell: "Shell",
	json: "JSON",
	yaml: "YAML",
	yml: "YAML",
	toml: "TOML",
	html: "HTML",
	css: "CSS",
	scss: "SCSS",
	sql: "SQL",
	md: "Markdown",
	markdown: "Markdown",
	dockerfile: "Dockerfile",
	docker: "Dockerfile",
	swift: "Swift",
	kotlin: "Kotlin",
	lua: "Lua",
	php: "PHP",
	xml: "XML",
	graphql: "GraphQL",
};

function getLabel(lang: string) {
	return LANGUAGE_LABELS[lang.toLowerCase()] ?? lang.toUpperCase();
}

export function CodeBlock({ code, language }: Props) {
	const [html, setHtml] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout>>();

	useEffect(() => {
		let cancelled = false;
		codeToHtml(code, {
			lang: language || "text",
			theme: "github-dark-default",
		})
			.then((result) => {
				if (!cancelled) setHtml(result);
			})
			.catch(() => {
				if (!cancelled) setHtml(null);
			});
		return () => { cancelled = true; };
	}, [code, language]);

	const handleCopy = () => {
		navigator.clipboard.writeText(code);
		setCopied(true);
		clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="rounded-lg border border-[#2a2b2e] overflow-hidden my-3 bg-[#1b1b1b]">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-2 bg-[#232428] border-b border-[#2a2b2e]">
				<span className="text-[12px] text-[#888] font-mono">
					{language ? getLabel(language) : "Code"}
				</span>
				<button
					onClick={handleCopy}
					className="flex items-center gap-1.5 text-[12px] text-[#666] hover:text-[#ccc] transition-colors cursor-pointer"
				>
					{copied ? (
						<>
							<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<path d="M13 4L6 11L3 8" />
							</svg>
							Copied
						</>
					) : (
						<>
							<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<rect x="5" y="5" width="8" height="8" rx="1.5" />
								<path d="M3 11V3h8" />
							</svg>
							Copy
						</>
					)}
				</button>
			</div>
			{/* Code */}
			<div className="overflow-x-auto p-4 text-[13px] leading-[1.6] [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:!bg-transparent [&_code]:!p-0 [&_code]:!text-[13px]">
				{html ? (
					<div dangerouslySetInnerHTML={{ __html: html }} />
				) : (
					<pre className="text-[#e0e0e0]"><code>{code}</code></pre>
				)}
			</div>
		</div>
	);
}
