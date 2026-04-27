/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./app/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./packages/studio/src/**/*.{js,jsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: '#FF4500',
                    light: '#FF7733',
                    hover: '#e03c00',
                },
                'app-bg': '#000000',
                'panel-bg': '#111111',
                'card-bg': '#1A1A1A',
                secondary: '#999999',
                muted: '#555555',
                'border-color': '#222222',
            },
            fontFamily: {
                display: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
            },
            fontSize: {
                'display-xl': ['clamp(48px,7vw,96px)', { lineHeight: '0.95', letterSpacing: '-0.03em' }],
                'display-lg': ['clamp(36px,5vw,64px)', { lineHeight: '1', letterSpacing: '-0.02em' }],
                'display-md': ['clamp(28px,4vw,48px)', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
            },
            borderRadius: {
                'xl': '1rem',
                '2xl': '1.5rem',
                '3xl': '2rem',
            },
            boxShadow: {
                'glow': '0 0 20px rgba(255, 69, 0, 0.4)',
                'glow-accent': '0 0 20px rgba(255, 120, 0, 0.3)',
                'glow-cyan': '0 0 120px rgba(79,195,247,0.25)',
                'glow-pink': '0 0 80px rgba(255,31,143,0.3)',
                '3xl': '0 35px 60px -15px rgba(0, 0, 0, 0.8)',
            },
        },
    },
    plugins: [],
}
