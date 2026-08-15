import type { Config } from "tailwindcss";

// KCBL brand tokens. Navy (#024C8B) is KCBL's confirmed brand color,
// extracted from their logo during earlier design work. Everything else
// is built around it rather than a generic template palette.
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#024C8B",
          50: "#EAF2FA",
          100: "#CFE2F3",
          400: "#0A5FA3",
          600: "#023D6E",
          900: "#012644",
        },
        // A restrained warm amber, evoking site-safety signage without
        // being literal — used sparingly for primary actions and status.
        amber: {
          DEFAULT: "#C97A2B",
          50: "#FBF1E6",
          600: "#A6621F",
        },
        ink: "#1B2430",
        paper: "#F7F8FA",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
