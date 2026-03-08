import { useEffect } from "react";
import { useThreads } from "../hooks/use-threads";
import { useChat } from "../hooks/use-chat";
import { Sidebar } from "./sidebar";
import { ChatView } from "./chat-view";
import { onRpcMessage } from "../rpc-events";

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
		getThreadStatus,
	} = useChat(rpc, activeThreadId);

	useEffect(() => {
		const unsubs = [
			onRpcMessage("onStreamChunk", handleStreamChunk),
			onRpcMessage("onQueryResult", handleQueryResult),
			onRpcMessage("onPermissionRequest", handlePermissionRequest),
			onRpcMessage("onThreadUpdated", updateThreadInList),
		];
		return () => unsubs.forEach((fn) => fn());
	}, [handleStreamChunk, handleQueryResult, handlePermissionRequest, updateThreadInList]);

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
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [addProject, createThreadInProject, activeThread]);

	return (
		<div className="flex h-screen bg-[#181818] text-[#c9ccd1]">
			<Sidebar
				threads={threads}
				activeThreadId={activeThreadId}
				getThreadStatus={getThreadStatus}
				onSelect={setActiveThreadId}
				onAddProject={addProject}
				onNewThread={createThreadInProject}
				onDelete={deleteThread}
				onRename={renameThread}
				onPin={pinThread}
			/>
			<ChatView
				rpc={rpc}
				thread={activeThread}
				messages={messages}
				isStreaming={isStreaming}
				onSend={sendMessage}
				onRetry={retryFromMessage}
				onInterrupt={interruptQuery}
				permissionRequest={permissionRequest}
				onResolvePermission={resolvePermission}
				onThreadUpdated={updateThreadInList}
			/>
		</div>
	);
}
