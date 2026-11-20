import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#5a5fe0', hover: '#4348c9', soft: '#eef0ff', ring: 'rgba(90,95,224,0.35)' },
        canvas: '#eef1f8',
        ink: { DEFAULT: '#0f172a', muted: '#475569', soft: '#64748b', faint: '#94a3b8' },
        line: 'rgba(15,23,42,0.06)',
        success: { DEFAULT: '#059669', soft: '#ecfdf5' },
        warning: { DEFAULT: '#b45309', soft: '#fffbeb' },
        danger: { DEFAULT: '#dc2626', soft: '#fef2f2' },
        info: { DEFAULT: '#0369a1', soft: '#f0f9ff' },
      },
      borderRadius: { xl: '14px', '2xl': '16px' },
      fontFamily: { sans: ['"Plus Jakarta Sans Variable"', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(15,23,42,0.04), 0 1px 1px rgba(15,23,42,0.02)', pop: '0 12px 32px rgba(15,23,42,0.12)' },
    },
  },
  plugins: [],
} satisfies Config;
