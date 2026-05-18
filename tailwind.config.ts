import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        zen: ["var(--font-zen)", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      animation: {
        "spin-slow": "spin 22s linear infinite",
        "pulse-slow": "pulse 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
