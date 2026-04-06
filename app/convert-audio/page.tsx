import type { Metadata } from 'next'
import { FormatConverter } from '@/components/FormatConverter'

export const metadata: Metadata = {
  title: 'Convert WAV to MP3 Online Free — Audio Cutter',
  description:
    'Convert WAV to MP3 (and more) directly in your browser. No uploads, no server — 100% private. Adjust bitrate, preview output size, and download instantly.',
  keywords: ['convert wav to mp3', 'audio converter online', 'wav mp3 converter free', 'convert audio browser', 'audio format converter'],
  openGraph: {
    title: 'Convert WAV to MP3 Online Free — Audio Cutter',
    description:
      'Browser-based audio converter. WAV → MP3, MP3 → WAV. Configure bitrate, see estimated file size, convert offline.',
    url: 'https://cutter.eliasrm.dev/convert-audio',
    siteName: 'Audio Cutter',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Convert WAV to MP3 Online Free',
    description: 'Fast, private audio conversion in your browser. No uploads required.',
  },
  alternates: {
    canonical: 'https://cutter.eliasrm.dev/convert-audio',
  },
}

export default function ConvertAudioPage() {
  return (
    <main className="container mx-auto px-4 py-10 max-w-2xl">
      {/* ── Hero ── */}
      <div className="text-center space-y-3 mb-8">
        <h1 className="text-4xl font-bold text-foreground">
          Convertir audio online
        </h1>
        <p className="text-lg text-foreground-secondary max-w-lg mx-auto">
          Convierte WAV → MP3, MP3 → WAV y más — directamente en tu navegador.
          Sin subir archivos, sin servidores. 100% privado.
        </p>
      </div>

      {/* ── Converter tool ── */}
      <FormatConverter />

      {/* ── SEO features section (indexable static text) ── */}
      <section className="mt-14 space-y-8 text-sm text-foreground-secondary" aria-label="Información sobre el conversor">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="space-y-1">
            <h2 className="font-semibold text-foreground">🔒 100% Privado</h2>
            <p>
              Tu audio nunca abandona tu dispositivo. Toda la conversión
              ocurre en el navegador usando la Web Audio API y WebAssembly.
            </p>
          </div>
          <div className="space-y-1">
            <h2 className="font-semibold text-foreground">⚡ Sin congelamiento</h2>
            <p>
              El encoding corre en un Web Worker independiente. La interfaz
              responde con fluidez mientras conviertes archivos grandes.
            </p>
          </div>
          <div className="space-y-1">
            <h2 className="font-semibold text-foreground">🎚️ Control de calidad</h2>
            <p>
              Elige el bitrate MP3 (96–320 kbps) y consulta el tamaño
              estimado antes de convertir. De "archivo más ligero" a "máxima calidad".
            </p>
          </div>
        </div>

        <div className="border-t border-border pt-6 space-y-4">
          <h2 className="text-base font-semibold text-foreground">
            Formatos soportados
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <dt className="font-medium text-foreground">Entrada</dt>
              <dd>WAV (PCM), MP3, OGG Vorbis — hasta 50 MB</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Salida</dt>
              <dd>
                <strong>MP3</strong> — 96, 128, 160, 192, 256 o 320 kbps<br />
                <strong>WAV</strong> — PCM 16-bit sin pérdidas
              </dd>
            </div>
          </dl>
        </div>

        <div className="border-t border-border pt-6 space-y-2">
          <h2 className="text-base font-semibold text-foreground">
            ¿Por qué convertir WAV a MP3?
          </h2>
          <p>
            Los archivos WAV son sin compresión y de altísima calidad, pero pueden
            ocupar 10× más espacio que un MP3 equivalente. Convertir a MP3 a
            192 kbps produce audio prácticamente indistinguible para el oído humano
            con un tamaño hasta 5× menor — ideal para streaming, podcasts y
            distribución web.
          </p>
        </div>
      </section>
    </main>
  )
}
