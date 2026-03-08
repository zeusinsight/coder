import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Thread, ContextUsage, AppSettings } from "./types";

const STORE_DIR = join(homedir(), ".coder");
const STORE_PATH = join(STORE_DIR, "threads.json");
const SETTINGS_PATH = join(STORE_DIR, "settings.json");

// In-memory write-through cache — avoids re-reading & re-parsing JSON on every operation
let cachedThreads: Thread[] | null = null;

function ensureStore(): Thread[] {
	if (cachedThreads !== null) return cachedThreads;
	if (!existsSync(STORE_DIR)) {
		mkdirSync(STORE_DIR, { recursive: true });
	}
	if (!existsSync(STORE_PATH)) {
		writeFileSync(STORE_PATH, "[]");
		cachedThreads = [];
		return [];
	}
	cachedThreads = JSON.parse(readFileSync(STORE_PATH, "utf-8"));
	return cachedThreads!;
}

function save(threads: Thread[]) {
	cachedThreads = threads;
	writeFileSync(STORE_PATH, JSON.stringify(threads, null, 2));
}

export function listThreads(): Thread[] {
	return ensureStore().sort((a, b) => {
		if (a.pinned && !b.pinned) return -1;
		if (!a.pinned && b.pinned) return 1;
		return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
	});
}

export function createThread(cwd: string): Thread {
	const threads = ensureStore();
	const thread: Thread = {
		id: crypto.randomUUID(),
		title: "New Thread",
		cwd,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
	threads.push(thread);
	save(threads);
	return thread;
}

export function deleteThread(id: string): void {
	const threads = ensureStore().filter((t) => t.id !== id);
	save(threads);
	messagesCache.delete(id);
}

export function updateThread(id: string, updates: Partial<Thread>): Thread | null {
	const threads = ensureStore();
	const idx = threads.findIndex((t) => t.id === id);
	if (idx === -1) return null;
	threads[idx] = { ...threads[idx], ...updates, updatedAt: new Date().toISOString() };
	save(threads);
	return threads[idx];
}

export function getThread(id: string): Thread | null {
	return ensureStore().find((t) => t.id === id) ?? null;
}

// Per-thread message persistence
const MESSAGES_DIR = join(STORE_DIR, "messages");
const messagesCache = new Map<string, any[]>();

function ensureMessagesDir() {
	if (!existsSync(MESSAGES_DIR)) {
		mkdirSync(MESSAGES_DIR, { recursive: true });
	}
}

export function saveMessages(threadId: string, messages: any[]) {
	ensureMessagesDir();
	messagesCache.set(threadId, messages);
	writeFileSync(join(MESSAGES_DIR, `${threadId}.json`), JSON.stringify(messages));
}

export function loadMessages(threadId: string): any[] {
	const cached = messagesCache.get(threadId);
	if (cached) return cached;
	ensureMessagesDir();
	const path = join(MESSAGES_DIR, `${threadId}.json`);
	if (!existsSync(path)) return [];
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8"));
		messagesCache.set(threadId, parsed);
		return parsed;
	} catch {
		return [];
	}
}

// Per-thread context usage persistence
const USAGE_DIR = join(STORE_DIR, "usage");
const usageCache = new Map<string, ContextUsage>();

function ensureUsageDir() {
	if (!existsSync(USAGE_DIR)) {
		mkdirSync(USAGE_DIR, { recursive: true });
	}
}

export function saveContextUsage(data: ContextUsage) {
	ensureUsageDir();
	usageCache.set(data.threadId, data);
	writeFileSync(join(USAGE_DIR, `${data.threadId}.json`), JSON.stringify(data));
}

export function loadContextUsage(threadId: string): ContextUsage | null {
	const cached = usageCache.get(threadId);
	if (cached) return cached;
	ensureUsageDir();
	const path = join(USAGE_DIR, `${threadId}.json`);
	if (!existsSync(path)) return null;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8"));
		usageCache.set(threadId, parsed);
		return parsed;
	} catch {
		return null;
	}
}

// Global app settings persistence
let cachedSettings: AppSettings | null = null;

function ensureStoreDir() {
	if (!existsSync(STORE_DIR)) {
		mkdirSync(STORE_DIR, { recursive: true });
	}
}

export function loadSettings(): AppSettings {
	if (cachedSettings !== null) return cachedSettings;
	ensureStoreDir();
	if (!existsSync(SETTINGS_PATH)) {
		cachedSettings = {};
		return {};
	}
	try {
		cachedSettings = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
		return cachedSettings!;
	} catch {
		cachedSettings = {};
		return {};
	}
}

export function saveSettings(settings: AppSettings): AppSettings {
	ensureStoreDir();
	cachedSettings = settings;
	writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
	return settings;
}
