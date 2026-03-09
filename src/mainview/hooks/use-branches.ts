import { useState, useEffect, useCallback, useRef } from "react";

type BranchState = {
	current: string | null;
	local: string[];
	remote: string[];
	loading: boolean;
	error: string | null;
};

export function useBranches(rpc: any, cwd: string) {
	const [state, setState] = useState<BranchState>({
		current: null,
		local: [],
		remote: [],
		loading: true,
		error: null,
	});
	const cwdRef = useRef(cwd);
	cwdRef.current = cwd;

	const refresh = useCallback(async () => {
		if (!rpc || !cwdRef.current) return;
		setState((s) => ({ ...s, loading: true, error: null }));
		try {
			const result = await rpc.request.listBranches({ cwd: cwdRef.current });
			if (result.error) {
				setState({ current: null, local: [], remote: [], loading: false, error: result.error });
			} else {
				setState({
					current: result.current,
					local: result.local,
					remote: result.remote,
					loading: false,
					error: null,
				});
			}
		} catch (e: any) {
			setState((s) => ({ ...s, loading: false, error: "Failed to fetch branches" }));
		}
	}, [rpc]);

	const switchBranch = useCallback(
		async (branch: string, create: boolean = false) => {
			if (!rpc || !cwdRef.current) return;
			setState((s) => ({ ...s, loading: true, error: null }));
			try {
				const result = await rpc.request.switchBranch({ cwd: cwdRef.current, branch, create });
				if (!result.success) {
					setState((s) => ({ ...s, loading: false, error: result.error ?? "Failed to switch branch" }));
					return;
				}
				await refresh();
			} catch (e: any) {
				setState((s) => ({ ...s, loading: false, error: "Failed to switch branch" }));
			}
		},
		[rpc, refresh]
	);

	useEffect(() => {
		refresh();
	}, [refresh, cwd]);

	// Refresh on window focus (user may have switched branches externally)
	useEffect(() => {
		const handler = () => refresh();
		window.addEventListener("focus", handler);
		return () => window.removeEventListener("focus", handler);
	}, [refresh]);

	// Refresh when git operations complete (commit/push, etc.)
	useEffect(() => {
		const handler = () => refresh();
		window.addEventListener("branches:refresh", handler);
		return () => window.removeEventListener("branches:refresh", handler);
	}, [refresh]);

	return {
		currentBranch: state.current,
		localBranches: state.local,
		remoteBranches: state.remote,
		loading: state.loading,
		error: state.error,
		refresh,
		switchBranch,
	};
}
