import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./data/**/*.json",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          cyan:   "#00d4ff",
          amber:  "#ff8c42",
          green:  "#22d3a5",
          red:    "#ff4d6d",
          bg:     "#07080d",
          surface:"#0a0c12",
        },
      },
      fontFamily: {
        mono:    ["DM Mono", "monospace"],
        display: ["Syne", "sans-serif"],
      },
      borderColor: {
        DEFAULT: "rgba(255,255,255,0.08)",
      },
      animation: {
        "bounce-dot": "bounce-dot 1.2s ease-in-out infinite",
        "spin-slow":  "spin 0.9s linear infinite",
      },
      keyframes: {
        "bounce-dot": {
          "0%, 80%, 100%": { transform: "translateY(0)", opacity: "0.4" },
          "40%":            { transform: "translateY(-4px)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
