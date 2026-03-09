// Strip Claude Code env vars at startup to prevent nested session errors
for (const key of Object.keys(process.env)) {
	if (key.startsWith("CLAUDE")) delete process.env[key];
}

import { BrowserWindow, BrowserView, Updater, Utils } from "electrobun/bun";
import Electrobun, { ApplicationMenu } from "electrobun/bun";
import type { CoderRPC } from "./rpc-schema";
import * as store from "./thread-store";
import * as bridge from "./claude-bridge";
import * as ptyManager from "./pty-manager";

// Application menu — MUST be set before any await or BrowserWindow creation
// (see https://github.com/blackboardsh/electrobun/issues/136)
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
			{ role: "undo" },
			{ role: "redo" },
			{ type: "separator" },
			{ role: "cut" },
			{ role: "copy" },
			{ role: "paste" },
			{ role: "pasteAndMatchStyle" },
			{ role: "delete" },
			{ role: "selectAll" },
		],
	},
]);

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// Resolve user's full shell PATH once at startup (Electrobun doesn't inherit it)
import { execSync as execSyncImport } from "child_process";
let userShellEnv: Record<string, string> = { ...(process.env as Record<string, string>) };
try {
	const shellPath = execSyncImport("zsh -ilc 'echo $PATH'", { encoding: "utf-8", timeout: 5000 }).trim();
	if (shellPath) userShellEnv.PATH = shellPath;
} catch {}

// Singleton guard for lzc install
let lzcInstallPromise: Promise<boolean> | null = null;
let lzcAvailable: boolean | null = null;

