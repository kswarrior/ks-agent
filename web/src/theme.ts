import type { ThemeSettings } from './types'

export const DEFAULT_THEME: ThemeSettings = {
  primary: '#2563eb',
  danger: '#ef4444',
  background: '#000000',
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

function isDark(hex: string): boolean {
  const rgb = hexToRgb(hex)
  if (!rgb) return false
  const lum = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b
  return lum < 140
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

  const dark = isDark(bg)

  // Derived primary variants
  const primaryHover = darken(primary, 0.08) // ~ #1d4ed8 for default
  const primaryActive = darken(primary, 0.18)
  const primaryBg = dark ? mix(primary, bg, 0.18) : mix(primary, '#ffffff', 0.08) // tint with bg for dark, white for light
  const primaryBorder = dark ? mix(primary, bg, 0.32) : mix(primary, '#ffffff', 0.18)
  const primaryRing = `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, ${dark ? 0.35 : 0.18})`

  const dangerBg = dark ? mix(danger, bg, 0.14) : mix(danger, '#ffffff', 0.08)
  const dangerBorder = dark ? mix(danger, bg, 0.30) : mix(danger, '#ffffff', 0.22)

  // Core surfaces — full palette switch based on bg darkness
  let surface: string, surface2: string, surface3: string, input: string
  let border: string, borderStrong: string, border2: string
  let btn: string, btnHover: string, btnActive: string
  let text: string, textDim: string, textFaint: string

  if (dark) {
    surface = '#050505'
    surface2 = '#0a0a0a'
    surface3 = '#151515'
    input = '#080808'
    border = '#1a1a1a'
    borderStrong = '#252525'
    border2 = '#1a1a1a'
    btn = '#0f0f0f'
    btnHover = '#151515'
    btnActive = '#1e1e1e'
    text = '#e8e8e8'
    textDim = '#9a9a9a'
    textFaint = '#6b6b6b'
    // keep bg as chosen dark (usually #000000) — if user picked not pure black, derive surfaces slightly lighter
    if (bg !== '#000000') {
      surface = mix(bg, '#ffffff', 0.04)
      surface2 = mix(bg, '#ffffff', 0.06)
      surface3 = mix(bg, '#ffffff', 0.09)
      input = mix(bg, '#ffffff', 0.03)
      border = mix(bg, '#ffffff', 0.10)
      borderStrong = mix(bg, '#ffffff', 0.15)
      btn = mix(bg, '#ffffff', 0.06)
      btnHover = mix(bg, '#ffffff', 0.09)
    }
  } else {
    surface = '#ffffff'
    surface2 = '#f8fafc'
    surface3 = '#f1f5f9'
    input = '#ffffff'
    border = '#e2e8f0'
    borderStrong = '#cbd5e1'
    border2 = '#f1f5f9'
    btn = '#ffffff'
    btnHover = '#f8fafc'
    btnActive = '#f1f5f9'
    text = '#0f172a'
    textDim = '#475569'
    textFaint = '#94a3b8'
    if (bg !== '#ffffff') {
      // custom light bg (e.g. #fefce8) — tint surfaces a bit
      surface = bg
      surface2 = mix(bg, '#000000', 0.96)
      surface3 = mix(bg, '#000000', 0.93)
      input = bg
    }
  }

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
  root.style.setProperty('--surface', surface)
  root.style.setProperty('--surface-2', surface2)
  root.style.setProperty('--surface-3', surface3)
  root.style.setProperty('--input', input)

  root.style.setProperty('--border', border)
  root.style.setProperty('--border-strong', borderStrong)
  root.style.setProperty('--border-2', border2)
  root.style.setProperty('--btn', btn)
  root.style.setProperty('--btn-hover', btnHover)
  root.style.setProperty('--btn-active', btnActive)
  root.style.setProperty('--text', text)
  root.style.setProperty('--text-dim', textDim)
  root.style.setProperty('--text-faint', textFaint)
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
