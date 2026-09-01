import type { ThemeSettings } from './types'

export const DEFAULT_THEME: ThemeSettings = {
  primary: '#2563eb',
  danger: '#dc2626',
  background: '#ffffff',
  radius: 10
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, '0')).join('')
}

function mix(hex: string, withHex: string, weight: number): string {
  // weight = 0..1 fraction of first color
  const a = hexToRgb(hex)
  const b = hexToRgb(withHex)
  if (!a || !b) return hex
  return rgbToHex(a.r * weight + b.r * (1 - weight), a.g * weight + b.g * (1 - weight), a.b * weight + b.b * (1 - weight))
}

function darken(hex: string, amount: number): string {
  // amount 0..1, darken towards black
  return mix(hex, '#000000', 1 - amount)
}

function lighten(hex: string, amount: number): string {
  return mix(hex, '#ffffff', 1 - amount)
}

export function applyTheme(settings: ThemeSettings): void {
  const root = document.documentElement
  const primary = (settings.primary || DEFAULT_THEME.primary).toLowerCase()
  const danger = (settings.danger || DEFAULT_THEME.danger).toLowerCase()
  const bg = (settings.background || DEFAULT_THEME.background).toLowerCase()
  const radius = Number.isFinite(settings.radius) ? Math.max(6, Math.min(16, Math.round(settings.radius))) : DEFAULT_THEME.radius

  const primaryRgb = hexToRgb(primary)
  const dangerRgb = hexToRgb(danger)
  if (!primaryRgb || !dangerRgb) return

  // Derived primary variants
  const primaryHover = darken(primary, 0.08) // ~ #1d4ed8 for default
  const primaryActive = darken(primary, 0.18)
  const primaryBg = mix(primary, '#ffffff', 0.08) // very light 8% primary
  const primaryBorder = mix(primary, '#ffffff', 0.18) // 18% primary
  const primaryRing = `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.18)`

  const dangerBg = mix(danger, '#ffffff', 0.08)
  const dangerBorder = mix(danger, '#ffffff', 0.22)
  const dangerHoverBg = mix(dangerBg, '#ffffff', 0.5)

  // Core surfaces — keep slate palette for borders/text, but bg/surface follow background pick
  // If background is not white, derive surface-2 as slightly darker
  const surface2 = bg.toLowerCase() === '#ffffff' ? '#f8fafc' : mix(bg, '#000000', 0.96) // 4% darken
  const surface3 = bg.toLowerCase() === '#ffffff' ? '#f1f5f9' : mix(bg, '#000000', 0.93)

  root.style.setProperty('--primary', primary)
  root.style.setProperty('--primary-hover', primaryHover)
  root.style.setProperty('--primary-active', primaryActive)
  root.style.setProperty('--primary-bg', primaryBg)
  root.style.setProperty('--primary-border', primaryBorder)
  root.style.setProperty('--primary-ring', primaryRing)

  root.style.setProperty('--danger', danger)
  root.style.setProperty('--danger-bg', dangerBg)
  root.style.setProperty('--danger-border', dangerBorder)

  root.style.setProperty('--bg', bg)
  root.style.setProperty('--surface', bg)
  root.style.setProperty('--surface-2', surface2)
  root.style.setProperty('--surface-3', surface3)
  root.style.setProperty('--input', bg)

  root.style.setProperty('--radius', `${radius}px`)
  root.style.setProperty('--radius-sm', `${Math.max(6, radius - 2)}px`)

  // Keep derived values that depend on primary for inline uses (e.g. meta theme-color)
  try {
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
    if (meta) meta.content = bg
  } catch {}

  // Also persist to localStorage for instant load before API
  try { localStorage.setItem('ks.theme', JSON.stringify(settings)) } catch {}
}

export function loadThemeFromStorage(): ThemeSettings | null {
  try {
    const raw = localStorage.getItem('ks.theme')
    if (!raw) return null
    const p = JSON.parse(raw)
    if (p && typeof p.primary === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.primary)) {
      return {
        primary: p.primary.toLowerCase(),
        danger: typeof p.danger === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.danger) ? p.danger.toLowerCase() : DEFAULT_THEME.danger,
        background: typeof p.background === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.background) ? p.background.toLowerCase() : DEFAULT_THEME.background,
        radius: Number.isFinite(p.radius) ? Math.max(6, Math.min(16, Math.round(Number(p.radius)))) : DEFAULT_THEME.radius
      }
    }
  } catch {}
  return null
}

// Apply stored theme synchronously before React mounts (avoids flash)
try {
  const stored = loadThemeFromStorage()
  if (stored) applyTheme(stored)
} catch {}
