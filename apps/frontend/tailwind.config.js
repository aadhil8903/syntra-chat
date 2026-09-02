/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        base: '#09090b',
        foreground: '#fafafa',
        accent: '#e11d48',
        surface: {
          primary: '#09090b',
          card: '#111114',
          subtle: '#18181b',
        },
        border: {
          subtle: '#27272a',
          contrast: '#3f3f46',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

