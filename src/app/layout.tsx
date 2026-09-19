import type { Metadata, Viewport } from 'next'
import { Source_Sans_3, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { AppLayout } from '@/components/shared/AppLayout'

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'Sara Textile ERP • Weaving Mill Floor Management',
  description: 'Enterprise 34-Loom Weaving Production, Efficiency & Dispatch ERP System',
  icons: {
    icon: '/saralogo.webp',
    shortcut: '/saralogo.webp',
    apple: '/saralogo.webp',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      data-bs-theme="light"
      data-lte-color-mode="off"
      className={`${sourceSans.variable} ${jetbrainsMono.variable}`}
      style={{ colorScheme: 'light' }}
    >
      <body className="min-h-screen font-sans antialiased" suppressHydrationWarning>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  )
}
