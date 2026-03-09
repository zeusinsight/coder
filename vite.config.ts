import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	root: "src/mainview",
	build: {
		outDir: "../../dist",
		emptyOutDir: true,
		rollupOptions: {
			output: {
				manualChunks: {
					"vendor-react": ["react", "react-dom"],
					"vendor-markdown": ["react-markdown", "remark-gfm"],
					"vendor-xterm": ["@xterm/xterm", "@xterm/addon-fit", "@xterm/addon-web-links"],
				},
			},
		},
		// Optimize minification
		minify: "esbuild",
		target: "es2020",
	},
	server: {
		port: 5173,
		strictPort: true,
	},
});
