import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { AppLayout } from '@/components/shared/AppLayout'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700', '800'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

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
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased selection:bg-[#0066cc]/15 selection:text-[#0066cc]">
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  )
}

