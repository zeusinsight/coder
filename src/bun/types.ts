export type Thread = {
	id: string;
	title: string;
	sessionId?: string;
	cwd: string;
	pinned?: boolean;
	harness?: string;
	model?: string;
	accessMode?: "full" | "restricted";
	thinkingLevel?: "low" | "medium" | "high";
	chatMode?: "chat" | "build" | "plan";
	createdAt: string;
	updatedAt: string;
};

export type StreamMessage = {
	type: string;
	subtype?: string;
	result?: string;
	session_id?: string;
	content?: unknown;
	raw: unknown;
	createdAt?: number;
	durationMs?: number;
	isAgent?: boolean;
};

export type PermissionRequest = {
	id: string;
	threadId?: string;
	toolName: string;
	toolInput: Record<string, unknown>;
};

export type QueryResult = {
	threadId: string;
	success: boolean;
	error?: string;
};

export type AppSettings = {
	groqApiKey?: string;
};

export type ContextUsage = {
	threadId: string;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheCreationTokens: number;
	contextWindow: number;
};
