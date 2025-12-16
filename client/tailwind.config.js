/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  // Temporary safelist to ensure custom `primary` utilities are generated
  // This helps Vite/Tailwind produce `bg-primary-500`, `hover:bg-primary-600`, etc
  // while we diagnose why they're not available during @apply processing.
  theme: {
    extend: {
      colors: {
        // Primary brand colors
        primary: {
          50:  "#e8f7ea",
          100: "#c8ebcb",
          200: "#a8dfa9",
          300: "#7ecf80",
          400: "#57bd59",
          500: "#36a83c", // Main green
          600: "#2e8e33",
          700: "#267329",
          800: "#1d591f",
          900: "#143f16"
        },
        // Dark theme colors
        dark: {
          50: "#404040",
          100: "#383838",
          200: "#303030",
          300: "#282828",
          400: "#202020",
          500: "#1a1a1a", // Main dark background
          600: "#151515",
          700: "#101010",
          800: "#0a0a0a",
          900: "#000000",
        },
        // Card backgrounds
        card: {
          light: "#2a2a2a",
          DEFAULT: "#252525",
          dark: "#1f1f1f",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        // Removed duplicates, kept consistent naming
        "5xl": "2.5rem", // 40px
        "6xl": "3rem",   // 48px
        "7xl": "3.5rem", // 56px
      },
      boxShadow: {
        card: "0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)",
        "card-hover":
          "0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)",
        green: "0 0 20px rgba(0, 230, 122, 0.3)",
        "green-lg": "0 0 30px rgba(0, 230, 122, 0.4)",
      },
      backgroundImage: {
        "gradient-dark": "linear-gradient(to bottom, #1a1a1a, #0a0a0a)",
        "gradient-green": "linear-gradient(135deg, #00e67a 0%, #36a83c 100%)",
        "gradient-card": "linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-green": "pulseGreen 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        pulseGreen: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(0, 230, 122, 0.3)" },
          "50%": { boxShadow: "0 0 30px rgba(0, 230, 122, 0.5)" },
        },
      },
    },
  },
  plugins: [],
};