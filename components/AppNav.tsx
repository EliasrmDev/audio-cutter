'use client'

import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'
import { Scissors, ArrowLeftRight, Menu, X } from 'lucide-react'

// ── Route definitions ─────────────────────────────────────────────────────────

const NAV_LINKS = [
  {
    href: '/',
    label: 'Editor',
    description: 'Cortar y exportar audio con visualización de forma de onda',
    icon: Scissors,
    exact: true,
  },
  {
    href: '/convert-audio',
    label: 'Convertir',
    description: 'Convertir WAV → MP3 y más sin subir archivos',
    icon: ArrowLeftRight,
    exact: false,
  },
] as const

// ── Component ─────────────────────────────────────────────────────────────────

export function AppNav() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const navRef = useRef<HTMLElement>(null)

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // Close menu on Escape
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        menuBtnRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [menuOpen])

  const toggleMenu = useCallback(() => setMenuOpen(v => !v), [])

  return (
    <header ref={navRef} className="sticky top-0 z-40 w-full border-b border-border bg-background/90 backdrop-blur-sm">
      <nav
        aria-label="Navegación principal"
        className="container mx-auto flex items-center justify-between px-4 h-14 max-w-6xl"
      >
        {/* ── Logo ─── */}
        <Link
          href="/"
          aria-label="Audio Cutter — inicio"
          className="flex items-center gap-2 font-bold text-foreground hover:text-primary transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
        >
          <span className="flex items-center justify-center w-7 h-7 rounded bg-primary text-primary-foreground" aria-hidden="true">
            <Scissors className="w-3.5 h-3.5" />
          </span>
          <span>Audio Cutter</span>
        </Link>

        {/* ── Desktop links ─── */}
        <ul className="hidden sm:flex items-center gap-1" role="list">
          {NAV_LINKS.map(({ href, label, description, icon: Icon, exact }) => {
            const active = isActive(href, exact)
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  title={description}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground-secondary hover:bg-background-secondary hover:text-foreground'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>

        {/* ── Mobile menu button ─── */}
        <button
          ref={menuBtnRef}
          type="button"
          aria-controls={menuId}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          onClick={toggleMenu}
          className="sm:hidden p-2 rounded-md text-foreground-secondary hover:text-foreground
            hover:bg-background-secondary transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {menuOpen
            ? <X className="w-5 h-5" aria-hidden="true" />
            : <Menu className="w-5 h-5" aria-hidden="true" />}
        </button>
      </nav>

      {/* ── Mobile dropdown ─── */}
      {menuOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label="Menú de navegación"
          className="sm:hidden border-t border-border bg-background"
        >
          <ul role="list" className="container mx-auto max-w-6xl px-4 py-2 space-y-1">
            {NAV_LINKS.map(({ href, label, description, icon: Icon, exact }) => {
              const active = isActive(href, exact)
              return (
                <li key={href}>
                  <Link
                    href={href}
                    role="menuitem"
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-3 rounded-lg transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground-secondary hover:bg-background-secondary hover:text-foreground'
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <div>
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="block text-[11px] text-foreground-muted">{description}</span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </header>
  )
}
