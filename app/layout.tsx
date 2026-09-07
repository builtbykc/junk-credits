import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Junk Bank',
  applicationName: 'Junk Bank',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Junk Bank', statusBarStyle: 'black-translucent' },
  description: 'Bank credits on clean days and spend them on the food you enjoy.',
};

export const viewport: Viewport = {width: 'device-width', initialScale: 1, themeColor: '#101315', viewportFit: 'cover'};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
