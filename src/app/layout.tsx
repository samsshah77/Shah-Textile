import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AppLayout } from '@/components/shared/AppLayout'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'Shah Textile ERP • Weaving Mill Floor Management',
  description: 'Enterprise 34-Loom Weaving Production, Efficiency & Dispatch ERP System',
  icons: {
    icon: [{ url: '/saratextile.png', type: 'image/png' }, { url: '/favicon.ico' }],
    shortcut: '/favicon.ico',
    apple: '/saratextile.png',
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
      style={{ colorScheme: 'light' }}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Source+Sans+3:wght@300;400;500;600;700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/overlayscrollbars@2.11.0/styles/overlayscrollbars.min.css"
        />
        <link rel="stylesheet" href="/adminlte/css/adminlte.min.css" />
        <link rel="stylesheet" href="/adminlte/css/adminlte-colors.min.css" />
      </head>
      <body className="min-h-screen font-sans antialiased" suppressHydrationWarning>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  )
}
