import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "Coder",
		identifier: "dev.coder.app",
		version: "0.1.0",
	},
	build: {
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
			// bun-pty native Rust library for terminal PTY support
			"node_modules/bun-pty/rust-pty/target/release": "bun/rust-pty/target/release",
		},
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
