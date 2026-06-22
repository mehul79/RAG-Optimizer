import Link from 'next/link'
import { RiBarChartBoxLine, RiHistoryLine, RiSettings3Line } from '@remixicon/react'
import { ThemeToggle } from '@/components/theme-toggle'

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-14">
        <Link
          href="/"
          className="flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity"
        >
          <RiBarChartBoxLine className="size-5 text-primary" />
          <span className="font-heading font-semibold text-sm tracking-tight">RAG Optimizer</span>
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/settings"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
          >
            <RiSettings3Line className="size-4" />
            Settings
          </Link>
          <Link
            href="/experiments"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
          >
            <RiHistoryLine className="size-4" />
            History
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
