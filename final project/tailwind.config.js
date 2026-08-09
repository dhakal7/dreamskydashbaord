/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: { 
        'sans': ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        'jakarta': ['"Plus Jakarta Sans"', 'sans-serif'],
        'inter': ['Inter', 'sans-serif']
      },
      colors: {
        navy: '#0A0A0A',
        redAccent: '#DC2626',
        redAccentDark: '#B91C1C',
        grayBg: '#F8FAFC',
        cardBg: '#FFFFFF',
        darkCard: '#141414',
      },
      borderRadius: {
        'xl': '20px',
        '2xl': '24px',
        '3xl': '32px'
      },
      boxShadow: {
        'soft': '0 10px 40px rgba(0,0,0,0.04)',
        'glow': '0 12px 40px rgba(220,38,38,0.18)',
        'glow-lg': '0 20px 60px rgba(220,38,38,0.25)',
        'glass': '0 8px 32px rgba(0,0,0,0.04)',
        'premium': '0 20px 60px rgba(0,0,0,0.08)',
      }
    },
  },
  plugins: [],
}
