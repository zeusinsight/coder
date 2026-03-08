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
			updateThreadSettings: ({ id, harness, model, accessMode, thinkingLevel }) => {
				const updates: Record<string, unknown> = {};
				if (harness !== undefined) updates.harness = harness;
				if (model !== undefined) updates.model = model;
				if (accessMode !== undefined) updates.accessMode = accessMode;
				if (thinkingLevel !== undefined) updates.thinkingLevel = thinkingLevel;
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
			listFiles: async ({ cwd, query }) => {
				const { readdir } = await import("fs/promises");
				const { join } = await import("path");

				const lastSlash = query.lastIndexOf("/");
				const dirPart = lastSlash >= 0 ? query.slice(0, lastSlash) : "";
				const filterPart = (lastSlash >= 0 ? query.slice(lastSlash + 1) : query).toLowerCase();
				const targetDir = join(cwd, dirPart);
				const IGNORED = new Set(["node_modules", ".git", ".next", "dist", "build", ".cache", ".DS_Store", "__pycache__", ".svn", ".hg", "coverage", ".turbo"]);

				try {
					const entries = await readdir(targetDir, { withFileTypes: true });
					return entries
						.filter((e) => !e.name.startsWith(".") && !IGNORED.has(e.name))
						.filter((e) => !filterPart || e.name.toLowerCase().includes(filterPart))
						.sort((a, b) => {
							if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
							return a.name.localeCompare(b.name);
						})
						.slice(0, 20)
						.map((e) => ({
							name: e.name,
							path: dirPart ? `${dirPart}/${e.name}` : e.name,
							isDirectory: e.isDirectory(),
						}));
				} catch {
					return [];
				}
			},
			getGitDiff: async ({ cwd }) => {
				try {
					const { execSync } = await import("child_process");
					// Get list of changed files (unstaged + staged + untracked)
					const statusOutput = execSync("git status --porcelain", { cwd, encoding: "utf-8", timeout: 5000 }).trim();
					if (!statusOutput) return { files: [] };

					const files: { path: string; status: string; diff: string }[] = [];
					const lines = statusOutput.split("\n").filter(Boolean);

					for (const line of lines) {
						const statusCode = line.slice(0, 2).trim();
						const filePath = line.slice(3).trim();

						let status = "modified";
						if (statusCode === "A" || statusCode === "??") status = "added";
						else if (statusCode === "D") status = "deleted";
						else if (statusCode === "R") status = "renamed";
						else if (statusCode === "M" || statusCode === "MM" || statusCode === "AM") status = "modified";

						let diff = "";
						try {
							if (statusCode === "??") {
								// Untracked file - show full content as added
								const content = execSync(`git diff --no-index /dev/null "${filePath}" || true`, { cwd, encoding: "utf-8", timeout: 5000 });
								diff = content;
							} else {
								// Get combined diff (staged + unstaged)
								const stagedDiff = execSync(`git diff --cached -- "${filePath}"`, { cwd, encoding: "utf-8", timeout: 5000 });
								const unstagedDiff = execSync(`git diff -- "${filePath}"`, { cwd, encoding: "utf-8", timeout: 5000 });
								diff = (stagedDiff + unstagedDiff).trim();
							}
						} catch {
							diff = "(unable to read diff)";
						}

						files.push({ path: filePath, status, diff });
					}

					return { files };
				} catch (e: any) {
					return { files: [], error: e.message ?? "Failed to get git diff" };
				}
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
			sendMessage: ({ threadId, prompt, model, accessMode, images, thinkingBudget }) => {
				const thread = store.getThread(threadId);
				if (!thread) return;
				bridge.startQuery(threadId, prompt, thread.cwd, thread.sessionId, model, accessMode, images, thinkingBudget);
			},
			interruptQuery: ({ threadId }) => {
				bridge.interruptQuery(threadId);
			},
			resolvePermission: ({ id, allow, updatedInput }) => {
				bridge.resolvePermission(id, allow, updatedInput);
			},
			openExternal: ({ url }) => {
				Utils.openExternal(url);
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