async function ensureLzc(): Promise<boolean> {
	if (lzcAvailable === true) return true;
	if (lzcInstallPromise) return lzcInstallPromise;
	lzcInstallPromise = (async () => {
		const { execSync } = await import("child_process");
		try {
			execSync("lzc --version", { env: userShellEnv, encoding: "utf-8", timeout: 5000, stdio: "pipe" });
			lzcAvailable = true;
			return true;
		} catch {
			// Not found — install it
			console.log("lzc not found, installing lazycommit...");
			try {
				execSync("npm install -g lazycommitt", { encoding: "utf-8", timeout: 60000, env: userShellEnv, stdio: "pipe" });
				// Refresh PATH after install
				try {
					const newPath = execSync("zsh -ilc 'echo $PATH'", { encoding: "utf-8", timeout: 5000 }).trim();
					if (newPath) userShellEnv.PATH = newPath;
				} catch {}
				lzcAvailable = true;
				console.log("lazycommit installed successfully");
				return true;
			} catch (e: any) {
				console.error("Failed to install lazycommit:", e.message);
				lzcAvailable = false;
				return false;
			}
		} finally {
			lzcInstallPromise = null;
		}
	})();
	return lzcInstallPromise;
}

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
			updateThreadSettings: ({ id, harness, model, accessMode, thinkingLevel, chatMode }) => {
				const updates: Record<string, unknown> = {};
				if (harness !== undefined) updates.harness = harness;
				if (model !== undefined) updates.model = model;
				if (accessMode !== undefined) updates.accessMode = accessMode;
				if (thinkingLevel !== undefined) updates.thinkingLevel = thinkingLevel;
				if (chatMode !== undefined) updates.chatMode = chatMode;
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
			loadContextUsage: ({ threadId }) => {
				return store.loadContextUsage(threadId);
			},
			getSettings: () => store.loadSettings(),
			updateSettings: (settings) => store.saveSettings(settings),
			generateCommitMessage: async ({ cwd }) => {
				try {
					const { execSync } = await import("child_process");
					// Skip if working tree is clean
					const status = execSync("git status --porcelain", { cwd, encoding: "utf-8", timeout: 5000, env: userShellEnv }).trim();
					if (!status) {
						return { message: "", error: "No changes to commit" };
					}
					const installed = await ensureLzc();
					if (!installed) {
						return { message: "", error: "Failed to install lazycommit. Run 'npm install -g lazycommitt' manually." };
					}
					const settings = store.loadSettings();
					const env = { ...userShellEnv };
					if (settings.groqApiKey) env.GROQ_API_KEY = settings.groqApiKey;
					const raw = execSync("lzc --all", { cwd, encoding: "utf-8", timeout: 60000, env }).trim();
					// Strip ANSI escape codes
					let msg = raw.replace(/\x1b\[[0-9;]*m/g, "");
					// Extract commit message after the last ◆ marker
					const markerIdx = msg.lastIndexOf("◆");
					if (markerIdx !== -1) msg = msg.slice(markerIdx + 1);
					// Strip leading labels and trailing box-drawing decoration
					msg = msg.replace(/^[^:]*Review generated commit message:\s*/i, "").trim();
					msg = msg.replace(/[│└─┘┐┌┬┴├┤╔╗╚╝║═]+/g, "").trim();
					return { message: msg };
				} catch (e: any) {
					return { message: "", error: e.message ?? "Failed to generate commit message" };
				}
			},
			commitAndPush: async ({ cwd, message }) => {
				try {
					const { execSync } = await import("child_process");
					const env = { ...userShellEnv };
					execSync("git add -A", { cwd, encoding: "utf-8", timeout: 10000, env });
					execSync(`git commit -m ${JSON.stringify(message)}`, { cwd, encoding: "utf-8", timeout: 10000, env });
					execSync("git push", { cwd, encoding: "utf-8", timeout: 30000, env });
					return { success: true };
				} catch (e: any) {
					return { success: false, error: e.message ?? "Failed to commit and push" };
				}
			},
			checkFileExists: async ({ cwd, path }) => {
				const { existsSync } = await import("fs");
				const { join } = await import("path");
				return existsSync(join(cwd, path));
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
					const env = { ...userShellEnv };
					// Get list of changed files
					const statusOutput = execSync("git status --porcelain", { cwd, encoding: "utf-8", timeout: 5000, env }).trim();
					if (!statusOutput) return { files: [] };

					// Batch: get ALL diffs in two calls instead of per-file
					let allStagedDiff = "";
					let allUnstagedDiff = "";
					try { allStagedDiff = execSync("git diff --cached", { cwd, encoding: "utf-8", timeout: 10000, env }); } catch {}
					try { allUnstagedDiff = execSync("git diff", { cwd, encoding: "utf-8", timeout: 10000, env }); } catch {}

					// Parse diffs into per-file maps
					const parseDiffByFile = (diffOutput: string): Map<string, string> => {
						const map = new Map<string, string>();
						if (!diffOutput) return map;
						const parts = diffOutput.split(/^diff --git /m).filter(Boolean);
						for (const part of parts) {
							const headerEnd = part.indexOf("\n");
							const header = part.slice(0, headerEnd);
							// Extract b/filepath from "a/foo b/foo"
							const bMatch = header.match(/b\/(.+)$/);
							if (bMatch) {
								map.set(bMatch[1], "diff --git " + part);
							}
						}
						return map;
					};

					const stagedMap = parseDiffByFile(allStagedDiff);
					const unstagedMap = parseDiffByFile(allUnstagedDiff);

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
						if (statusCode === "??") {
							// Untracked file - show content as added (still needs per-file call)
							try {
								diff = execSync(`git diff --no-index /dev/null "${filePath}" || true`, { cwd, encoding: "utf-8", timeout: 5000, env });
							} catch { diff = "(unable to read diff)"; }
						} else {
							diff = ((stagedMap.get(filePath) ?? "") + "\n" + (unstagedMap.get(filePath) ?? "")).trim();
						}

						files.push({ path: filePath, status, diff });
					}

					return { files };
				} catch (e: any) {
					return { files: [], error: e.message ?? "Failed to get git diff" };
				}
			},
			getCurrentBranch: async ({ cwd }) => {
				try {
					const { execSync } = await import("child_process");
					const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8", timeout: 5000, env: userShellEnv }).trim();
					return { branch: branch || null };
				} catch (e: any) {
					return { branch: null, error: e.message ?? "Not a git repository" };
				}
			},
			listBranches: async ({ cwd }) => {
				try {
					const { execSync, exec } = await import("child_process");
					const env = { ...userShellEnv };
					// Fire-and-forget fetch — never blocks listing
					exec("git fetch --all --prune", { cwd, encoding: "utf-8", timeout: 15000, env }, () => {});
					// Single call: get current branch + all branches
					const current = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8", timeout: 5000, env }).trim();
					const allRaw = execSync("git branch -a", { cwd, encoding: "utf-8", timeout: 5000, env }).trim();
					const local: string[] = [];
					const remote: string[] = [];
					for (const line of allRaw.split("\n")) {
						const name = line.replace(/^\*?\s*/, "").trim();
						if (!name || name.includes("->")) continue;
						if (name.startsWith("remotes/")) {
							remote.push(name.replace("remotes/", ""));
						} else {
							local.push(name);
						}
					}
					return { current, local, remote };
				} catch (e: any) {
					return { current: "", local: [], remote: [], error: e.message ?? "Failed to list branches" };
				}
			},
			switchBranch: async ({ cwd, branch, create }) => {
				try {
					const { execSync } = await import("child_process");
					const cmd = create ? `git switch -c ${JSON.stringify(branch)}` : `git switch ${JSON.stringify(branch)}`;
					execSync(cmd, { cwd, encoding: "utf-8", timeout: 10000, env: userShellEnv });
					return { success: true };
				} catch (e: any) {
					return { success: false, error: e.message ?? "Failed to switch branch" };
				}
			},
			searchMessages: ({ query }) => store.searchMessages(query),
			createTerminal: ({ id, cwd, cols, rows }) => {
				ptyManager.createTerminal(id, cwd, cols, rows, userShellEnv);
			},
			destroyTerminal: ({ id }) => {
				ptyManager.destroyTerminal(id);
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
			sendMessage: ({ threadId, prompt, model, accessMode, images, thinkingBudget, chatMode }) => {
				const thread = store.getThread(threadId);
				if (!thread) return;
				bridge.startQuery(threadId, prompt, thread.cwd, thread.sessionId, model, accessMode, images, thinkingBudget, chatMode);
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
			writeTerminal: ({ id, data }) => {
				ptyManager.writeTerminal(id, data);
			},
			resizeTerminal: ({ id, cols, rows }) => {
				ptyManager.resizeTerminal(id, cols, rows);
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
	onContextUsage: (data) => webviewRpc.send.onContextUsage(data),
});

ptyManager.setSender({
	onTerminalData: (data) => webviewRpc.send.onTerminalData(data),
	onTerminalExit: (data) => webviewRpc.send.onTerminalExit(data),
	onTerminalTitle: (data) => webviewRpc.send.onTerminalTitle(data),
});

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
