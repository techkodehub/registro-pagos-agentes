/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
         // Custom colors for "Fintech" look
         app: {
           bg: '#0f172a', // Slate 900
           card: '#1e293b', // Slate 800
           accent: '#10b981', // Emerald 500 (Money)
           error: '#ef4444', // Red 500
           text: '#f8fafc', // Slate 50
           muted: '#94a3b8', // Slate 400
         }
      }
    },
  },
  plugins: [],
}
