import { query, type Query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { join } from "path";
import { homedir } from "os";
import { readFileSync } from "fs";
import type { StreamMessage, PermissionRequest, ContextUsage } from "./types";
import { updateThread, getThread, saveMessages, loadMessages, saveContextUsage } from "./thread-store";

function loadMcpServers(): Record<string, Record<string, unknown>> {
	const configPaths = [
		join(homedir(), ".claude", "claude_desktop_config.json"),
		join(homedir(), ".claude", "settings.json"),
		join(homedir(), ".claude", "settings.local.json"),
	];
	const merged: Record<string, Record<string, unknown>> = {};
	for (const configPath of configPaths) {
		try {
			const raw = readFileSync(configPath, "utf-8");
			const config = JSON.parse(raw);
			const servers = config.mcpServers ?? config.mcp_servers;
			if (servers && typeof servers === "object") {
				Object.assign(merged, servers);
			}
		} catch {
			// File doesn't exist or isn't valid JSON — skip
		}
	}
	return merged;
}

type SendToWebview = {
	onStreamChunk: (data: { threadId: string; message: StreamMessage }) => void;
	onPermissionRequest: (data: PermissionRequest) => void;
	onQueryResult: (data: { threadId: string; success: boolean; error?: string; cost?: number }) => void;
	onThreadUpdated: (thread: any) => void;
	onThreadMessages: (data: { threadId: string; messages: ChatMessage[] }) => void;
	onContextUsage: (data: ContextUsage) => void;
};

export type ChatMessage = {
	id: string;
	role: "user" | "assistant" | "tool";
	content: string;
	toolName?: string;
	toolInput?: Record<string, unknown>;
	createdAt?: number;
	durationMs?: number;
	images?: { mediaType: string; dataUrl: string }[];
};

const activeQueries = new Map<string, Query>();
const pendingPermissions = new Map<
	string,
	{
		resolve: (result: { behavior: "allow"; updatedInput: Record<string, unknown> } | { behavior: "deny"; message: string }) => void;
		toolInput: Record<string, unknown>;
	}
>();

let send: SendToWebview;

export function setSender(s: SendToWebview) {
	send = s;
}

function extractTextFromMessage(msg: SDKMessage): string {
	if (msg.type === "assistant") {
		const content = (msg as any).message?.content;
		if (Array.isArray(content)) {
			return content
				.filter((block: any) => block.type === "text")
				.map((block: any) => block.text)
				.join("");
		}
	}
	if (msg.type === "result" && "result" in msg) {
		return (msg as any).result ?? "";
	}
	return "";
}

function extractToolUseFromMessage(msg: SDKMessage): { id: string; name: string; input: Record<string, unknown> } | null {
	if (msg.type === "assistant") {
		const content = (msg as any).message?.content;
		if (Array.isArray(content)) {
			const toolUse = content.find((block: any) => block.type === "tool_use");
			if (toolUse) {
				return { id: toolUse.id, name: toolUse.name, input: toolUse.input };
			}
		}
	}
	return null;
}

function buildClaudeOpts(cwd: string, threadId: string, resumeSessionId?: string, model?: string, accessMode?: "full" | "restricted", thinkingBudget?: number, chatMode?: "chat" | "build" | "plan"): Record<string, unknown> {
	const cleanEnv: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (!k.startsWith("CLAUDE") && v !== undefined) cleanEnv[k] = v;
	}
	if (!cleanEnv.PATH?.includes(".local/bin")) {
		cleanEnv.PATH = `${cleanEnv.HOME}/.local/bin:${cleanEnv.PATH}`;
	}

	const claudePath = join(homedir(), ".local", "bin", "claude");

	const mcpServers = loadMcpServers();

	const opts: Record<string, unknown> = {
		cwd,
		env: cleanEnv,
		pathToClaudeCodeExecutable: claudePath,
		includePartialMessages: true,
		...(Object.keys(mcpServers).length > 0 && { mcpServers }),
		canUseTool: async (
			toolName: string,
			toolInput: Record<string, unknown>,
		) => {
			if (accessMode === "full") {
				return { behavior: "allow" as const, updatedInput: toolInput };
			}
			const permId = crypto.randomUUID();
			send.onPermissionRequest({ id: permId, threadId, toolName, toolInput });
			return new Promise<{ behavior: "allow"; updatedInput: Record<string, unknown> } | { behavior: "deny"; message: string }>((resolve) => {
				pendingPermissions.set(permId, { resolve, toolInput });
				// Auto-deny after 5 minutes to prevent memory leaks
				setTimeout(() => {
					if (pendingPermissions.has(permId)) {
						pendingPermissions.delete(permId);
						resolve({ behavior: "deny", message: "Permission request timed out" });
					}
				}, 5 * 60 * 1000);
			});
		},
	};

	if (resumeSessionId) {
		opts.resume = resumeSessionId;
	}

	if (model) {
		opts.model = model;
	}

	if (thinkingBudget) {
		opts.thinkingBudget = thinkingBudget;
	}

	if (chatMode === "build") {
		opts.systemPrompt = "You are in Build mode. Focus on writing and editing code. Be action-oriented: implement changes directly rather than explaining. Minimize explanations unless the user asks.";
	} else if (chatMode === "plan") {
		opts.systemPrompt = "You are in Plan mode. Do NOT write or edit any code. Instead, analyze the request, break it down into steps, identify relevant files and components, consider trade-offs, and present a clear implementation plan. Only plan, never implement.";
	}

	return opts;
}

