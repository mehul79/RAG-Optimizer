import { Geist_Mono, Figtree, Roboto } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { Navbar } from "@/components/navbar"
import { cn } from "@/lib/utils"

const robotoHeading = Roboto({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-heading' })
const figtree = Figtree({ subsets: ['latin'], variable: '--font-sans' })
const fontMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata = {
  title: 'RAG Pipeline Optimizer',
  description: 'Compare 4 RAG pipeline configurations side-by-side using RAGAS evaluation.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        'antialiased',
        fontMono.variable,
        figtree.variable,
        robotoHeading.variable,
      )}
    >
      <body className="min-h-screen bg-background font-sans">
        <ThemeProvider>
          <Navbar />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
