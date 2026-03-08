import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Electroview } from "electrobun/view";
import type { CoderRPC } from "../bun/rpc-schema";
import { emitRpcMessage } from "./rpc-events";
import "./index.css";
import { App } from "./components/app";

const rpc = Electroview.defineRPC<CoderRPC>({
	maxRequestTime: 120000,
	handlers: {
		requests: {},
		messages: {
			onStreamChunk: (data) => emitRpcMessage("onStreamChunk", data),
			onThreadUpdated: (data) => emitRpcMessage("onThreadUpdated", data),
			onPermissionRequest: (data) => emitRpcMessage("onPermissionRequest", data),
			onQueryResult: (data) => emitRpcMessage("onQueryResult", data),
			onThreadMessages: (data) => emitRpcMessage("onThreadMessages", data),
		},
	},
});

const electroview = new Electroview({ rpc });

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App electroview={electroview as any} />
	</StrictMode>
);
