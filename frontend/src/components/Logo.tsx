import { Link } from 'react-router-dom'

export function Logo({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <Link to="/" className="inline-flex items-center gap-2.5" aria-label="EXAM WORLD - Trang chủ">
      <svg width="38" height="38" viewBox="0 0 42 42" fill="none" aria-hidden="true">
        <rect width="42" height="42" rx="14" fill={light ? '#FFFFFF' : '#8171E8'} />
        <path d="M12 12.5h17.5v4H16.5v3.2h10.8v3.8H16.5v3.3h13v4H12v-18.3Z" fill={light ? '#8171E8' : 'white'} />
        <path d="m28.5 9 1.1 2.4L32 12.5l-2.4 1.1-1.1 2.4-1.1-2.4-2.4-1.1 2.4-1.1L28.5 9Z" fill="#73D8E6" />
      </svg>
      {!compact && <span className={`text-[17px] font-extrabold tracking-[-.5px] ${light ? 'text-white' : 'text-ink'}`}>EXAM <span className={light ? 'text-cyan' : 'text-primary-500'}>WORLD</span></span>}
    </Link>
  )
}
