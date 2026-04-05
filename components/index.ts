/**
 * Components barrel exports
 * Provides a clean interface for importing components
 */

// Main audio components exports
export { AudioUploader } from './AudioUploader'
export type { AudioUploaderProps } from './AudioUploader'

export { AudioWaveform } from './AudioWaveform'
export type { AudioWaveformProps } from './AudioWaveform'

export { AudioPlayer } from './AudioPlayer'
export type { AudioPlayerProps } from './AudioPlayer'

export { AudioCutter } from './AudioCutter'
export type { AudioCutterProps } from './AudioCutter'

export { AudioExporter } from './AudioExporter'
export type { AudioExporterProps } from './AudioExporter'

// WaveSurfer-based waveform editor components
export { WaveformEditor } from './WaveformEditor'
export type { WaveformEditorProps } from './WaveformEditor'

export { WaveformControls } from './WaveformControls'
export type { WaveformControlsProps } from './WaveformControls'

export { TimelineMarkers } from './TimelineMarkers'
export type { TimelineMarkersProps } from './TimelineMarkers'

// Advanced export system
export { ExportPanel } from './export/ExportPanel'
export { ExportSettingsPanel } from './export/ExportSettings'
export { MetadataForm } from './export/MetadataForm'
export { ExportProgress } from './export/ExportProgress'

// UI components
export { LoadingSpinner } from './ui/LoadingSpinner'
export type { LoadingSpinnerProps } from './ui/LoadingSpinner'
export { Button } from './ui/Button'
export type { ButtonProps } from './ui/Button'
export { Input } from './ui/Input'
export type { InputProps } from './ui/Input'
export { Slider } from './ui/Slider'
export type { SliderProps } from './ui/Slider'
export { Progress } from './ui/Progress'
export type { ProgressProps } from './ui/Progress'