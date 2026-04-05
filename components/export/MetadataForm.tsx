'use client'

import React, { useCallback } from 'react'
import { Tag } from 'lucide-react'
import { clsx } from 'clsx'
import { useAudioStore, useExportMetadata } from '@/store/useAudioStore'
import { Input } from '@/components/ui'
import type { ExportMetadata } from '@/types/export'

const MAX_COVER_SIZE_BYTES = 500 * 1024 // 500 KB

interface MetadataFormProps {
  className?: string
}

export function MetadataForm({ className }: MetadataFormProps) {
  const metadata = useExportMetadata()
  const setExportMetadata = useAudioStore(s => s.setExportMetadata)

  const set = useCallback(
    (key: keyof ExportMetadata, value: string | null) =>
      setExportMetadata({ [key]: value }),
    [setExportMetadata]
  )

  const handleCoverChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) {
        set('coverArt', null)
        return
      }
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file.')
        return
      }
      if (file.size > MAX_COVER_SIZE_BYTES) {
        alert(`Cover image must be smaller than ${MAX_COVER_SIZE_BYTES / 1024} KB.`)
        return
      }
      const reader = new FileReader()
      reader.onload = ev => set('coverArt', ev.target?.result as string)
      reader.readAsDataURL(file)
    },
    [set]
  )

  const removeCover = useCallback(() => set('coverArt', null), [set])

  const fields: Array<{ key: keyof ExportMetadata; label: string; placeholder: string }> = [
    { key: 'title',  label: 'Title',  placeholder: 'Song title' },
    { key: 'artist', label: 'Artist', placeholder: 'Artist name' },
    { key: 'album',  label: 'Album',  placeholder: 'Album name' },
    { key: 'year',   label: 'Year',   placeholder: '2024' },
    { key: 'genre',  label: 'Genre',  placeholder: 'e.g. Electronic' },
  ]

  return (
    <section className={clsx('space-y-4', className)} aria-label="ID3 metadata">
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">
          Metadata <span className="text-foreground-muted font-normal">(MP3 ID3 tags)</span>
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map(({ key, label, placeholder }) => (
          <div key={key} className="space-y-1">
            <Input
              value={(metadata[key] as string) ?? ''}
              onChange={value => set(key, value)}
              placeholder={placeholder}
              label={label}
              type={key === 'year' ? 'number' : 'text'}
              className="text-sm"
              aria-label={`${label} metadata`}
            /></div>
        ))}

        {/* Cover art — only relevant for MP3, shown anyway for discoverability */}
        <div className="space-y-1 sm:col-span-2">
          <label className="block text-xs font-medium text-foreground-secondary">
            Cover Art
            <span className="text-foreground-muted ml-1 font-normal">
              (JPEG/PNG, max 500 KB)
            </span>
          </label>
          <div className="flex items-center gap-3">
            {metadata.coverArt ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={metadata.coverArt}
                  alt="Album cover preview"
                  className="h-14 w-14 rounded object-cover border border-border"
                />
                <button
                  type="button"
                  onClick={removeCover}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  aria-label="Remove cover art"
                >
                  Remove
                </button>
              </>
            ) : (
              <label
                className={clsx(
                  'cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border',
                  'text-xs text-foreground-secondary hover:border-primary hover:text-primary transition-colors'
                )}
              >
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleCoverChange}
                  className="sr-only"
                  aria-label="Upload cover art"
                />
                + Upload image
              </label>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
