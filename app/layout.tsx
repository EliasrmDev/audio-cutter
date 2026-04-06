import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { OfflineIndicator } from '@/components/OfflineIndicator'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap'
})

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
}

export const metadata: Metadata = {
  title: 'Audio Cutter - Professional Audio Editing Tool',
  description: 'Cut and edit audio files with precision. Support for MP3, WAV, and more formats with advanced waveform visualization.',
  keywords: ['audio', 'cutter', 'editor', 'mp3', 'wav', 'waveform'],
  authors: [{ name: 'Elias' }],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Audio Cutter',
  },
  icons: {
    apple: '/apple-touch-icon.png',
    icon: [{ url: '/icon-192.png', sizes: '192x192' }, { url: '/icon-512.png', sizes: '512x512' }],
  },
  creator: 'Elias',
  publisher: 'Elias',
  openGraph: {
    title: 'Audio Cutter - Professional Audio Editing',
    description: 'Cut and edit audio files with precision using our advanced web-based tool.',
    url: 'https://cutter.eliasrm.dev',
    siteName: 'Audio Cutter',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Audio Cutter Tool Interface'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Audio Cutter - Professional Audio Editing',
    description: 'Cut and edit audio files with precision.',
    images: ['/og-image.png']
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1
    }
  },
  verification: {
    google: 'your-google-verification-code'
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen bg-background text-foreground antialiased`}>
        <div className="relative flex min-h-screen flex-col">
          <div className="flex-1">
            {children}
          </div>
        </div>
        <div id="modal-root" />
        <OfflineIndicator />
      </body>
    </html>
  )
}