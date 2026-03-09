import { spawn, type IPty } from "bun-pty";

type TerminalSession = {
	id: string;
	pty: IPty;
	cwd: string;
};

const sessions = new Map<string, TerminalSession>();

let sender: {
	onTerminalData: (data: { id: string; data: string }) => void;
	onTerminalExit: (data: { id: string; exitCode: number }) => void;
	onTerminalTitle: (data: { id: string; title: string }) => void;
} | null = null;

export function setSender(s: typeof sender) {
	sender = s;
}

export function createTerminal(
	id: string,
	cwd: string,
	cols: number,
	rows: number,
	env: Record<string, string>,
) {
	// Clean up existing session with same id
	destroyTerminal(id);

	const shell = env.SHELL || process.env.SHELL || "/bin/zsh";

	try {
		const ptyProcess = spawn(shell, ["--login"], {
			name: "xterm-256color",
			cols,
			rows,
			cwd,
			env: {
				...env,
				TERM: "xterm-256color",
				COLORTERM: "truecolor",
				TERM_PROGRAM: "Coder",
				LANG: env.LANG || process.env.LANG || "en_US.UTF-8",
			},
		});

		console.log(`[pty] Created terminal ${id} (pid: ${ptyProcess.pid}, shell: ${shell}, cwd: ${cwd})`);

		ptyProcess.onData((data: string) => {
			sender?.onTerminalData({ id, data });
		});

		ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
			console.log(`[pty] Terminal ${id} exited with code ${exitCode}`);
			sessions.delete(id);
			sender?.onTerminalExit({ id, exitCode });
		});

		sessions.set(id, { id, pty: ptyProcess, cwd });
	} catch (e) {
		console.error(`[pty] Failed to create terminal ${id}:`, e);
		throw e;
	}
}

export function writeTerminal(id: string, data: string) {
	sessions.get(id)?.pty.write(data);
}

export function resizeTerminal(id: string, cols: number, rows: number) {
	try {
		sessions.get(id)?.pty.resize(cols, rows);
	} catch {
		// Resize can fail if pty is already dead
	}
}

export function destroyTerminal(id: string) {
	const session = sessions.get(id);
	if (session) {
		try {
			session.pty.kill();
		} catch {
			// Already dead
		}
		sessions.delete(id);
	}
}

export function destroyAll() {
	for (const id of sessions.keys()) {
		destroyTerminal(id);
	}
}
