'use client'

import React from 'react'
import { Settings2 } from 'lucide-react'
import { clsx } from 'clsx'
import { useAudioStore, useExportSettings } from '@/store/useAudioStore'
import type { ExportSettings, ExportFormat, Mp3Bitrate, WavBitDepth, ExportSampleRate, ExportMode } from '@/types/export'

interface ExportSettingsProps {
  className?: string
}

// ── Reusable select component ─────────────────────────────────────────────────

interface SelectFieldProps<T extends string | number> {
  id: string
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  disabled?: boolean
}

function SelectField<T extends string | number>({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
}: SelectFieldProps<T>) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-foreground-secondary">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={e => {
          const raw = e.target.value
          onChange((typeof value === 'number' ? Number(raw) : raw) as T)
        }}
        disabled={disabled}
        className={clsx(
          'w-full px-3 py-2 text-sm rounded-md border border-border',
          'bg-background text-foreground',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
        )}
        aria-label={label}
      >
        {options.map(opt => (
          <option key={String(opt.value)} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// ── Toggle button group ───────────────────────────────────────────────────────

interface ToggleGroupProps<T extends string> {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
}

function ToggleGroup<T extends string>({ label, value, options, onChange }: ToggleGroupProps<T>) {
  return (
    <div className="space-y-1">
      <span className="block text-xs font-medium text-foreground-secondary">{label}</span>
      <div className="flex rounded-md overflow-hidden border border-border" role="group" aria-label={label}>
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
            className={clsx(
              'flex-1 px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none',
              'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
              value === opt.value
                ? 'bg-primary text-white'
                : 'bg-background text-foreground-secondary hover:bg-background-secondary'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ExportSettingsPanel({ className }: ExportSettingsProps) {
  const settings = useExportSettings()
  const setExportSettings = useAudioStore(s => s.setExportSettings)

  const set = <K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) =>
    setExportSettings({ [key]: value })

  const isWav = settings.format === 'wav'
  const isMp3 = settings.format === 'mp3'

  return (
    <section className={clsx('space-y-5', className)} aria-label="Export settings">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Export Settings</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Format */}
        <ToggleGroup<ExportFormat>
          label="Format"
          value={settings.format}
          options={[
            { value: 'wav', label: 'WAV' },
            { value: 'mp3', label: 'MP3' },
          ]}
          onChange={v => set('format', v)}
        />

        {/* Export mode */}
        <ToggleGroup<ExportMode>
          label="Export Mode"
          value={settings.exportMode}
          options={[
            { value: 'individual', label: 'Individual' },
            { value: 'concatenated', label: 'Playlist' },
          ]}
          onChange={v => set('exportMode', v)}
        />

        {/* Sample rate — shared WAV/MP3 */}
        <SelectField<ExportSampleRate>
          id="export-samplerate"
          label="Sample Rate"
          value={settings.sampleRate}
          options={[
            { value: 44100, label: '44.1 kHz (CD quality)' },
            { value: 48000, label: '48 kHz (broadcast)' },
          ]}
          onChange={v => set('sampleRate', v)}
        />

        {/* WAV: bit depth */}
        {isWav && (
          <SelectField<WavBitDepth>
            id="export-bitdepth"
            label="Bit Depth"
            value={settings.bitDepth}
            options={[
              { value: 16, label: '16-bit (standard)' },
              { value: 24, label: '24-bit (studio)' },
            ]}
            onChange={v => set('bitDepth', v)}
          />
        )}

        {/* MP3: bitrate */}
        {isMp3 && (
          <SelectField<Mp3Bitrate>
            id="export-bitrate"
            label="MP3 Bitrate"
            value={settings.bitrate}
            options={[
              { value: 96,  label: '96 kbps (low)' },
              { value: 128, label: '128 kbps (standard)' },
              { value: 192, label: '192 kbps (high)' },
              { value: 320, label: '320 kbps (maximum)' },
            ]}
            onChange={v => set('bitrate', v)}
          />
        )}
      </div>

      {/* Processing */}
      <div className="space-y-3 pt-2 border-t border-border">
        <h4 className="text-xs font-semibold text-foreground-secondary uppercase tracking-wide">
          Processing
        </h4>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={settings.normalize}
            onChange={e => set('normalize', e.target.checked)}
            className="w-4 h-4 accent-primary rounded"
            aria-label="Normalize volume"
          />
          <span className="text-sm text-foreground">
            Normalize volume
            <span className="text-foreground-muted text-xs ml-1">(peak at −0.5 dBFS)</span>
          </span>
        </label>
      </div>
    </section>
  )
}
