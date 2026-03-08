type Listener = (data: any) => void;
const listeners = new Map<string, Set<Listener>>();

export function onRpcMessage(event: string, fn: Listener) {
	if (!listeners.has(event)) listeners.set(event, new Set());
	listeners.get(event)!.add(fn);
	return () => {
		listeners.get(event)?.delete(fn);
	};
}

export function emitRpcMessage(event: string, data: any) {
	listeners.get(event)?.forEach((fn) => fn(data));
}
