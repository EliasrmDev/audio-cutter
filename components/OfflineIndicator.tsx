'use client'

import React, { useEffect, useState } from 'react'
import { Wifi, WifiOff, Download } from 'lucide-react'
import { clsx } from 'clsx'

type NetworkStatus = 'online' | 'offline'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function OfflineIndicator() {
  const [status, setStatus] = useState<NetworkStatus>('online')
  const [visible, setVisible] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [installable, setInstallable] = useState(false)

  // ── Network status ──────────────────────────────────────────────────────────
  useEffect(() => {
    const goOnline  = () => { setStatus('online');  setVisible(true); setTimeout(() => setVisible(false), 3000) }
    const goOffline = () => { setStatus('offline'); setVisible(true) }

    // Show banner immediately if offline on mount
    if (!navigator.onLine) { setStatus('offline'); setVisible(true) }

    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online',  goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // ── PWA install prompt ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as InstallPromptEvent)
      setInstallable(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') {
      setInstallable(false)
      setInstallPrompt(null)
    }
  }

  const isOffline = status === 'offline'

  return (
    <>
      {/* ── Network banner ───────────────────────────────────────────────────── */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={isOffline ? 'You are offline' : 'Back online'}
        className={clsx(
          'fixed bottom-4 left-1/2 -translate-x-1/2 z-50',
          'flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium',
          'shadow-lg border transition-all duration-300',
          isOffline
            ? 'bg-background-secondary border-amber-500/40 text-amber-300'
            : 'bg-background-secondary border-green-500/40 text-green-400',
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        )}
      >
        {isOffline
          ? <WifiOff size={15} aria-hidden="true" />
          : <Wifi    size={15} aria-hidden="true" />
        }
        <span>{isOffline ? 'Offline — working locally' : 'Back online'}</span>
      </div>

      {/* ── Persistent offline badge (top-right) ─────────────────────────────── */}
      {isOffline && (
        <div
          className={clsx(
            'fixed top-3 right-3 z-40',
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full',
            'bg-amber-500/15 border border-amber-500/30 text-amber-400',
            'text-xs font-medium select-none'
          )}
          role="status"
          aria-label="Offline mode active"
          title="You are working offline. All edits are saved locally."
        >
          <WifiOff size={11} aria-hidden="true" />
          <span>Offline</span>
        </div>
      )}

      {/* ── Install button ────────────────────────────────────────────────────── */}
      {installable && (
        <button
          onClick={handleInstall}
          className={clsx(
            'fixed bottom-4 right-4 z-40',
            'flex items-center gap-2 px-4 py-2.5 rounded-full',
            'bg-primary hover:bg-primary-hover text-white text-sm font-medium',
            'shadow-lg border border-primary/30 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          )}
          aria-label="Install Audio Cutter app"
        >
          <Download size={15} aria-hidden="true" />
          Install app
        </button>
      )}
    </>
  )
}
