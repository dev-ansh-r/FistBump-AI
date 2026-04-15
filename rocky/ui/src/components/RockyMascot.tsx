/**
 * Rocky — five-limbed silhouette in Project Hail Mary spirit.
 * Idle pulse + occasional scuttle. Pure SVG, no animation library.
 */
export default function RockyMascot({ size = 22 }: { size?: number }) {
  return (
    <span
      title="Rocky"
      style={{
        display: 'inline-flex',
        animation: 'rocky-scuttle 28s ease-in-out infinite, rocky-pulse 3.5s ease-in-out infinite',
        transformOrigin: 'center',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        {/* Five legs radiating */}
        <g stroke="#d97706" strokeWidth="1.6" strokeLinecap="round" opacity="0.85">
          <path d="M16 16 L4 8" />
          <path d="M16 16 L4 22" />
          <path d="M16 16 L16 30" />
          <path d="M16 16 L28 22" />
          <path d="M16 16 L28 8" />
        </g>
        {/* Central body */}
        <circle cx="16" cy="16" r="5" fill="#d97706" opacity="0.9" />
        <circle cx="16" cy="16" r="2.2" fill="#f59e0b" />
      </svg>
    </span>
  )
}
