import { useState, useEffect, useCallback, useMemo, useRef } from "react";

export type FileEntry = {
	name: string;
	path: string;
	isDirectory: boolean;
};

type MentionContext = {
	atIndex: number;
	query: string;
};

/**
 * Detects @file mentions in textarea input and provides autocomplete suggestions.
 *
 * Trigger: `@` preceded by whitespace or at position 0.
 * Query: text between `@` and cursor (no whitespace allowed).
 * Selection: replaces `@query` with `@path` (appends `/` for dirs, space for files).
 */
export function useFileMention(
	rpc: any,
	cwd: string | undefined,
	input: string,
	cursorPos: number
) {
	const [items, setItems] = useState<FileEntry[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [isOpen, setIsOpen] = useState(false);
	const itemsRef = useRef<FileEntry[]>([]);
	itemsRef.current = items;

	// Detect active @ mention at cursor
	const mention = useMemo((): MentionContext | null => {
		if (!input || cursorPos === 0) return null;

		const before = input.slice(0, cursorPos);

		// Find the last @ before cursor
		let atIndex = -1;
		for (let i = before.length - 1; i >= 0; i--) {
			if (before[i] === "@") {
				atIndex = i;
				break;
			}
			// Stop scanning if we hit whitespace (no @ in this "word")
			if (/\s/.test(before[i]) && i < before.length - 1) break;
		}

		if (atIndex === -1) return null;

		// @ must be at start or preceded by whitespace
		if (atIndex > 0 && !/\s/.test(before[atIndex - 1])) return null;

		// Query between @ and cursor — no whitespace allowed
		const query = before.slice(atIndex + 1);
		if (/\s/.test(query)) return null;

		return { atIndex, query };
	}, [input, cursorPos]);

	// Fetch file suggestions
	useEffect(() => {
		if (!mention || !rpc || !cwd) {
			setIsOpen(false);
			setItems([]);
			return;
		}

		setIsOpen(true);
		setSelectedIndex(0);

		const timer = setTimeout(() => {
			rpc.request
				.listFiles({ cwd, query: mention.query })
				.then((result: FileEntry[]) => {
					setItems(result);
					itemsRef.current = result;
				})
				.catch(() => {
					setItems([]);
					itemsRef.current = [];
				});
		}, 50);

		return () => clearTimeout(timer);
	}, [mention?.query, rpc, cwd]);

	// Close when mention disappears
	useEffect(() => {
		if (!mention) setIsOpen(false);
	}, [mention]);

	// Apply a selection: returns new input string and cursor position
	const applySelection = useCallback(
		(entry: FileEntry): { newInput: string; newCursorPos: number } | null => {
			if (!mention) return null;

			const before = input.slice(0, mention.atIndex);
			const after = input.slice(cursorPos);

			if (entry.isDirectory) {
				// Append / and keep popup open for drilling down
				const newInput = `${before}@${entry.path}/${after}`;
				const newCursorPos = mention.atIndex + 1 + entry.path.length + 1;
				return { newInput, newCursorPos };
			}

			// File: insert path + space, close popup
			const newInput = `${before}@${entry.path} ${after}`;
			const newCursorPos = mention.atIndex + 1 + entry.path.length + 1;
			setIsOpen(false);
			return { newInput, newCursorPos };
		},
		[mention, input, cursorPos]
	);

	/**
	 * Keyboard handler — call from textarea's onKeyDown.
	 * Returns a selection result if an item was picked, true if the event was consumed, false otherwise.
	 */
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent): { newInput: string; newCursorPos: number } | boolean => {
			if (!isOpen || itemsRef.current.length === 0) return false;

			if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : itemsRef.current.length - 1));
				return true;
			}
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((prev) => (prev < itemsRef.current.length - 1 ? prev + 1 : 0));
				return true;
			}
			if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
				e.preventDefault();
				const entry = itemsRef.current[selectedIndex];
				if (!entry) return true;
				const result = applySelection(entry);
				return result || true;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				setIsOpen(false);
				return true;
			}

			return false;
		},
		[isOpen, selectedIndex, applySelection]
	);

	return {
		isOpen,
		items,
		selectedIndex,
		applySelection,
		handleKeyDown,
		close: () => setIsOpen(false),
	};
}
