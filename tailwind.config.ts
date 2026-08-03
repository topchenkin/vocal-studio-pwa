import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        studio: {
          bg: "rgb(var(--studio-bg) / <alpha-value>)",
          surface: "rgb(var(--studio-surface) / <alpha-value>)",
          card: "rgb(var(--studio-card) / <alpha-value>)",
          border: "rgb(var(--studio-border) / <alpha-value>)",
          muted: "rgb(var(--studio-muted) / <alpha-value>)",
          text: "rgb(var(--studio-text) / <alpha-value>)",
          accent: "rgb(var(--studio-accent) / <alpha-value>)",
          "accent-light":
            "rgb(var(--studio-accent-light) / <alpha-value>)",
          gold: "rgb(var(--studio-gold) / <alpha-value>)",
          "gold-dark": "rgb(var(--studio-gold-dark) / <alpha-value>)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "hero-glow":
          "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(192,132,252,0.15), transparent)",
      },
      boxShadow: {
        glow: "0 0 40px rgba(192, 132, 252, 0.15)",
        "glow-gold": "0 0 30px rgba(251, 191, 36, 0.2)",
        card: "var(--studio-card-shadow)",
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-out forwards",
        "slide-up": "slideUp 0.6s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
