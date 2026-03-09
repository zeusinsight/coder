/** @type {import('tailwindcss').Config} */
export default {
	content: ["./src/mainview/**/*.{html,js,ts,jsx,tsx}"],
	theme: {
		extend: {
			colors: {
				surface: {
					DEFAULT: "#1b1b1b",
					hover: "#252525",
					active: "#2a2b2e",
					panel: "#1e1e1e",
					header: "#232428",
				},
				text: {
					primary: "#e0e0e0",
					secondary: "#c9ccd1",
					muted: "#999",
					dim: "#666",
					faint: "#555",
					ghost: "#444",
				},
				border: {
					DEFAULT: "#2a2b2e",
					strong: "#333",
					subtle: "#232428",
				},
			},
		},
	},
	plugins: [],
};
