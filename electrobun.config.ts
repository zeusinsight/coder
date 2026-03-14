import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "Koda",
		identifier: "dev.coder.app",
		version: "0.1.0",
	},
	build: {
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
			"icon.svg": "views/mainview/icon.svg",
			// bun-pty native Rust library for terminal PTY support
			"node_modules/bun-pty/rust-pty/target/release": "bun/rust-pty/target/release",
		},
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: true,
			icons: "icon.iconset",
			codesign: true,
			notarize: true,
		},
		linux: {
			bundleCEF: false,
			icon: "icon.iconset/icon_512x512.png",
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
