import { type RPCSchema } from "electrobun/bun";
import type { Thread, StreamMessage, PermissionRequest, QueryResult, ContextUsage, AppSettings } from "./types";
import type { SearchResult } from "./thread-store";

export type CoderRPC = {
	bun: RPCSchema<{
		requests: {
			listThreads: { params: {}; response: Thread[] };
			createThread: { params: { cwd: string }; response: Thread };
			deleteThread: { params: { id: string }; response: void };
			renameThread: { params: { id: string; title: string }; response: Thread };
			pinThread: { params: { id: string; pinned: boolean }; response: Thread };
			updateThreadSettings: { params: { id: string; harness?: string; model?: string; accessMode?: "full" | "restricted"; thinkingLevel?: "low" | "medium" | "high"; chatMode?: "chat" | "build" | "plan" }; response: Thread };
			loadThreadMessages: { params: { threadId: string }; response: any[] };
			overwriteThreadMessages: { params: { threadId: string; messages: any[] }; response: void };
			pickDirectory: { params: {}; response: string | null };
			listFiles: { params: { cwd: string; query: string }; response: { name: string; path: string; isDirectory: boolean }[] };
			getGitDiff: { params: { cwd: string }; response: { files: { path: string; status: string; diff: string }[]; error?: string } };
			loadContextUsage: { params: { threadId: string }; response: ContextUsage | null };
			checkFileExists: { params: { cwd: string; path: string }; response: boolean };
			getSettings: { params: {}; response: AppSettings };
			updateSettings: { params: AppSettings; response: AppSettings };
			generateCommitMessage: { params: { cwd: string }; response: { message: string; error?: string } };
			commitAndPush: { params: { cwd: string; message: string }; response: { success: boolean; error?: string } };
			searchMessages: { params: { query: string }; response: SearchResult[] };
		};
		messages: {
			sendMessage: { threadId: string; prompt: string | any[]; model?: string; accessMode?: "full" | "restricted"; images?: { mediaType: string; dataUrl: string }[]; thinkingBudget?: number; chatMode?: "chat" | "build" | "plan" };
			interruptQuery: { threadId: string };
			resolvePermission: { id: string; allow: boolean; updatedInput?: Record<string, unknown> };
			openExternal: { url: string };
		};
	}>;
	webview: RPCSchema<{
		requests: {};
		messages: {
			onStreamChunk: { threadId: string; message: StreamMessage };
			onThreadUpdated: Thread;
			onPermissionRequest: PermissionRequest;
			onQueryResult: QueryResult;
			onThreadMessages: { threadId: string; messages: StreamMessage[] };
			onContextUsage: ContextUsage;
		};
	}>;
};
