// Strip Claude Code env vars at startup to prevent nested session errors
for (const key of Object.keys(process.env)) {
	if (key.startsWith("CLAUDE")) delete process.env[key];
}

import { BrowserWindow, BrowserView, Updater, Utils } from "electrobun/bun";
import Electrobun, { ApplicationMenu } from "electrobun/bun";
import type { CoderRPC } from "./rpc-schema";
import * as store from "./thread-store";
import * as bridge from "./claude-bridge";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log("Vite dev server not running. Using built assets.");
		}
	}
	return "views://mainview/index.html";
}

const rpc = BrowserView.defineRPC<CoderRPC>({
	maxRequestTime: 30000,
	handlers: {
		requests: {
			listThreads: () => store.listThreads(),
			createThread: ({ cwd }) => store.createThread(cwd),
			deleteThread: ({ id }) => store.deleteThread(id),
			renameThread: ({ id, title }) => {
				const thread = store.updateThread(id, { title });
				if (!thread) throw new Error("Thread not found");
				return thread;
			},
			pinThread: ({ id, pinned }) => {
				const thread = store.updateThread(id, { pinned });
				if (!thread) throw new Error("Thread not found");
				return thread;
			},
			updateThreadSettings: ({ id, harness, model, accessMode }) => {
				const updates: Record<string, unknown> = {};
				if (harness !== undefined) updates.harness = harness;
				if (model !== undefined) updates.model = model;
				if (accessMode !== undefined) updates.accessMode = accessMode;
				const thread = store.updateThread(id, updates);
				if (!thread) throw new Error("Thread not found");
				return thread;
			},
			loadThreadMessages: ({ threadId }) => {
				return bridge.getThreadMessages(threadId);
			},
			overwriteThreadMessages: ({ threadId, messages }) => {
				store.saveMessages(threadId, messages);
			},
			pickDirectory: async () => {
				const paths = await Utils.openFileDialog({
					startingFolder: process.env.HOME ?? "/",
					allowedFileTypes: "*",
					canChooseFiles: false,
					canChooseDirectory: true,
					allowsMultipleSelection: false,
				});
				return paths.length > 0 && paths[0] ? paths[0] : null;
			},
		},
		messages: {
			sendMessage: ({ threadId, prompt, model, accessMode, images }) => {
				const thread = store.getThread(threadId);
				if (!thread) return;
				bridge.startQuery(threadId, prompt, thread.cwd, thread.sessionId, model, accessMode, images);
			},
			interruptQuery: ({ threadId }) => {
				bridge.interruptQuery(threadId);
			},
			resolvePermission: ({ id, allow, updatedInput }) => {
				bridge.resolvePermission(id, allow, updatedInput);
			},
		},
	},
});

const url = await getMainViewUrl();

const mainWindow = new BrowserWindow({
	title: "Coder",
	url,
	frame: {
		width: 1200,
		height: 800,
		x: 200,
		y: 200,
	},
	titleBarStyle: "hiddenInset",
	rpc,
});

// Wire bridge sender to RPC
const webviewRpc = mainWindow.webview.rpc!;
bridge.setSender({
	onStreamChunk: (data) => webviewRpc.send.onStreamChunk(data),
	onPermissionRequest: (data) => webviewRpc.send.onPermissionRequest(data),
	onQueryResult: (data) => webviewRpc.send.onQueryResult(data),
	onThreadUpdated: (data) => webviewRpc.send.onThreadUpdated(data),
	onThreadMessages: (data) => webviewRpc.send.onThreadMessages(data),
});

// Application menu
ApplicationMenu.setApplicationMenu([
	{
		submenu: [{ label: "Quit Coder", role: "quit" }],
	},
	{
		label: "File",
		submenu: [
			{ label: "New Thread", action: "new-thread", accelerator: "n" },
			{ type: "separator" },
			{ label: "Quit", role: "quit" },
		],
	},
	{
		label: "Edit",
		submenu: [
			{ label: "Undo", role: "undo", accelerator: "CommandOrControl+Z" },
			{ label: "Redo", role: "redo", accelerator: "CommandOrControl+Shift+Z" },
			{ type: "separator" },
			{ label: "Cut", role: "cut", accelerator: "CommandOrControl+X" },
			{ label: "Copy", role: "copy", accelerator: "CommandOrControl+C" },
			{ label: "Paste", role: "paste", accelerator: "CommandOrControl+V" },
			{ label: "Select All", role: "selectAll", accelerator: "CommandOrControl+A" },
		],
	},
]);

Electrobun.events.on("application-menu-clicked", (e) => {
	if (e.data.action === "new-thread") {
		// Trigger new thread flow in webview
		webviewRpc.send.onQueryResult({
			threadId: "__menu_new_thread__",
			success: true,
		});
	}
});

console.log("Coder started!");
