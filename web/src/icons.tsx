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
  <svg {...base(size, style)} className={className} strokeWidth={1.9}>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22 11 13 2 9 22 2z" />
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

export const IconPanelRight = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="15" y1="4" x2="15" y2="20" />
  </svg>
)

export const IconFile = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
)

// ── File-type icons: distinct shape per kind, colour via currentColor ──

export const IconFileCode = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <polyline points="9.5 14 7.5 16 9.5 18" />
    <polyline points="14.5 14 16.5 16 14.5 18" />
    <line x1="11" y1="18.5" x2="13" y2="13.5" />
  </svg>
)

export const IconFileJs = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <text x="12" y="17.2" fontSize="6.2" fontWeight="800" textAnchor="middle" fontFamily="ui-monospace,monospace" fill="currentColor" stroke="none">JS</text>
  </svg>
)

export const IconFileTs = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <text x="12" y="17.2" fontSize="6.2" fontWeight="800" textAnchor="middle" fontFamily="ui-monospace,monospace" fill="currentColor" stroke="none">TS</text>
  </svg>
)

export const IconFileJson = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <text x="12" y="17.5" fontSize="7" fontWeight="700" textAnchor="middle" fontFamily="ui-monospace,monospace" fill="currentColor" stroke="none">{'{}'}</text>
  </svg>
)

export const IconFileCss = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <text x="12" y="17.2" fontSize="6.5" fontWeight="800" textAnchor="middle" fontFamily="ui-monospace,monospace" fill="currentColor" stroke="none">#</text>
  </svg>
)

export const IconFileHtml = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <text x="12" y="17.5" fontSize="6" fontWeight="800" textAnchor="middle" fontFamily="ui-monospace,monospace" fill="currentColor" stroke="none">{'<>'}</text>
  </svg>
)

export const IconFileMd = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13.5" x2="16" y2="13.5" strokeWidth={1.4} />
    <line x1="8" y1="16" x2="16" y2="16" strokeWidth={1.4} />
    <line x1="8" y1="18.5" x2="13" y2="18.5" strokeWidth={1.4} />
  </svg>
)

export const IconFilePy = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <text x="12" y="17.2" fontSize="5.5" fontWeight="800" textAnchor="middle" fontFamily="ui-monospace,monospace" fill="currentColor" stroke="none">PY</text>
  </svg>
)

export const IconFileImage = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9.2" r="1.8" fill="currentColor" stroke="none" />
    <path d="M5 18.5 L10.5 12.5 L13.5 15.5 L16 13 L19 18.5" fill="none" />
  </svg>
)

export const IconFileArchive = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <rect x="3" y="7" width="18" height="12" rx="1.5" />
    <path d="M3 7 L12 12 L21 7" />
    <line x1="12" y1="12" x2="12" y2="19" />
    <line x1="9" y1="15.5" x2="15" y2="15.5" />
  </svg>
)

export const IconFilePdf = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <text x="12" y="17" fontSize="5" fontWeight="800" textAnchor="middle" fontFamily="ui-monospace,monospace" fill="currentColor" stroke="none">PDF</text>
  </svg>
)

export const IconFileShell = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <polyline points="8.5 14.5 10.5 16.5 8.5 18.5" />
    <line x1="12" y1="18.5" x2="16" y2="18.5" />
  </svg>
)

export const IconFileYaml = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <text x="12" y="17" fontSize="4.5" fontWeight="800" textAnchor="middle" fontFamily="ui-monospace,monospace" fill="currentColor" stroke="none">YML</text>
  </svg>
)

export const IconFileConfig = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <circle cx="12" cy="15.5" r="2" />
    <path d="M12 13.5 v1 M12 16.5 v1 M13.3 14.2 l0.7 -0.7 M10 17.8 l0.7 -0.7 M13.3 16.8 l0.7 0.7 M10 14.2 l0.7 0.7 M14 15.5 h1 M9 15.5 h1" strokeWidth={1.2} />
  </svg>
)

