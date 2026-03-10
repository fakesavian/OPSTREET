import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink:      "#111111",
        cream:    "#FFF7E8",
        opYellow: "#FFD84D",
        opGreen:  "#22C55E",
        opRed:    "#EF4444",
        brand: {
          50:  "#fff7ed",
          100: "#ffedd5",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          900: "#7c2d12",
          950: "#431407",
        },
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        "hard":    "8px 8px 0 #111111",
        "hard-sm": "5px 5px 0 #111111",
        "hard-lg": "10px 10px 0 #111111",
        "hard-xl": "12px 12px 0 #111111",
      },
      borderWidth: {
        "3": "3px",
        "4": "4px",
      },
      keyframes: {
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-8px) scaleY(0.95)" },
          "100%": { opacity: "1", transform: "translateY(0) scaleY(1)" },
        },
        "count-pop": {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.35)" },
          "100%": { transform: "scale(1)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(0.85)" },
        },
      },
      animation: {
        "slide-down": "slide-down 200ms ease-out",
        "count-pop": "count-pop 300ms ease-out",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
