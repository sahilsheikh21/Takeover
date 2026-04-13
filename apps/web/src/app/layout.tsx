import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Takeover — Local AI Desktop Agent',
  description: 'Your personal AI Desktop Agent — BYOK, local data, Telegram-ready.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="dark" />
      </head>
      <body className="h-screen overflow-hidden bg-[#000000] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
