import { motion } from 'framer-motion'
import type { ComponentType, ReactNode } from 'react'

type CharacterName = 'owl' | 'star' | 'cat' | 'robot' | 'whale' | 'bird'

const float = { duration: 3.6, repeat: Infinity, ease: 'easeInOut' as const }

function Shell({ children, label, size, className, delay = 0 }: { children: ReactNode; label: string; size: number; className?: string; delay?: number }) {
  return (
    <motion.svg
      width={size} height={size} viewBox="0 0 200 200" fill="none" role="img" aria-label={label}
      className={className} initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay, duration: .4 }}
    >
      <motion.g animate={{ y: [0, -6, 0] }} transition={{ ...float, delay }}>{children}</motion.g>
    </motion.svg>
  )
}

export function OwlProfessor({ size = 160, className = '' }: { size?: number; className?: string }) {
  return (
    <Shell label="Giáo sư Cú Mèo thông thái" size={size} className={className}>
      <ellipse cx="100" cy="182" rx="58" ry="9" fill="#8171E8" opacity=".1" />
      <path d="M52 78 40 44l30 16M148 78l12-34-30 16" fill="#8D7CEC" stroke="#6B59CA" strokeWidth="4" strokeLinejoin="round" />
      <path d="M100 40c34 0 56 26 56 62 0 40-24 66-56 66s-56-26-56-66c0-36 22-62 56-62Z" fill="url(#owlBody)" stroke="#6B59CA" strokeWidth="5" />
      <path d="M100 96c20 0 34 16 34 38 0 20-14 32-34 32s-34-12-34-32c0-22 14-38 34-38Z" fill="#F3EFFF" />
      <path d="M78 128h44M78 140h44M84 152h32" stroke="#D9D0F8" strokeWidth="3" strokeLinecap="round" />
      <circle cx="76" cy="88" r="20" fill="white" stroke="#6B59CA" strokeWidth="4" />
      <circle cx="124" cy="88" r="20" fill="white" stroke="#6B59CA" strokeWidth="4" />
      <path d="M96 88h8" stroke="#6B59CA" strokeWidth="4" />
      <motion.g animate={{ scaleY: [1, 1, .1, 1, 1] }} transition={{ duration: 5, repeat: Infinity, times: [0, .44, .5, .56, 1] }} style={{ originY: '88px' }}>
        <circle cx="76" cy="88" r="8" fill="#252944" /><circle cx="124" cy="88" r="8" fill="#252944" />
        <circle cx="79" cy="85" r="2.5" fill="white" /><circle cx="127" cy="85" r="2.5" fill="white" />
      </motion.g>
      <path d="m100 98-9 12 9 8 9-8-9-12Z" fill="#FFBE69" stroke="#D99A45" strokeWidth="3" strokeLinejoin="round" />
      <path d="M44 66 100 40l56 26-56 22-56-22Z" fill="#252944" stroke="#1B1E33" strokeWidth="3" strokeLinejoin="round" />
      <path d="M100 62v20" stroke="#FFBE69" strokeWidth="3" /><circle cx="100" cy="84" r="4" fill="#FFBE69" />
      <path d="M148 60v22" stroke="#FFBE69" strokeWidth="3" strokeLinecap="round" /><circle cx="148" cy="84" r="4" fill="#F27D91" />
      <path d="M56 130c-14 4-22 14-20 26 12 2 24-4 30-14M144 130c14 4 22 14 20 26-12 2-24-4-30-14" fill="#8D7CEC" stroke="#6B59CA" strokeWidth="4" strokeLinejoin="round" />
      <defs><linearGradient id="owlBody" x1="60" y1="50" x2="140" y2="160" gradientUnits="userSpaceOnUse"><stop stopColor="#A99AF3" /><stop offset="1" stopColor="#8171E8" /></linearGradient></defs>
    </Shell>
  )
}

