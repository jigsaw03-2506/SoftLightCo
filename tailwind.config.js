/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', '"Helvetica Neue"', 'Inter', '"Myanmar Sangam MN"', '"Noto Sans Myanmar"', 'sans-serif'],
      },
      // Dark theme done at the palette level: every scale is inverted so the existing class names
      // keep their meaning (slate-900 = strongest text, *-50 = faint tinted fill, *-700 = readable accent text).
      colors: {
        surface: '#161920',
        slate: {
          50: '#14161c', 100: '#1b1e26',
          // Border shades are translucent white so card edges pick up whatever is behind them.
          200: 'rgba(255, 255, 255, 0.12)', 300: 'rgba(255, 255, 255, 0.2)', 400: '#a39883',
          // Text shades: white for headings, warm wheat tones for secondary text.
          500: '#d4c5a6', 600: '#e2d5ba', 700: '#efe5d0', 800: '#faf5ea', 900: '#ffffff', 950: '#ffffff',
        },
        blue: { 50: '#0f1829', 100: '#111f36', 200: '#17315b', 300: '#a9cfff', 400: '#7ab4ff', 500: '#2f7cf6', 600: '#4a8ffa', 700: '#2f7cf6', 800: '#a9cfff', 900: '#a9cfff', 950: '#d6e8ff' },
        emerald: { 50: '#0c1e1d', 100: '#0c2924', 200: '#0d4436', 300: '#86efbe', 400: '#4ade9b', 500: '#10b981', 600: '#0fa673', 700: '#4ade9b', 800: '#86efbe', 900: '#86efbe', 950: '#c6f7df' },
        amber: { 50: '#221c11', 100: '#302411', 200: '#563b10', 300: '#fcd34d', 400: '#fbbf3c', 500: '#f59e0b', 600: '#fbbf3c', 700: '#fbbf3c', 800: '#fcd27a', 900: '#fcd27a', 950: '#fde9bd' },
        violet: { 50: '#181529', 100: '#1f1a36', 200: '#34265b', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#a78bfa', 700: '#a78bfa', 800: '#c4b5fd', 900: '#c4b5fd', 950: '#e4dcff' },
        red: { 50: '#221217', 100: '#2f161a', 200: '#541f22', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#f87171', 700: '#f87171', 800: '#fca5a5', 900: '#fca5a5', 950: '#fed2d2' },
        orange: { 50: '#231712', 100: '#311d13', 200: '#572e13', 300: '#fdba74', 400: '#fb923c', 500: '#f97316', 600: '#fb923c', 700: '#fb923c', 800: '#fdba74', 900: '#fdba74', 950: '#fedcbb' },
      },
      borderRadius: {
        md: '0.625rem',
        lg: '0.875rem',
        xl: '1.125rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        soft: '0 10px 30px rgba(0, 0, 0, 0.35)',
        glass: '0 1px 0 rgba(255, 255, 255, 0.06) inset, 0 12px 40px rgba(0, 0, 0, 0.35)',
      },
    },
  },
  plugins: [],
}
