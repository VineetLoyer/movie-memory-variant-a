import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Movie Memory',
  description: 'Remember the movies you love.',
}

// NFR-07: Set the page language and shared document structure.
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
