import { useEffect, useRef, useState, useCallback, memo, useImperativeHandle, forwardRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { onRpcMessage } from "../rpc-events";
import "@xterm/xterm/css/xterm.css";

type TerminalTab = {
	id: string;
	title: string;
	hasActivity: boolean;
};

type Props = {
	rpc: any;
	cwd: string;
	isOpen: boolean;
	height: number;
	onResize: (height: number) => void;
	onClose: () => void;
	onOpenExternal: (url: string) => void;
};

const THEME = {
	background: "#181818",
	foreground: "#c9ccd1",
	cursor: "#e0e0e0",
	cursorAccent: "#181818",
	selectionBackground: "#3a3d4166",
	selectionForeground: "#e0e0e0",
	black: "#1e1e1e",
	red: "#f87171",
	green: "#4ade80",
	yellow: "#fbbf24",
	blue: "#60a5fa",
	magenta: "#c084fc",
	cyan: "#22d3ee",
	white: "#e0e0e0",
	brightBlack: "#555",
	brightRed: "#fca5a5",
	brightGreen: "#86efac",
	brightYellow: "#fde68a",
	brightBlue: "#93c5fd",
	brightMagenta: "#d8b4fe",
	brightCyan: "#67e8f9",
	brightWhite: "#ffffff",
};

export type TerminalPanelHandle = {
	runCommand: (command: string) => void;
};

type TermInstance = {
	terminal: Terminal;
	fitAddon: FitAddon;
	containerEl: HTMLDivElement;
	initialized: boolean;
};

export const TerminalPanel = memo(forwardRef<TerminalPanelHandle, Props>(function TerminalPanel({
	rpc,
	cwd,
	isOpen,
	height,
	onResize,
	onClose,
	onOpenExternal,
}: Props, ref) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const instancesRef = useRef<Map<string, TermInstance>>(new Map());
	const [tabs, setTabs] = useState<TerminalTab[]>([]);
	const [activeTabId, setActiveTabId] = useState<string | null>(null);
	const activeTabIdRef = useRef<string | null>(null);
	const dragStartRef = useRef<{ startY: number; startHeight: number } | null>(null);
	const cwdRef = useRef(cwd);
	cwdRef.current = cwd;

	// Expose runCommand to parent via ref
	useImperativeHandle(ref, () => ({
		runCommand: (command: string) => {
			const id = activeTabIdRef.current;
			if (!id) return;
			const cmd = command.endsWith("\n") ? command : command + "\n";
			rpc.send.writeTerminal({ id, data: cmd });
		},
	}), [rpc]);

	// Create a new terminal tab
	const createTab = useCallback(() => {
		const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
		setTabs((prev) => [...prev, { id, title: "zsh", hasActivity: false }]);
		setActiveTabId(id);
		return id;
	}, []);

	// Close a terminal tab
	const closeTab = useCallback((id: string) => {
		const inst = instancesRef.current.get(id);
		if (inst) {
			inst.terminal.dispose();
			inst.containerEl.remove();
			instancesRef.current.delete(id);
		}
		try { rpc?.request.destroyTerminal({ id }); } catch {}

		setTabs((prev) => {
			const next = prev.filter((t) => t.id !== id);
			if (next.length === 0) onClose();
			return next;
		});
		setActiveTabId((current) => {
			if (current !== id) return current;
			// Switch to last remaining tab
			const remaining: TerminalTab[] = [];
			setTabs((prev) => { remaining.push(...prev); return prev; });
			const filtered = remaining.filter((t) => t.id !== id);
			return filtered.length > 0 ? filtered[filtered.length - 1].id : null;
		});
	}, [rpc, onClose]);

	// Clean up all instances when panel closes (DOM gets unmounted)
	useEffect(() => {
		if (!isOpen) {
			for (const [id, inst] of instancesRef.current) {
				inst.terminal.dispose();
				try { rpc?.request.destroyTerminal({ id }); } catch {}
			}
			instancesRef.current.clear();
			setTabs([]);
			setActiveTabId(null);
		}
	}, [isOpen, rpc]);

	// Auto-create first tab when opened
	useEffect(() => {
		if (isOpen && tabs.length === 0) {
			createTab();
		}
	}, [isOpen, tabs.length, createTab]);

	// Track active tab id in ref
	useEffect(() => {
		activeTabIdRef.current = activeTabId;
	}, [activeTabId]);

	// Initialize terminal instance when a new tab becomes active
	useEffect(() => {
		if (!isOpen || !activeTabId || !wrapperRef.current) return;

		let inst = instancesRef.current.get(activeTabId);

		if (!inst) {
			// Create a dedicated container div for this terminal
			const containerEl = document.createElement("div");
			containerEl.style.width = "100%";
			containerEl.style.height = "100%";
			containerEl.style.display = "none"; // hidden until we show it
			wrapperRef.current.appendChild(containerEl);

			const terminal = new Terminal({
				theme: THEME,
				fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', 'Menlo', monospace",
				fontSize: 13,
				lineHeight: 1.35,
				cursorBlink: true,
				cursorStyle: "bar",
				scrollback: 1000,
				allowProposedApi: true,
				convertEol: true,
				macOptionIsMeta: true,
				macOptionClickForcesSelection: true,
			});

			const fitAddon = new FitAddon();
			terminal.loadAddon(fitAddon);
			terminal.loadAddon(new WebLinksAddon((_event, uri) => {
				onOpenExternal(uri);
			}));

			// Open into its dedicated container (only called once per terminal)
			terminal.open(containerEl);

			inst = { terminal, fitAddon, containerEl, initialized: false };
			instancesRef.current.set(activeTabId, inst);

			// Need to show and fit before getting cols/rows
			containerEl.style.display = "";

			// Fit after a frame so the container has dimensions
			requestAnimationFrame(() => {
				const i = instancesRef.current.get(activeTabId);
				if (!i || i.initialized) return;
				i.initialized = true;

				try { i.fitAddon.fit(); } catch {}
				const { cols, rows } = i.terminal;

				// Create PTY in main process
				rpc.request.createTerminal({ id: activeTabId, cwd: cwdRef.current, cols, rows }).catch((e: any) => {
					console.error("[terminal] Failed to create PTY:", e);
				});

				// User input → PTY
				i.terminal.onData((data: string) => {
					rpc.send.writeTerminal({ id: activeTabId, data });
				});

				// Handle title changes
				i.terminal.onTitleChange((title: string) => {
					setTabs((prev) =>
						prev.map((t) => (t.id === activeTabId ? { ...t, title: title || "zsh" } : t)),
					);
				});

				i.terminal.focus();
			});
		}

		// Show/hide: only the active tab's container is visible
		for (const [id, other] of instancesRef.current) {
			other.containerEl.style.display = id === activeTabId ? "" : "none";
		}

		// Refit active terminal, only steal focus if terminal area already has it
		if (inst.initialized) {
			requestAnimationFrame(() => {
				try { inst!.fitAddon.fit(); } catch {}
				const active = document.activeElement;
				const isTerminalFocused = active && inst!.terminal.element?.contains(active);
				const isChatFocused = active?.tagName === "TEXTAREA" || active?.tagName === "INPUT";
				if (!isChatFocused || isTerminalFocused) {
					inst!.terminal.focus();
				}
			});
		}
	}, [isOpen, activeTabId, rpc, onOpenExternal]);

	// Listen for PTY data → xterm
	useEffect(() => {
		const unsubs = [
			onRpcMessage("onTerminalData", ({ id, data }: { id: string; data: string }) => {
				const inst = instancesRef.current.get(id);
				if (inst) {
					inst.terminal.write(data);
					if (id !== activeTabIdRef.current) {
						setTabs((prev) =>
							prev.map((t) => (t.id === id ? { ...t, hasActivity: true } : t)),
						);
					}
				}
			}),
			onRpcMessage("onTerminalExit", ({ id }: { id: string; exitCode: number }) => {
				const inst = instancesRef.current.get(id);
				if (inst) {
					inst.terminal.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
				}
			}),
		];
		return () => unsubs.forEach((fn) => fn());
	}, []);

	// Refit on height change
	useEffect(() => {
		if (!isOpen || !activeTabId) return;
		const inst = instancesRef.current.get(activeTabId);
		if (!inst?.initialized) return;

		const timer = setTimeout(() => {
			try {
				inst.fitAddon.fit();
				const { cols, rows } = inst.terminal;
				rpc.send.resizeTerminal({ id: activeTabId, cols, rows });
			} catch {}
		}, 50);
		return () => clearTimeout(timer);
	}, [height, isOpen, activeTabId, rpc]);

	// Refit on window resize
	useEffect(() => {
		if (!isOpen) return;
		const handleResize = () => {
			const id = activeTabIdRef.current;
			if (!id) return;
			const inst = instancesRef.current.get(id);
			if (!inst?.initialized) return;
			try {
				inst.fitAddon.fit();
				const { cols, rows } = inst.terminal;
				rpc.send.resizeTerminal({ id, cols, rows });
			} catch {}
		};
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [isOpen, rpc]);

	// Drag handle for resizing
	const handleDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			dragStartRef.current = { startY: e.clientY, startHeight: height };

			const handleMouseMove = (e: MouseEvent) => {
				if (!dragStartRef.current) return;
				const delta = dragStartRef.current.startY - e.clientY;
				// Leave at least 60px for the chat title bar (window controls)
				const newHeight = Math.max(120, Math.min(window.innerHeight - 60, dragStartRef.current.startHeight + delta));
				onResize(newHeight);
			};

			const handleMouseUp = () => {
				dragStartRef.current = null;
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
			};

			document.body.style.cursor = "row-resize";
			document.body.style.userSelect = "none";
			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
		},
		[height, onResize],
	);

	if (!isOpen) return null;

	return (
		<div className="flex flex-col border-t border-[#2a2b2e]" style={{ height, minHeight: 120 }}>
			{/* Drag handle */}
			<div
				className="h-[3px] cursor-row-resize hover:bg-blue-500/40 transition-colors flex-shrink-0"
				onMouseDown={handleDragStart}
			/>

			{/* Tab bar */}
			<div className="flex items-center h-[36px] bg-[#1b1b1b] border-b border-[#232428] flex-shrink-0 px-2 gap-1">
				<div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							onClick={() => {
								setActiveTabId(tab.id);
								setTabs((prev) =>
									prev.map((t) => (t.id === tab.id ? { ...t, hasActivity: false } : t)),
								);
							}}
							className={`flex items-center gap-1.5 px-3 py-1 text-[12px] rounded-md transition-colors cursor-pointer group/tab flex-shrink-0 ${
								tab.id === activeTabId
									? "bg-[#232428] text-[#e0e0e0]"
									: "text-[#666] hover:text-[#999] hover:bg-[#1e1e1e]"
							}`}
						>
							{tab.hasActivity && tab.id !== activeTabId && (
								<span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
							)}
							<svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
								<path d="M4 5l3 3-3 3" />
								<path d="M9 11h3" />
							</svg>
							<span className="truncate max-w-[100px]">{tab.title}</span>
							<span
								onClick={(e) => {
									e.stopPropagation();
									closeTab(tab.id);
								}}
								className="w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover/tab:opacity-100 hover:bg-[#333] transition-all flex-shrink-0"
							>
								<svg className="w-2.5 h-2.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
									<path d="M4 4l8 8M12 4l-8 8" />
								</svg>
							</span>
						</button>
					))}
					<button
						onClick={createTab}
						className="w-6 h-6 flex items-center justify-center rounded-md text-[#555] hover:text-[#999] hover:bg-[#232428] transition-colors cursor-pointer flex-shrink-0"
						title="New Terminal"
					>
						<svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
							<path d="M8 3v10M3 8h10" />
						</svg>
					</button>
				</div>

				<div className="flex items-center gap-1 flex-shrink-0 ml-2">
					<button
						onClick={onClose}
						className="w-6 h-6 flex items-center justify-center rounded-md text-[#555] hover:text-[#999] hover:bg-[#232428] transition-colors cursor-pointer"
						title="Close Terminal (Ctrl+`)"
					>
						<svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
							<path d="M4 4l8 8M12 4l-8 8" />
						</svg>
					</button>
				</div>
			</div>

			{/* Terminal surfaces — one div per tab, show/hide via the effect */}
			<div
				ref={wrapperRef}
				className="flex-1 bg-[#181818] overflow-hidden"
				style={{ padding: "4px 8px" }}
			/>
		</div>
	);
}));
