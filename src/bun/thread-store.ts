import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Thread } from "./types";

const STORE_DIR = join(homedir(), ".coder");
const STORE_PATH = join(STORE_DIR, "threads.json");

function ensureStore(): Thread[] {
	if (!existsSync(STORE_DIR)) {
		mkdirSync(STORE_DIR, { recursive: true });
	}
	if (!existsSync(STORE_PATH)) {
		writeFileSync(STORE_PATH, "[]");
		return [];
	}
	return JSON.parse(readFileSync(STORE_PATH, "utf-8"));
}

function save(threads: Thread[]) {
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

function ensureMessagesDir() {
	if (!existsSync(MESSAGES_DIR)) {
		mkdirSync(MESSAGES_DIR, { recursive: true });
	}
}

export function saveMessages(threadId: string, messages: any[]) {
	ensureMessagesDir();
	writeFileSync(join(MESSAGES_DIR, `${threadId}.json`), JSON.stringify(messages));
}

export function loadMessages(threadId: string): any[] {
	ensureMessagesDir();
	const path = join(MESSAGES_DIR, `${threadId}.json`);
	if (!existsSync(path)) return [];
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		return [];
	}
}
