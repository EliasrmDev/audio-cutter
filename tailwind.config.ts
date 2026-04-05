import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#0a0a0a',
          secondary: '#111111',
          tertiary: '#1a1a1a'
        },
        foreground: {
          DEFAULT: '#ffffff',
          secondary: '#d1d1d1',
          muted: '#888888'
        },
        primary: {
          DEFAULT: '#e07b39',
          hover: '#f08b49',
          dark: '#c66929'
        },
        border: {
          DEFAULT: '#3c3c3c',
          hover: '#4c4c4c'
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'waveform-glow': 'linear-gradient(90deg, transparent, rgba(224,123,57,0.3), transparent)'
      },
      animation: {
        'pulse-glow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'waveform': 'waveform 2s ease-in-out infinite'
      },
      keyframes: {
        waveform: {
          '0%, 100%': { transform: 'scaleY(1)' },
          '50%': { transform: 'scaleY(1.2)' }
        }
      }
    }
  },
  plugins: []
}

export default config