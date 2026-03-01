import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#fff7ed",
          100: "#ffedd5",
          300: "#fdba74",  // step indicators, deploy steps
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",  // box-shadow values, borders
          900: "#7c2d12",
          950: "#431407",  // dark bg overlays (bg-brand-950/20)
        },
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
