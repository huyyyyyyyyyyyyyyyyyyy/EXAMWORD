import { motion } from 'framer-motion'

type Mood = 'happy' | 'thinking' | 'studying' | 'celebrating' | 'encouraging' | 'surprised'

export function Mascot({ mood = 'happy', className = '', size = 220 }: { mood?: Mood; className?: string; size?: number }) {
  const celebrating = mood === 'celebrating'
  const surprised = mood === 'surprised'
  const thinking = mood === 'thinking'
  return (
    <motion.svg
      width={size} height={size * .9} viewBox="0 0 260 234" fill="none"
      className={className} role="img" aria-label={`Orbi, linh vật EXAM WORLD đang ${mood}`}
      initial={{ opacity: 0, scale: .92 }} animate={{ opacity: 1, scale: 1 }}
    >
      <motion.g animate={{ y: [0, -5, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
        <ellipse cx="131" cy="203" rx="75" ry="13" fill="#8171E8" opacity=".09" />
        <path d="M55 98C30 79 20 98 35 110c10 8 25 6 35-2M199 102c28-17 36 3 20 14-11 7-24 2-31-5" stroke="#7564DA" strokeWidth="11" strokeLinecap="round" />
        <path d="M81 175c-8 14-4 25 10 25 9 0 14-7 15-18M163 177c2 15 8 22 19 20 13-3 12-15 4-25" fill="#8171E8" stroke="#6B59CA" strokeWidth="5" strokeLinecap="round" />
        <path d="M72 76c16-28 93-35 119 4 20 30 17 85-9 107-23 20-79 19-105-2-26-22-26-76-5-109Z" fill="url(#body)" stroke="#6B59CA" strokeWidth="5" />
        <path d="M88 68c-3-22 5-35 17-40M165 62c8-17 7-29-1-39" stroke="#6B59CA" strokeWidth="5" strokeLinecap="round" />
        <circle cx="106" cy="24" r="8" fill="#73D8E6" stroke="#6B59CA" strokeWidth="4" />
        <path d="m163 16 2.8 6.2 6.8 1-4.9 4.7 1.2 6.8-6-3.2-6 3.2 1.1-6.8-4.8-4.7 6.8-1 2.9-6.2Z" fill="#FFBE69" stroke="#D99A45" strokeWidth="2" />
        <ellipse cx="102" cy="112" rx="11" ry={surprised ? 13 : 15} fill="#252944" />
        <ellipse cx="159" cy="112" rx="11" ry={surprised ? 13 : 15} fill="#252944" />
        <circle cx="106" cy="106" r="3.5" fill="white" /><circle cx="163" cy="106" r="3.5" fill="white" />
        {thinking && <path d="M88 91c7-5 15-5 22-1M151 88c7-3 14-2 19 3" stroke="#5A47B8" strokeWidth="4" strokeLinecap="round" />}
        <ellipse cx="82" cy="135" rx="13" ry="7" fill="#F49AB9" opacity=".55" /><ellipse cx="179" cy="135" rx="13" ry="7" fill="#F49AB9" opacity=".55" />
        {surprised ? <ellipse cx="131" cy="142" rx="9" ry="12" fill="#493A91" /> : <path d={thinking ? 'M121 143c7-3 14-3 20 0' : 'M113 137c8 19 29 20 38 0-11 5-27 5-38 0Z'} fill={thinking ? 'none' : '#493A91'} stroke="#493A91" strokeWidth="4" strokeLinecap="round" />}
        {!thinking && !surprised && <path d="M123 151c5 3 11 3 16 0" stroke="#F49AB9" strokeWidth="4" strokeLinecap="round" />}
        <path d="M59 93c-20 0-35-7-42-20 18-8 39-5 52 8M196 84c18-9 34-8 46 2-10 15-26 20-43 17" fill="#AFA2F4" stroke="#6B59CA" strokeWidth="4" strokeLinejoin="round" />
        {mood === 'studying' && <g><path d="M62 154c25-10 48-6 69 10 20-16 44-20 69-10v45c-25-9-48-5-69 10-21-15-44-19-69-10v-45Z" fill="white" stroke="#6B59CA" strokeWidth="4" /><path d="M131 164v45" stroke="#6B59CA" strokeWidth="4" /><path d="M77 169h35M77 179h29M151 169h32M151 179h25" stroke="#C8BFF8" strokeWidth="3" strokeLinecap="round" /></g>}
        {celebrating && <g><path d="m40 37 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2 5-10Z" fill="#FFBE69" /><path d="m218 36 3 7 8 1-6 6 2 8-7-4-7 4 1-8-5-6 8-1 3-7Z" fill="#73D8E6" /><path d="m26 133 4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1 4-8Z" fill="#F27D91" /></g>}
      </motion.g>
      <defs><linearGradient id="body" x1="83" y1="63" x2="174" y2="196" gradientUnits="userSpaceOnUse"><stop stopColor="#A99AF3" /><stop offset="1" stopColor="#8171E8" /></linearGradient></defs>
    </motion.svg>
  )
}
