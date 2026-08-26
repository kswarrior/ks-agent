import type { CSSProperties } from 'react'

interface IconProps {
  size?: number
  className?: string
  style?: CSSProperties
}

function base(size = 18, style?: CSSProperties) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style
  }
}

export const IconMenu = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
)

export const IconPlus = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

export const IconSearch = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <circle cx="11" cy="11" r="7" />
    <line x1="16.5" y1="16.5" x2="21" y2="21" />
  </svg>
)

export const IconChevronDown = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

export const IconChevronLeft = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

export const IconDots = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className} strokeWidth={2.4}>
    <circle cx="12" cy="5" r="0.6" fill="currentColor" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    <circle cx="12" cy="19" r="0.6" fill="currentColor" />
  </svg>
)

export const IconTrash = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
)

export const IconPencil = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
)

export const IconGear = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

export const IconSend = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M4.5 12h13" />
    <polyline points="12 5.5 18.5 12 12 18.5" transform="rotate(45 12 12)" />
  </svg>
)

export const IconX = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
)

export const IconChat = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

export const IconFolder = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
)

export const IconStop = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
  </svg>
)
