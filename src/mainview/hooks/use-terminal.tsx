import { createContext, useContext } from "react";

type TerminalActions = {
	runCommand: (command: string) => void;
	isOpen: boolean;
};

export const TerminalContext = createContext<TerminalActions>({
	runCommand: () => {},
	isOpen: false,
});

export function useTerminal() {
	return useContext(TerminalContext);
}
