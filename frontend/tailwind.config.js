/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'pi-bg': 'var(--bg)',
        'pi-bg-secondary': 'var(--bg-secondary)',
        'pi-text': 'var(--text)',
        'pi-text-secondary': 'var(--text-secondary)',
        'pi-border': 'var(--border)',
        'pi-accent': 'var(--accent)',
        'pi-accent-hover': 'var(--accent-hover)',
      },
    },
  },
  plugins: [],
}