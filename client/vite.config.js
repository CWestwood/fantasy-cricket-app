import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    // Tailwind is loaded via PostCSS (`postcss.config.js`).
    // Removing `@tailwindcss/vite` avoids double-processing and ordering issues.
  ],
  server: {
    port: 3000,
    open: true,
    host: true,
  },
});