function buildSDKPrompt(prompt: string | any[]): string | AsyncIterable<any> {
	if (typeof prompt === "string") return prompt;
	// Wrap content blocks in an AsyncIterable<SDKUserMessage> so the SDK
	// forwards them (including image blocks) to the model.
	async function* gen() {
		yield {
			type: "user" as const,
			message: { role: "user" as const, content: prompt },
			parent_tool_use_id: null,
			session_id: "",
		};
	}
	return gen();
}

async function runQuery(threadId: string, prompt: string | any[], opts: Record<string, unknown>) {
	const q = query({ prompt: buildSDKPrompt(prompt) as any, options: opts as any });
	activeQueries.set(threadId, q);

	const accumulated: ChatMessage[] = [];
	const queryStartTime = Date.now();

	// Track the latest per-message usage (accurate context fill level)
	let lastMessageUsage: ContextUsage | null = null;

	for await (const message of q) {
		// Capture session ID from init message
		if (message.type === "system" && (message as any).subtype === "init") {
			const sessionId = (message as any).session_id;
			if (sessionId) {
				const thread = updateThread(threadId, { sessionId });
				if (thread) send.onThreadUpdated(thread);
			}
		}

		// Forward message to renderer
		const streamMsg: StreamMessage = {
			type: message.type,
			subtype: (message as any).subtype,
			session_id: (message as any).session_id,
			raw: undefined,
		};

		// Extract text for assistant messages
		if (message.type === "assistant") {
			streamMsg.result = extractTextFromMessage(message);
			const toolUse = extractToolUseFromMessage(message);
			if (toolUse) {
				streamMsg.content = toolUse;
			}
		}

		// Handle partial streaming messages
		if (message.type === "stream_event" as any) {
			const event = (message as any).event;
			if (event?.type === "content_block_delta" && event?.delta?.type === "text_delta") {
				streamMsg.type = "assistant_partial";
				streamMsg.result = event.delta.text;
			}
		}

		// Handle result messages
		if (message.type === "result") {
			streamMsg.result = (message as any).result;
			streamMsg.durationMs = Date.now() - queryStartTime;
			streamMsg.createdAt = queryStartTime;
		}

		// Handle user messages (replays during resume, or agent-delegated)
		if (message.type === "user") {
			const msgParam = (message as any).message;
			if (msgParam?.content) {
				if (typeof msgParam.content === "string") {
					streamMsg.result = msgParam.content;
				} else if (Array.isArray(msgParam.content)) {
					streamMsg.result = msgParam.content
						.filter((b: any) => b.type === "text")
						.map((b: any) => b.text)
						.join("");
				}
			}
			// Mark as agent message if it has a parent_tool_use_id
			if ((message as any).parent_tool_use_id) {
				streamMsg.isAgent = true;
			}
		}

		// Accumulate assistant messages for persistence
		if (message.type === "assistant") {
			if (streamMsg.result?.trim()) {
				if (accumulated.length > 0 && accumulated[accumulated.length - 1].role === "assistant") {
					accumulated[accumulated.length - 1].content = streamMsg.result;
				} else {
					accumulated.push({
						id: crypto.randomUUID(),
						role: "assistant",
						content: streamMsg.result,
						createdAt: queryStartTime,
					});
				}
			}
			const toolUse = streamMsg.content as { id: string; name: string; input: Record<string, unknown> } | undefined;
			if (toolUse) {
				accumulated.push({
					id: crypto.randomUUID(),
					role: "tool",
					content: "",
					toolName: toolUse.name,
					toolInput: toolUse.input,
				});
			}
		}

		// Extract context usage from assistant messages for real-time progress
		// Each assistant message's usage.input_tokens = full prompt size for that API call
		// (i.e. how much of the context window is filled by conversation history)
		if (message.type === "assistant") {
			const usage = (message as any).message?.usage;
			if (usage && usage.input_tokens) {
				const ctx: ContextUsage = {
					threadId,
					inputTokens: usage.input_tokens ?? 0,
					outputTokens: usage.output_tokens ?? 0,
					cacheReadTokens: usage.cache_read_input_tokens ?? 0,
					cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
					contextWindow: lastMessageUsage?.contextWindow ?? 200000,
				};
				lastMessageUsage = ctx;
				send.onContextUsage(ctx);
				saveContextUsage(ctx);
			}
		}

		// Finalize duration on result
		if (message.type === "result") {
			const lastAssistant = [...accumulated].reverse().find((m) => m.role === "assistant");
			if (lastAssistant) {
				lastAssistant.durationMs = Date.now() - queryStartTime;
			}
		}

		send.onStreamChunk({ threadId, message: streamMsg });

		// On result, send query completion + context usage
		if (message.type === "result") {
			const cost = (message as any).total_cost_usd;
			send.onQueryResult({
				threadId,
				success: !(message as any).is_error,
				error: (message as any).is_error ? streamMsg.result : undefined,
				cost,
			});

			// Extract the real context window size from modelUsage (per-model stats from SDK)
			// Note: modelUsage token counts are CUMULATIVE across all API calls — not suitable
			// for context fill level. We use them only for contextWindow and as a fallback.
			const modelUsage = (message as any).modelUsage as Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number; contextWindow: number }> | undefined;

			// Get the actual context window from the model
			let contextWindow = 200000;
			if (modelUsage) {
				for (const usage of Object.values(modelUsage)) {
					if (usage.contextWindow) contextWindow = usage.contextWindow;
				}
			}

			if (lastMessageUsage) {
				// We have accurate per-message data — just update the contextWindow
				const ctx: ContextUsage = { ...lastMessageUsage, contextWindow };
				send.onContextUsage(ctx);
				saveContextUsage(ctx);
			} else {
				// No per-message usage captured — fall back to result data
				const rawUsage = (message as any).usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined;
				if (rawUsage && (rawUsage.input_tokens || rawUsage.output_tokens)) {
					const ctx: ContextUsage = {
						threadId,
						inputTokens: rawUsage.input_tokens ?? 0,
						outputTokens: rawUsage.output_tokens ?? 0,
						cacheReadTokens: rawUsage.cache_read_input_tokens ?? 0,
						cacheCreationTokens: rawUsage.cache_creation_input_tokens ?? 0,
						contextWindow,
					};
					send.onContextUsage(ctx);
					saveContextUsage(ctx);
				}
			}
		}
	}

	// Save accumulated messages to disk
	if (accumulated.length > 0) {
		const existing = loadMessages(threadId);
		saveMessages(threadId, [...existing, ...accumulated]);
	}
}

