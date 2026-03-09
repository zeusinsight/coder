import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { useThreads } from "../hooks/use-threads";
import { useChat } from "../hooks/use-chat";
import { Sidebar } from "./sidebar";
import { ChatView } from "./chat-view";
import { onRpcMessage } from "../rpc-events";
import { TerminalContext } from "../hooks/use-terminal";

// Lazy-load heavy components that aren't needed at startup
const TerminalPanel = lazy(() => import("./terminal-panel").then(m => ({ default: m.TerminalPanel })));
const SettingsModal = lazy(() => import("./settings-modal").then(m => ({ default: m.SettingsModal })));
const SearchOverlay = lazy(() => import("./search-overlay").then(m => ({ default: m.SearchOverlay })));

type TerminalPanelHandle = import("./terminal-panel").TerminalPanelHandle;

type Props = {
	electroview: { rpc: any };
};

export function App({ electroview }: Props) {
	const rpc = electroview.rpc;
	const {
		threads,
		activeThread,
		activeThreadId,
		setActiveThreadId,
		addProject,
		createThreadInProject,
		deleteThread,
		renameThread,
		pinThread,
		updateThreadInList,
	} = useThreads(rpc);

	const {
		messages,
		isStreaming,
		permissionRequest,
		sendMessage,
		retryFromMessage,
		interruptQuery,
		resolvePermission,
		handleStreamChunk,
		handleQueryResult,
		handlePermissionRequest,
		handleContextUsage,
		contextUsage,
		getThreadStatus,
		cleanupThread,
		preloadThread,
	} = useChat(rpc, activeThreadId);

	const [showSettings, setShowSettings] = useState(false);
	const [showSearch, setShowSearch] = useState(false);
	const [showTerminal, setShowTerminal] = useState(false);
	const [terminalHeight, setTerminalHeight] = useState(280);
	const terminalRef = useRef<TerminalPanelHandle>(null);

	const terminalContext = useMemo(() => ({
		runCommand: (command: string) => {
			// Open terminal if not already open
			setShowTerminal(true);
			// Small delay to ensure terminal is mounted before sending command
			setTimeout(() => {
				terminalRef.current?.runCommand(command);
			}, showTerminal ? 0 : 300);
		},
		isOpen: showTerminal,
	}), [showTerminal]);

	const handleDeleteThread = useCallback((id: string) => {
		deleteThread(id);
		cleanupThread(id);
	}, [deleteThread, cleanupThread]);

	useEffect(() => {
		const unsubs = [
			onRpcMessage("onStreamChunk", handleStreamChunk),
			onRpcMessage("onQueryResult", handleQueryResult),
			onRpcMessage("onPermissionRequest", handlePermissionRequest),
			onRpcMessage("onThreadUpdated", updateThreadInList),
			onRpcMessage("onContextUsage", handleContextUsage),
		];
		return () => unsubs.forEach((fn) => fn());
	}, [handleStreamChunk, handleQueryResult, handlePermissionRequest, updateThreadInList, handleContextUsage]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "n") {
				e.preventDefault();
				if (activeThread) {
					createThreadInProject(activeThread.cwd);
				} else {
					addProject();
				}
			}
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setShowSearch((s) => !s);
			}
			// Ctrl+` or Cmd+J to toggle terminal
			if ((e.ctrlKey && e.key === "`") || (e.metaKey && e.key === "j")) {
				e.preventDefault();
				setShowTerminal((s) => !s);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [addProject, createThreadInProject, activeThread]);

	return (
		<TerminalContext.Provider value={terminalContext}>
			<div className="flex h-screen bg-[#181818] text-[#c9ccd1]">
				<Sidebar
					rpc={rpc}
					threads={threads}
					activeThreadId={activeThreadId}
					getThreadStatus={getThreadStatus}
					onSelect={setActiveThreadId}
					onAddProject={addProject}
					onNewThread={createThreadInProject}
					onDelete={handleDeleteThread}
					onRename={renameThread}
					onPin={pinThread}
					onOpenSettings={() => setShowSettings(true)}
				onPreloadThread={preloadThread}
				/>
				<div className="flex-1 flex flex-col min-w-0">
					<ChatView
						rpc={rpc}
						thread={activeThread}
						messages={messages}
						isStreaming={isStreaming}
						contextUsage={contextUsage}
						onSend={sendMessage}
						onRetry={retryFromMessage}
						onInterrupt={interruptQuery}
						permissionRequest={permissionRequest}
						onResolvePermission={resolvePermission}
						onThreadUpdated={updateThreadInList}
						onToggleTerminal={() => setShowTerminal((s) => !s)}
						showTerminal={showTerminal}
					/>
					<Suspense fallback={null}>
						<TerminalPanel
							ref={terminalRef}
							rpc={rpc}
							cwd={activeThread?.cwd ?? "/"}
							isOpen={showTerminal}
							height={terminalHeight}
							onResize={setTerminalHeight}
							onClose={() => setShowTerminal(false)}
							onOpenExternal={(url) => rpc.send.openExternal({ url })}
						/>
					</Suspense>
				</div>
				{showSettings && (
					<Suspense fallback={null}>
						<SettingsModal rpc={rpc} onClose={() => setShowSettings(false)} />
					</Suspense>
				)}
				{showSearch && (
					<Suspense fallback={null}>
						<SearchOverlay
							rpc={rpc}
							onSelect={setActiveThreadId}
							onClose={() => setShowSearch(false)}
						/>
					</Suspense>
				)}
			</div>
		</TerminalContext.Provider>
	);
}