export const IconFileDocker = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <rect x="7" y="13" width="10" height="5" rx="0.8" />
    <rect x="8.2" y="11" width="2" height="2" rx="0.3" />
    <rect x="10.8" y="11" width="2" height="2" rx="0.3" />
    <rect x="13.5" y="11" width="2" height="2" rx="0.3" />
  </svg>
)

// ── File-type meta helper ──

export type FileMeta = {
  color: string
  language: string
  label: string
  Icon: (p: IconProps) => JSX.Element
}

function extOf(name: string): string {
  const base = (name.split('/').pop() ?? name).toLowerCase()
  // special basenames
  if (base === 'dockerfile' || base === 'makefile' || base === 'jenkinsfile') return base
  if (base === '.gitignore' || base === '.gitattributes' || base === '.gitmodules' || base === '.env' || base.startsWith('.env.')) return base
  const dot = base.lastIndexOf('.')
  if (dot === -1 || dot === 0) return base
  return base.slice(dot + 1).toLowerCase()
}

export function getFileMeta(filename: string): FileMeta {
  const ext = extOf(filename)
  const lower = filename.toLowerCase()
  // image
  if (['png','jpg','jpeg','gif','webp','bmp','ico','tiff','svg'].includes(ext)) {
    // svg could be markup but treat as image when extension is svg and not sure; keep as image colour
    if (ext === 'svg') return { color: '#e37933', language: 'xml', label: 'SVG', Icon: IconFileImage }
    return { color: '#a855f7', language: 'image', label: ext.toUpperCase(), Icon: IconFileImage }
  }
  if (['mp4','mov','avi','mkv','mp3','wav','flac','ogg','webm'].includes(ext)) return { color: '#f472b6', language: 'media', label: ext.toUpperCase(), Icon: IconFileImage }
  if (['zip','tar','gz','tgz','rar','7z','bz2','xz'].includes(ext)) return { color: '#f97316', language: 'archive', label: ext.toUpperCase(), Icon: IconFileArchive }
  if (ext === 'pdf') return { color: '#ef4444', language: 'pdf', label: 'PDF', Icon: IconFilePdf }
  if (['js','mjs','cjs'].includes(ext)) return { color: '#f7df1e', language: 'javascript', label: 'JS', Icon: IconFileJs }
  if (ext === 'jsx') return { color: '#61dafb', language: 'javascript', label: 'JSX', Icon: IconFileJs }
  if (['ts','mts','cts'].includes(ext)) return { color: '#3178c6', language: 'typescript', label: 'TS', Icon: IconFileTs }
  if (ext === 'tsx') return { color: '#3178c6', language: 'typescript', label: 'TSX', Icon: IconFileTs }
  if (['json','jsonc'].includes(ext)) return { color: '#f59e0b', language: 'json', label: 'JSON', Icon: IconFileJson }
  if (['css'].includes(ext)) return { color: '#1572b6', language: 'css', label: 'CSS', Icon: IconFileCss }
  if (['scss','sass','less'].includes(ext)) return { color: '#c6538c', language: 'css', label: 'SCSS', Icon: IconFileCss }
  if (['html','htm'].includes(ext)) return { color: '#e34f26', language: 'html', label: 'HTML', Icon: IconFileHtml }
  if (['md','markdown','mdx'].includes(ext)) return { color: '#519aba', language: 'markdown', label: 'MD', Icon: IconFileMd }
  if (['py','pyw'].includes(ext)) return { color: '#3572A5', language: 'python', label: 'PY', Icon: IconFilePy }
  if (ext === 'java') return { color: '#b07219', language: 'java', label: 'JAVA', Icon: IconFileCode }
  if (ext === 'go') return { color: '#00ADD8', language: 'go', label: 'GO', Icon: IconFileCode }
  if (ext === 'rs') return { color: '#dea584', language: 'rust', label: 'RS', Icon: IconFileCode }
  if (ext === 'php') return { color: '#777bb4', language: 'php', label: 'PHP', Icon: IconFileCode }
  if (ext === 'rb') return { color: '#cc342d', language: 'ruby', label: 'RB', Icon: IconFileCode }
  if (['sh','bash','zsh','fish','ps1'].includes(ext)) return { color: '#89e051', language: 'shell', label: 'SH', Icon: IconFileShell }
  if (['yaml','yml'].includes(ext)) return { color: '#f05138', language: 'yaml', label: 'YAML', Icon: IconFileYaml }
  if (ext === 'toml') return { color: '#9ca3af', language: 'toml', label: 'TOML', Icon: IconFileYaml }
  if (['xml'].includes(ext)) return { color: '#e37933', language: 'xml', label: 'XML', Icon: IconFileYaml }
  if (['sql'].includes(ext)) return { color: '#e38c00', language: 'sql', label: 'SQL', Icon: IconFileCode }
  if (['graphql','gql'].includes(ext)) return { color: '#e535ab', language: 'graphql', label: 'GQL', Icon: IconFileCode }
  if (['c','h'].includes(ext)) return { color: '#555555', language: 'c', label: 'C', Icon: IconFileCode }
  if (['cpp','cc','hpp','cxx'].includes(ext)) return { color: '#f34b7d', language: 'cpp', label: 'CPP', Icon: IconFileCode }
  if (ext === 'cs') return { color: '#178600', language: 'csharp', label: 'CS', Icon: IconFileCode }
  if (ext === 'swift') return { color: '#ffac45', language: 'swift', label: 'SWIFT', Icon: IconFileCode }
  if (['kt','kts'].includes(ext)) return { color: '#A97BFF', language: 'kotlin', label: 'KT', Icon: IconFileCode }
  if (ext === 'dart') return { color: '#00B4AB', language: 'dart', label: 'DART', Icon: IconFileCode }
  if (ext === 'dockerfile' || lower.endsWith('dockerfile')) return { color: '#2496ed', language: 'dockerfile', label: 'DOCKER', Icon: IconFileDocker }
  if (ext === '.gitignore' || ext === '.gitattributes' || ext === '.gitmodules') return { color: '#f05032', language: 'gitignore', label: 'GIT', Icon: IconFileConfig }
  if (ext === '.env' || ext.startsWith('.env.')) return { color: '#ecd53f', language: 'shell', label: 'ENV', Icon: IconFileConfig }
  if (ext === 'makefile') return { color: '#427819', language: 'makefile', label: 'MAKE', Icon: IconFileShell }
  // fallback
  return { color: '#6b6b6b', language: 'plaintext', label: ext ? ext.toUpperCase().slice(0,4) : 'FILE', Icon: IconFile }
}

export function FileIcon({ name, size, style }: { name: string; size?: number; style?: CSSProperties }) {
  const meta = getFileMeta(name)
  const Icon = meta.Icon
  return <Icon size={size} style={{ ...style, color: meta.color }} />
}

export const IconDownload = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

export const IconUpload = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

export const IconCheck = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} strokeWidth={2.6}>
    <polyline points="4.5 12.5 10 18 19.5 6.5" />
  </svg>
)

export const IconRotate = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)}>
    <path d="M23 4v6h-6" />
    <path d="M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)

export const IconRefreshCw = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M21 12a9 9 0 1 1-9 9 9.75 9.75 0 0 1 6.74-2.74L21 16" />
  </svg>
)

export const IconExternalLink = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
)

export const IconActivity = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)}>
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
)

export const IconEdit = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

export const IconTerminal = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
)

export const IconMonitor = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
)

export const IconPlay = ({ size, className, style }: IconProps) => (
  <svg {...base(size, style)} className={className} fill="currentColor" stroke="none" viewBox="0 0 24 24">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
)