function extractTextFromPrompt(prompt: string | any[]): string {
	if (typeof prompt === "string") return prompt;
	return prompt.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
}

export async function startQuery(threadId: string, prompt: string | any[], cwd: string, resumeSessionId?: string, model?: string, accessMode?: "full" | "restricted", images?: { mediaType: string; dataUrl: string }[], thinkingBudget?: number, chatMode?: "chat" | "build" | "plan") {
	closeQuery(threadId);

	// Save the user's message immediately
	const textContent = extractTextFromPrompt(prompt);
	if (textContent.trim() || (images && images.length > 0)) {
		const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: textContent, createdAt: Date.now(), ...(images && images.length > 0 ? { images } : {}) };
		const existing = loadMessages(threadId);
		saveMessages(threadId, [...existing, userMsg]);
	}

	try {
		const opts = buildClaudeOpts(cwd, threadId, resumeSessionId, model, accessMode, thinkingBudget, chatMode);
		await runQuery(threadId, prompt, opts);

		// Auto-title from first prompt
		const thread = getThread(threadId);
		if (thread && thread.title === "New Thread" && textContent.length > 0) {
			const title = textContent.slice(0, 60) + (textContent.length > 60 ? "..." : "");
			const updated = updateThread(threadId, { title });
			if (updated) send.onThreadUpdated(updated);
		}
	} catch (err: any) {
		// If resume failed, retry without resume
		if (resumeSessionId) {
			console.error("[bridge] Resume failed, retrying fresh:", err.message);
			try {
				const opts = buildClaudeOpts(cwd, threadId, undefined, model, accessMode, thinkingBudget, chatMode);
				await runQuery(threadId, prompt, opts);
			} catch (retryErr: any) {
				console.error("[bridge] Retry error:", retryErr.message);
				send.onQueryResult({ threadId, success: false, error: retryErr.message ?? String(retryErr) });
			}
		} else {
			console.error("[bridge] Query error:", err.message);
			send.onQueryResult({ threadId, success: false, error: err.message ?? String(err) });
		}
	} finally {
		activeQueries.delete(threadId);
	}
}

export function interruptQuery(threadId: string) {
	const q = activeQueries.get(threadId);
	if (q) {
		q.interrupt();
	}
}

export function closeQuery(threadId: string) {
	const q = activeQueries.get(threadId);
	if (q) {
		q.close();
		activeQueries.delete(threadId);
	}
}

export function getThreadMessages(threadId: string): ChatMessage[] {
	return loadMessages(threadId);
}

export function resolvePermission(id: string, allow: boolean, updatedInput?: Record<string, unknown>) {
	const pending = pendingPermissions.get(id);
	if (pending) {
		pending.resolve(
			allow
				? { behavior: "allow" as const, updatedInput: updatedInput ?? pending.toolInput }
				: { behavior: "deny", message: "User denied" }
		);
		pendingPermissions.delete(id);
	}
}