export function StarBuddy({ size = 150, className = '' }: { size?: number; className?: string }) {
  return (
    <Shell label="Ngôi sao cổ vũ" size={size} className={className} delay={.1}>
      <ellipse cx="100" cy="184" rx="52" ry="8" fill="#FFBE69" opacity=".18" />
      <motion.g animate={{ rotate: [0, -4, 4, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} style={{ originX: '100px', originY: '100px' }}>
        <path d="m100 26 22 46 50 7-36 35 9 50-45-24-45 24 9-50-36-35 50-7 22-46Z" fill="url(#starBody)" stroke="#D99A45" strokeWidth="5" strokeLinejoin="round" />
        <ellipse cx="82" cy="98" rx="7" ry="10" fill="#252944" /><ellipse cx="118" cy="98" rx="7" ry="10" fill="#252944" />
        <circle cx="84" cy="94" r="2.5" fill="white" /><circle cx="120" cy="94" r="2.5" fill="white" />
        <ellipse cx="68" cy="112" rx="9" ry="5" fill="#F49AB9" opacity=".6" /><ellipse cx="132" cy="112" rx="9" ry="5" fill="#F49AB9" opacity=".6" />
        <path d="M86 116c8 12 20 12 28 0-9 4-19 4-28 0Z" fill="#B7791F" stroke="#B7791F" strokeWidth="3" strokeLinejoin="round" />
      </motion.g>
      <motion.path d="m38 44 3 7 8 1-6 6 2 8-7-4-7 4 1-8-5-6 8-1 3-7Z" fill="#73D8E6" animate={{ opacity: [.3, 1, .3], scale: [.8, 1.1, .8] }} transition={{ duration: 2.4, repeat: Infinity }} style={{ originX: '38px', originY: '50px' }} />
      <motion.path d="m164 130 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z" fill="#F27D91" animate={{ opacity: [.3, 1, .3], scale: [.8, 1.1, .8] }} transition={{ duration: 2.4, repeat: Infinity, delay: 1.2 }} style={{ originX: '164px', originY: '136px' }} />
      <defs><linearGradient id="starBody" x1="60" y1="40" x2="140" y2="160" gradientUnits="userSpaceOnUse"><stop stopColor="#FFD79A" /><stop offset="1" stopColor="#FFBE69" /></linearGradient></defs>
    </Shell>
  )
}

export function CatScholar({ size = 160, className = '' }: { size?: number; className?: string }) {
  return (
    <Shell label="Mèo Miu chăm học" size={size} className={className} delay={.05}>
      <ellipse cx="100" cy="184" rx="56" ry="8" fill="#47C99A" opacity=".14" />
      <path d="M58 70 50 34l32 22M142 70l8-36-32 22" fill="#5FD3A8" stroke="#2E9C77" strokeWidth="4" strokeLinejoin="round" />
      <path d="M62 52 58 42l14 10M138 52l4-10-14 10" fill="#F49AB9" />
      <path d="M100 46c32 0 54 24 54 56 0 36-22 60-54 60s-54-24-54-60c0-32 22-56 54-56Z" fill="url(#catBody)" stroke="#2E9C77" strokeWidth="5" />
      <path d="M100 108c16 0 28 12 28 30 0 16-12 26-28 26s-28-10-28-26c0-18 12-30 28-30Z" fill="#EAFBF4" />
      <motion.g animate={{ scaleY: [1, 1, .12, 1, 1] }} transition={{ duration: 4.4, repeat: Infinity, times: [0, .46, .52, .58, 1] }} style={{ originY: '92px' }}>
        <path d="M70 92c5-6 13-6 18 0M112 92c5-6 13-6 18 0" stroke="#252944" strokeWidth="5" strokeLinecap="round" fill="none" />
      </motion.g>
      <path d="m100 104-6 6 6 5 6-5-6-6Z" fill="#F49AB9" stroke="#D879A1" strokeWidth="2" strokeLinejoin="round" />
      <path d="M100 115v6M100 121c-4 5-10 5-13 1M100 121c4 5 10 5 13 1" stroke="#2E9C77" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M56 104h-22M58 114l-20 6M144 104h22M142 114l20 6" stroke="#2E9C77" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="70" cy="112" rx="9" ry="5" fill="#F49AB9" opacity=".5" /><ellipse cx="130" cy="112" rx="9" ry="5" fill="#F49AB9" opacity=".5" />
      <path d="M64 148c22-9 40-5 36 12 22-9 40-5 36 12" fill="none" />
      <g><path d="M58 150c26-10 50-6 70 8v26c-20-13-44-17-70-8v-26Z" fill="white" stroke="#2E9C77" strokeWidth="4" strokeLinejoin="round" /><path d="M128 158c8-4 14-4 14 2v24c0-5-6-6-14-2" fill="#EAFBF4" stroke="#2E9C77" strokeWidth="4" strokeLinejoin="round" /><path d="M70 160h34M70 169h28" stroke="#BFEEDC" strokeWidth="3" strokeLinecap="round" /></g>
      <defs><linearGradient id="catBody" x1="60" y1="50" x2="140" y2="160" gradientUnits="userSpaceOnUse"><stop stopColor="#7FE3BE" /><stop offset="1" stopColor="#47C99A" /></linearGradient></defs>
    </Shell>
  )
}

export function RobotHelper({ size = 150, className = '' }: { size?: number; className?: string }) {
  return (
    <Shell label="Rô-bi trợ lý" size={size} className={className} delay={.15}>
      <ellipse cx="100" cy="184" rx="50" ry="8" fill="#67A9ED" opacity=".16" />
      <path d="M100 34v14" stroke="#4482C0" strokeWidth="4" strokeLinecap="round" />
      <motion.circle cx="100" cy="28" r="7" fill="#F27D91" animate={{ opacity: [.4, 1, .4] }} transition={{ duration: 1.6, repeat: Infinity }} />
      <rect x="52" y="48" width="96" height="76" rx="26" fill="url(#robotBody)" stroke="#4482C0" strokeWidth="5" />
      <rect x="66" y="66" width="68" height="40" rx="16" fill="#1B2A44" />
      <motion.g animate={{ x: [0, 4, -4, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}>
        <circle cx="86" cy="86" r="7" fill="#73D8E6" /><circle cx="114" cy="86" r="7" fill="#73D8E6" />
      </motion.g>
      <path d="M90 98c6 4 14 4 20 0" stroke="#73D8E6" strokeWidth="3" strokeLinecap="round" fill="none" />
      <rect x="40" y="70" width="12" height="30" rx="6" fill="#8FC4F5" stroke="#4482C0" strokeWidth="4" />
      <rect x="148" y="70" width="12" height="30" rx="6" fill="#8FC4F5" stroke="#4482C0" strokeWidth="4" />
      <rect x="66" y="128" width="68" height="42" rx="16" fill="#8FC4F5" stroke="#4482C0" strokeWidth="5" />
      <circle cx="100" cy="149" r="10" fill="#EAF3FD" stroke="#4482C0" strokeWidth="3" />
      <motion.path d="M100 143v6l4 3" stroke="#4482C0" strokeWidth="3" strokeLinecap="round" animate={{ rotate: [0, 360] }} transition={{ duration: 4, repeat: Infinity, ease: 'linear' }} style={{ originX: '100px', originY: '149px' }} />
      <defs><linearGradient id="robotBody" x1="60" y1="50" x2="140" y2="120" gradientUnits="userSpaceOnUse"><stop stopColor="#A9D2F8" /><stop offset="1" stopColor="#67A9ED" /></linearGradient></defs>
    </Shell>
  )
}

export function WhaleListener({ size = 170, className = '' }: { size?: number; className?: string }) {
  return (
    <Shell label="Cá voi nghe nhạc" size={size} className={className}>
      <ellipse cx="100" cy="184" rx="60" ry="8" fill="#73D8E6" opacity=".2" />
      <path d="M156 118c14-8 26-6 32 4-8 10-22 12-34 6" fill="#5FC9DC" stroke="#3AA8BE" strokeWidth="4" strokeLinejoin="round" />
      <path d="M40 112c0-34 28-56 62-56 36 0 60 24 60 56 0 30-26 48-62 48-38 0-60-18-60-48Z" fill="url(#whaleBody)" stroke="#3AA8BE" strokeWidth="5" />
      <path d="M44 128c16 14 40 20 62 18" stroke="#BDEFF6" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M96 56c-2-12 4-20 14-22-2 8 2 12 8 14" stroke="#3AA8BE" strokeWidth="4" strokeLinecap="round" fill="none" />
      <motion.g animate={{ y: [0, -4, 0] }} transition={{ duration: 1.8, repeat: Infinity }}>
        <circle cx="118" cy="30" r="4" fill="#73D8E6" /><circle cx="128" cy="20" r="3" fill="#73D8E6" opacity=".7" /><circle cx="136" cy="12" r="2" fill="#73D8E6" opacity=".5" />
      </motion.g>
      <circle cx="72" cy="104" r="7" fill="#252944" /><circle cx="74" cy="101" r="2.5" fill="white" />
      <ellipse cx="58" cy="118" rx="8" ry="5" fill="#F49AB9" opacity=".55" />
      <path d="M84 120c6 5 14 5 20 0" stroke="#2C8FA3" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M52 84c-4-16 8-30 24-30M104 58c14-2 26 8 26 24" stroke="#252944" strokeWidth="6" strokeLinecap="round" fill="none" />
      <rect x="42" y="80" width="18" height="28" rx="9" fill="#F27D91" stroke="#D85F77" strokeWidth="3" />
      <rect x="122" y="78" width="18" height="28" rx="9" fill="#F27D91" stroke="#D85F77" strokeWidth="3" />
      <motion.g animate={{ opacity: [.4, 1, .4] }} transition={{ duration: 1.4, repeat: Infinity }}>
        <path d="M150 60c4-3 8-3 12 0M152 52c6-4 12-4 18 0" stroke="#FFBE69" strokeWidth="3" strokeLinecap="round" fill="none" />
      </motion.g>
      <defs><linearGradient id="whaleBody" x1="50" y1="60" x2="150" y2="150" gradientUnits="userSpaceOnUse"><stop stopColor="#9BE7F2" /><stop offset="1" stopColor="#5FC9DC" /></linearGradient></defs>
    </Shell>
  )
}

export function ChatBird({ size = 150, className = '' }: { size?: number; className?: string }) {
  return (
    <Shell label="Chim sẻ trò chuyện" size={size} className={className} delay={.08}>
      <ellipse cx="100" cy="184" rx="48" ry="8" fill="#F27D91" opacity=".16" />
      <path d="M142 128c16-2 26 6 28 18-12 6-26 2-34-8" fill="#F4A9B8" stroke="#D85F77" strokeWidth="4" strokeLinejoin="round" />
      <path d="M100 52c30 0 50 22 50 52 0 32-20 54-50 54s-50-22-50-54c0-30 20-52 50-52Z" fill="url(#birdBody)" stroke="#D85F77" strokeWidth="5" />
      <path d="M100 112c14 0 24 10 24 26 0 14-10 22-24 22s-24-8-24-22c0-16 10-26 24-26Z" fill="#FFF0F3" />
      <path d="M96 52c-2-10 2-16 10-18M104 52c4-8 10-10 16-8" stroke="#D85F77" strokeWidth="4" strokeLinecap="round" fill="none" />
      <circle cx="82" cy="94" r="7" fill="#252944" /><circle cx="84" cy="91" r="2.5" fill="white" />
      <circle cx="118" cy="94" r="7" fill="#252944" /><circle cx="120" cy="91" r="2.5" fill="white" />
      <path d="m100 102-10 8 10 7 10-7-10-8Z" fill="#FFBE69" stroke="#D99A45" strokeWidth="3" strokeLinejoin="round" />
      <ellipse cx="68" cy="106" rx="8" ry="5" fill="#F49AB9" opacity=".6" /><ellipse cx="132" cy="106" rx="8" ry="5" fill="#F49AB9" opacity=".6" />
      <path d="M52 116c-12 2-18 12-14 22 10 0 20-6 24-14" fill="#F4A9B8" stroke="#D85F77" strokeWidth="4" strokeLinejoin="round" />
      <motion.g animate={{ y: [0, -5, 0], opacity: [.6, 1, .6] }} transition={{ duration: 2.2, repeat: Infinity }}>
        <path d="M140 40h34a10 10 0 0 1 10 10v14a10 10 0 0 1-10 10h-18l-10 10v-10h-6a10 10 0 0 1-10-10V50a10 10 0 0 1 10-10Z" fill="white" stroke="#D85F77" strokeWidth="3" />
        <circle cx="152" cy="57" r="3" fill="#F27D91" /><circle cx="162" cy="57" r="3" fill="#F27D91" /><circle cx="172" cy="57" r="3" fill="#F27D91" />
      </motion.g>
      <defs><linearGradient id="birdBody" x1="60" y1="56" x2="140" y2="150" gradientUnits="userSpaceOnUse"><stop stopColor="#F8B9C5" /><stop offset="1" stopColor="#F27D91" /></linearGradient></defs>
    </Shell>
  )
}

const cast: Record<CharacterName, ComponentType<{ size?: number; className?: string }>> = {
  owl: OwlProfessor, star: StarBuddy, cat: CatScholar, robot: RobotHelper, whale: WhaleListener, bird: ChatBird,
}

export function Character({ name, size = 150, className = '' }: { name: CharacterName; size?: number; className?: string }) {
  const Component = cast[name]
  return <Component size={size} className={className} />
}