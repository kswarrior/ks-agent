import { useMemo, type CSSProperties } from 'react'

interface AnsiStyle {
  color?: string
  background?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  inverse?: boolean
  hidden?: boolean
}

interface AnsiSegment {
  text: string
  style: AnsiStyle | null
}

const ANSI_COLORS = [
  '#000000',
  '#cd3131',
  '#0dbc79',
  '#e5e510',
  '#2472c8',
  '#bc3fbc',
  '#11a8cd',
  '#e5e5e5',
  '#666666',
  '#f14c4c',
  '#23d18b',
  '#f5f543',
  '#3b8eea',
  '#d670d6',
  '#29b8db',
  '#ffffff'
]

const DEFAULT_FOREGROUND = '#e8e8e8'
const DEFAULT_BACKGROUND = '#050506'

function rgb(r: number, g: number, b: number): string {
  return `rgb(${r}, ${g}, ${b})`
}

function color256(index: number): string {
  if (!Number.isFinite(index) || index < 0) return ANSI_COLORS[0]
  if (index < 16) return ANSI_COLORS[index]
  if (index < 232) {
    const value = index - 16
    const steps = [0, 95, 135, 175, 215, 255]
    return rgb(steps[Math.floor(value / 36)], steps[Math.floor((value % 36) / 6)], steps[value % 6])
  }
  const gray = 8 + Math.min(23, index - 232) * 10
  return rgb(gray, gray, gray)
}

function resetStyle(style: AnsiStyle): void {
  for (const key of Object.keys(style)) delete style[key as keyof AnsiStyle]
}

function applySgr(style: AnsiStyle, params: string): void {
  const codes = (params === '' ? '0' : params).split(';').map((part) => (part === '' ? 0 : Number(part)))
  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index]
    if (!Number.isFinite(code)) continue
    if (code === 0) {
      resetStyle(style)
    } else if (code === 1) {
      style.bold = true
    } else if (code === 2) {
      style.dim = true
    } else if (code === 3) {
      style.italic = true
    } else if (code === 4) {
      style.underline = true
    } else if (code === 7) {
      style.inverse = true
    } else if (code === 8) {
      style.hidden = true
    } else if (code === 9) {
      style.strike = true
    } else if (code === 22) {
      delete style.bold
      delete style.dim
    } else if (code === 23) {
      delete style.italic
    } else if (code === 24) {
      delete style.underline
    } else if (code === 27) {
      delete style.inverse
    } else if (code === 28) {
      delete style.hidden
    } else if (code === 29) {
      delete style.strike
    } else if (code >= 30 && code <= 37) {
      style.color = ANSI_COLORS[code - 30]
    } else if (code === 39) {
      delete style.color
    } else if (code >= 40 && code <= 47) {
      style.background = ANSI_COLORS[code - 40]
    } else if (code === 49) {
      delete style.background
    } else if (code >= 90 && code <= 97) {
      style.color = ANSI_COLORS[code - 90 + 8]
    } else if (code >= 100 && code <= 107) {
      style.background = ANSI_COLORS[code - 100 + 8]
    } else if (code === 38 || code === 48) {
      const target = code === 38 ? 'color' : 'background'
      const mode = codes[index + 1]
      if (mode === 5) {
        style[target] = color256(codes[index + 2] ?? 0)
        index += 2
      } else if (mode === 2) {
        style[target] = rgb(codes[index + 2] ?? 0, codes[index + 3] ?? 0, codes[index + 4] ?? 0)
        index += 4
      }
    }
  }
}

function findCsiEnd(text: string, start: number): number {
  for (let index = start; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code >= 0x40 && code <= 0x7e) return index
  }
  return -1
}

function findOscEnd(text: string, start: number): number {
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '\x07') return index + 1
    if (text[index] === '\x1b' && text[index + 1] === '\\') return index + 2
  }
  return text.length
}

function parseAnsi(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = []
  const style: AnsiStyle = {}
  let buffer = ''

  const push = () => {
    if (!buffer) return
    segments.push({ text: buffer, style: Object.keys(style).length ? { ...style } : null })
    buffer = ''
  }

  let index = 0
  while (index < text.length) {
    const char = text[index]
    if (char === '\x1b' || char === '\u009b') {
      if (char === '\u009b') {
        push()
        const end = findCsiEnd(text, index + 1)
        if (end === -1) break
        if (text[end] === 'm') applySgr(style, text.slice(index + 1, end))
        index = end + 1
        continue
      }
      const next = text[index + 1]
      if (next === '[') {
        push()
        const end = findCsiEnd(text, index + 2)
        if (end === -1) break
        if (text[end] === 'm') applySgr(style, text.slice(index + 2, end))
        index = end + 1
        continue
      }
      if (next === ']' || next === 'P' || next === '^' || next === '_') {
        push()
        index = findOscEnd(text, index + 2)
        continue
      }
      if (next === undefined) break
      push()
      index += 2
      continue
    }
    if (char === '\x07') {
      index += 1
      continue
    }
    buffer += char
    index += 1
  }
  push()
  return segments
}

function overwriteLine(line: string): string {
  if (!line.includes('\r')) return line
  let current = ''
  for (const part of line.split('\r')) {
    current = part + current.slice(part.length)
  }
  return current
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(overwriteLine)
    .join('\n')
}

function segmentStyle(style: AnsiStyle): CSSProperties {
  let color = style.color
  let background = style.background
  if (style.bold && color) {
    const index = ANSI_COLORS.indexOf(color)
    if (index >= 0 && index < 8) color = ANSI_COLORS[index + 8]
  }
  if (style.inverse) {
    const nextColor = background ?? DEFAULT_BACKGROUND
    background = color ?? DEFAULT_FOREGROUND
    color = nextColor
  }
  const css: CSSProperties = {}
  if (color) css.color = color
  if (background) css.backgroundColor = background
  if (style.bold) css.fontWeight = 700
  if (style.dim) css.opacity = 0.65
  if (style.italic) css.fontStyle = 'italic'
  if (style.underline) css.textDecoration = 'underline'
  if (style.strike) css.textDecoration = css.textDecoration ? 'underline line-through' : 'line-through'
  if (style.hidden) css.visibility = 'hidden'
  return css
}

export function TerminalOutput({
  text,
  className = '',
  error = false
}: {
  text: string
  className?: string
  error?: boolean
}) {
  const segments = useMemo(() => parseAnsi(normalizeText(text)), [text])
  return (
    <pre className={`terminal-output${error ? ' error' : ''}${className ? ` ${className}` : ''}`}>
      {segments.map((segment, index) =>
        segment.style ? (
          <span key={index} style={segmentStyle(segment.style)}>
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </pre>
  )
}
