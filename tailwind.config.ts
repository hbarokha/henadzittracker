import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ["var(--font-sans)",    "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono:    ["var(--font-mono)",    "monospace"],
      },
      colors: {
        clay: {
          950: "#0C0A08",
          900: "#141210",
          850: "#181512",
          800: "#1E1A17",
          750: "#231F1B",
          700: "#2A2420",
          650: "#332D28",
          600: "#3D3530",
          500: "#5C5248",
          400: "#8A7A6E",
          300: "#B0A090",
          200: "#C4B5A5",
          100: "#E8DDD4",
          50:  "#F5EFE6",
        },
        amber: {
          DEFAULT: "#F5A623",
          dim:     "rgba(245,166,35,0.12)",
          glow:    "rgba(245,166,35,0.25)",
          50:  "#FFF8E6",
          100: "#FEEFC4",
          200: "#FCD97A",
          300: "#F9C040",
          400: "#F5A623",
          500: "#E08A0A",
          600: "#C47008",
          700: "#9A5506",
          800: "#6E3C04",
          900: "#3D2102",
        },
        mint: {
          DEFAULT: "#2DD4BF",
          dim:     "rgba(45,212,191,0.10)",
          50:  "#E6FAFA",
          100: "#C4F3EE",
          200: "#7FE7DC",
          300: "#3ECFBE",
          400: "#2DD4BF",
          500: "#1AB5A0",
          600: "#0F8F7E",
          700: "#0A6B5E",
          800: "#064840",
          900: "#022B25",
        },
        coral: {
          DEFAULT: "#FF6B6B",
          50:  "#FFF0F0",
          100: "#FFD6D6",
          200: "#FFB0B0",
          300: "#FF8A8A",
          400: "#FF6B6B",
          500: "#E84545",
          600: "#C42828",
          700: "#9A1818",
          800: "#6E0D0D",
          900: "#400505",
        },
        sage: {
          DEFAULT: "#6ECD8E",
          400: "#6ECD8E",
          500: "#4DB870",
        },
      },
      backgroundImage: {
        "dot-grid": "radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)",
      },
      backgroundSize: {
        "dot-24": "24px 24px",
      },
      animation: {
        "fade-up":    "fadeUp 0.5s ease both",
        "fade-in":    "fadeIn 0.4s ease both",
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "shimmer":    "shimmer 2s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        shimmer: {
          "0%, 100%": { opacity: "0.4" },
          "50%":      { opacity: "1"   },
        },
      },
    },
  },
  plugins: [],
};

export default config;
