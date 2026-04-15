import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'layout_web',
  description: 'Two layout algorithms (Grid/Phyllo) for arranging images on a canvas with a playground and photo upload',
};

// TODO: Replace fonts after running /shape → /impeccable teach
// Example: import { Figtree } from 'next/font/google';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
