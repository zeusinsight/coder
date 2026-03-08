import { useState, useEffect, useCallback } from "react";
import type { Thread } from "../../bun/types";

export function useThreads(rpc: any) {
	const [threads, setThreads] = useState<Thread[]>([]);
	const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

	const loadThreads = useCallback(async () => {
		if (!rpc) return;
		const list = await rpc.request.listThreads({});
		setThreads(list);
	}, [rpc]);

	useEffect(() => {
		loadThreads();
	}, [loadThreads]);

	// Open directory picker, then create first thread in that project
	const addProject = useCallback(async () => {
		if (!rpc) return null;
		const dir = await rpc.request.pickDirectory({});
		if (!dir) return null;
		const thread = await rpc.request.createThread({ cwd: dir });
		setThreads((prev) => [thread, ...prev]);
		setActiveThreadId(thread.id);
		return thread;
	}, [rpc]);

	// Create a new thread in an existing project (no directory picker)
	const createThreadInProject = useCallback(
		async (cwd: string) => {
			if (!rpc) return null;
			const thread = await rpc.request.createThread({ cwd });
			setThreads((prev) => [thread, ...prev]);
			setActiveThreadId(thread.id);
			return thread;
		},
		[rpc]
	);

	const deleteThread = useCallback(
		async (id: string) => {
			if (!rpc) return;
			await rpc.request.deleteThread({ id });
			setThreads((prev) => prev.filter((t) => t.id !== id));
			if (activeThreadId === id) {
				setActiveThreadId(null);
			}
		},
		[rpc, activeThreadId]
	);

	const renameThread = useCallback(
		async (id: string, title: string) => {
			if (!rpc) return;
			const updated = await rpc.request.renameThread({ id, title });
			setThreads((prev) => prev.map((t) => (t.id === id ? updated : t)));
		},
		[rpc]
	);

	const pinThread = useCallback(
		async (id: string, pinned: boolean) => {
			if (!rpc) return;
			const updated = await rpc.request.pinThread({ id, pinned });
			setThreads((prev) =>
				prev
					.map((t) => (t.id === id ? updated : t))
					.sort((a, b) => {
						if (a.pinned && !b.pinned) return -1;
						if (!a.pinned && b.pinned) return 1;
						return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
					})
			);
		},
		[rpc]
	);

	const updateThreadInList = useCallback((thread: Thread) => {
		setThreads((prev) => {
			const exists = prev.find((t) => t.id === thread.id);
			if (exists) {
				return prev
					.map((t) => (t.id === thread.id ? thread : t))
					.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
			}
			return [thread, ...prev];
		});
	}, []);

	const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

	return {
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
	};
}
