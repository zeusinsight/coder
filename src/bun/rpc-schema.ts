import { type RPCSchema } from "electrobun/bun";
import type { Thread, StreamMessage, PermissionRequest, QueryResult } from "./types";

export type CoderRPC = {
	bun: RPCSchema<{
		requests: {
			listThreads: { params: {}; response: Thread[] };
			createThread: { params: { cwd: string }; response: Thread };
			deleteThread: { params: { id: string }; response: void };
			renameThread: { params: { id: string; title: string }; response: Thread };
			pinThread: { params: { id: string; pinned: boolean }; response: Thread };
			updateThreadSettings: { params: { id: string; harness?: string; model?: string; accessMode?: "full" | "restricted"; thinkingLevel?: "low" | "medium" | "high" }; response: Thread };
			loadThreadMessages: { params: { threadId: string }; response: any[] };
			overwriteThreadMessages: { params: { threadId: string; messages: any[] }; response: void };
			pickDirectory: { params: {}; response: string | null };
			listFiles: { params: { cwd: string; query: string }; response: { name: string; path: string; isDirectory: boolean }[] };
			getGitDiff: { params: { cwd: string }; response: { files: { path: string; status: string; diff: string }[]; error?: string } };
		};
		messages: {
			sendMessage: { threadId: string; prompt: string | any[]; model?: string; accessMode?: "full" | "restricted"; images?: { mediaType: string; dataUrl: string }[]; thinkingBudget?: number };
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
		};
	}>;
};
