/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'media',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        // Elemento elevado (botones, cards, modal)
        'neo-raised': '6px 6px 12px var(--neo-shadow-dark), -6px -6px 12px var(--neo-shadow-light)',
        // Elemento hundido (inputs, textarea, dropzone)
        'neo-inset': 'inset 4px 4px 8px var(--neo-shadow-dark), inset -4px -4px 8px var(--neo-shadow-light)',
        // Hover/focus en elementos interactivos
        'neo-raised-sm': '3px 3px 6px var(--neo-shadow-dark), -3px -3px 6px var(--neo-shadow-light)',
        // Estado pressed (boton al hacer click)
        'neo-pressed': 'inset 2px 2px 5px var(--neo-shadow-dark), inset -2px -2px 5px var(--neo-shadow-light)',
      },
    },
  },
  plugins: [],
}
