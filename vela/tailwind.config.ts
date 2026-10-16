import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bank: {
          red: "#D8232A",
          redDark: "#B31B20",
          navy: "#002855",
          navyDark: "#001D3D",
          blue: "#0057B8",
          blueDark: "#003D85",
          link: "#0057B8",
          sand: "#E8EDF2",
          line: "#C9D1D9",
          bg: "#F4F5F6",
          ink: "#232B35",
        },
      },
      fontFamily: {
        sans: ["'Helvetica Neue'", "Helvetica", "Arial", "sans-serif"],
      },
      boxShadow: {
        panel: "0 1px 2px rgba(0,0,0,0.10)",
        dropdown: "0 2px 8px rgba(0,0,0,0.15)",
      },
      borderRadius: {
        DEFAULT: "3px",
        sm: "2px",
        md: "3px",
        lg: "4px",
      },
    },
  },
  plugins: [],
};

export default config;
