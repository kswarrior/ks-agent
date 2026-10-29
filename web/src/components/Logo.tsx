export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="img" aria-label="KS Warrior">
      <rect width="64" height="64" rx="16" fill="#ffffff" />
      <path d="M32 8 50 14v15c0 12.5-7.6 22.4-18 27C21.6 51.4 14 41.5 14 29V14L32 8Z" fill="#000000" />
      <path
        d="M32 20v24M32 27.5 41 20M32 33.5 42 43"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
