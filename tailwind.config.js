/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
    "./src/renderer/index.html",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Discord-inspired dark theme colors
        discord: {
          'darker': '#1e1f22',
          'dark': '#2b2d31',
          'medium': '#313338',
          'light': '#383a40',
          'lighter': '#404249',
          'text': '#dbdee1',
          'text-muted': '#949ba4',
          'text-link': '#00a8fc',
          'accent': '#5865f2',
          'accent-hover': '#4752c4',
          'success': '#23a559',
          'warning': '#f0b232',
          'danger': '#da373c',
          'online': '#23a559',
        }
      },
      fontFamily: {
        'sans': ['Whitney', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
