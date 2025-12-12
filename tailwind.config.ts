import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ["var(--font-inter)", "Inter", "sans-serif"],
        jetbrains: ["var(--font-jetbrains)", "JetBrains Mono", "monospace"],
      },
      backgroundImage: {
        "radial-grid":
          "radial-gradient(circle at 20% 20%, rgba(20,241,149,0.08), transparent 25%), radial-gradient(circle at 80% 30%, rgba(153,69,255,0.08), transparent 25%), radial-gradient(circle at 50% 80%, rgba(52,211,153,0.05), transparent 25%)",
      },
    },
  },
  plugins: [],
};

export default config;

