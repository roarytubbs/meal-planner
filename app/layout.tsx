import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Manrope, Sora } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const bodyFont = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700', '800'],
})

const displayFont = Sora({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
})

export const viewport: Viewport = {
  themeColor: '#0f1a17',
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: 'Meal Planner - Plan Meals by Date',
  description:
    'A meal planner app for managing recipes, ingredients, and date-based meal plans. Import recipes from URLs and build flexible plans by start date and day count.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${bodyFont.variable} ${displayFont.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
