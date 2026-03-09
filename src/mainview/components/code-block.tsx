import { useState, useEffect, useRef, memo } from "react";
import { createHighlighter, type Highlighter } from "shiki";

type Props = {
	code: string;
	language: string;
	onRunInTerminal?: (command: string) => void;
};

const SHELL_LANGUAGES = new Set(["sh", "bash", "zsh", "shell", ""]);

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

// Singleton highlighter — loads languages on demand, NOT all 300+ upfront
let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>();

function getHighlighter(): Promise<Highlighter> {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: ["github-dark-default"],
			langs: [], // start empty — load on demand
		});
	}
	return highlighterPromise;
}

async function highlight(code: string, lang: string): Promise<string> {
	const hl = await getHighlighter();
	const normalizedLang = lang || "text";

	// Lazy-load the language grammar if not yet loaded
	if (normalizedLang !== "text" && !loadedLangs.has(normalizedLang)) {
		try {
			await hl.loadLanguage(normalizedLang as any);
			loadedLangs.add(normalizedLang);
		} catch {
			// Language not supported — fall back to text
			return hl.codeToHtml(code, { lang: "text", theme: "github-dark-default" });
		}
	}

	return hl.codeToHtml(code, { lang: normalizedLang, theme: "github-dark-default" });
}

// LRU cache for shiki highlighting results (move-to-front on access)
const shikiCache = new Map<string, string>();
const SHIKI_CACHE_MAX = 200;
const SHIKI_CACHE_MAX_BYTES = 5 * 1024 * 1024; // 5MB total budget
let shikiCacheBytes = 0;

function fastHash(str: string): string {
	let h = 0;
	for (let i = 0; i < str.length; i++) {
		h = ((h << 5) - h + str.charCodeAt(i)) | 0;
	}
	return h.toString(36);
}

function getCacheKey(code: string, lang: string): string {
	return `${lang}:${fastHash(code)}:${code.length}`;
}

export const CodeBlock = memo(function CodeBlock({ code, language, onRunInTerminal }: Props) {
	const [html, setHtml] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [ran, setRan] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout>>();

	const isShell = SHELL_LANGUAGES.has(language.toLowerCase());
	const canRun = isShell && onRunInTerminal;

	useEffect(() => {
		const key = getCacheKey(code, language || "text");
		const cached = shikiCache.get(key);
		if (cached) {
			// LRU: move to front by re-inserting
			shikiCache.delete(key);
			shikiCache.set(key, cached);
			setHtml(cached);
			return;
		}
		let cancelled = false;
		highlight(code, language || "text")
			.then((result) => {
				if (!cancelled) {
					const resultBytes = result.length * 2; // rough UTF-16 estimate
					// Evict until under budget (both count and bytes)
					while (
						(shikiCache.size >= SHIKI_CACHE_MAX || shikiCacheBytes + resultBytes > SHIKI_CACHE_MAX_BYTES) &&
						shikiCache.size > 0
					) {
						const firstKey = shikiCache.keys().next().value;
						if (firstKey) {
							const evicted = shikiCache.get(firstKey);
							if (evicted) shikiCacheBytes -= evicted.length * 2;
							shikiCache.delete(firstKey);
						}
					}
					shikiCache.set(key, result);
					shikiCacheBytes += resultBytes;
					setHtml(result);
				}
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

	const handleRun = () => {
		if (!onRunInTerminal) return;
		onRunInTerminal(code);
		setRan(true);
		clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => setRan(false), 2000);
	};

	return (
		<div className="rounded-lg border border-[#2a2b2e] overflow-hidden my-3 bg-[#1b1b1b]">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-2 bg-[#232428] border-b border-[#2a2b2e]">
				<span className="text-[12px] text-[#888] font-mono">
					{language ? getLabel(language) : "Code"}
				</span>
				<div className="flex items-center gap-2">
					{canRun && (
						<button
							onClick={handleRun}
							className="flex items-center gap-1.5 text-[12px] text-[#666] hover:text-cyan-400 transition-colors cursor-pointer"
							title="Run in Terminal"
						>
							{ran ? (
								<>
									<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
										<path d="M13 4L6 11L3 8" />
									</svg>
									Sent
								</>
							) : (
								<>
									<svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
										<path d="M4 2l9 6-9 6V2z" />
									</svg>
									Run
								</>
							)}
						</button>
					)}
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
});
