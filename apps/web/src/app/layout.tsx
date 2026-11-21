import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'Homework Management System', template: '%s · HMS' },
  description: 'Nền tảng giao bài, nộp bài và chấm điểm trực tuyến cho trường học.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#5a5fe0' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
