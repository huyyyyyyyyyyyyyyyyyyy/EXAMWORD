// Lightweight Web Audio synth for UI feedback. No audio assets required.
// Every sound is tied to a visible action; muted state is honoured globally.
export type SoundName = 'tap' | 'toggle' | 'success' | 'error' | 'complete' | 'start' | 'flag' | 'save' | 'tick' | 'go'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = false

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) {
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function setMuted(value: boolean) {
  muted = value
  if (master && ctx) master.gain.setTargetAtTime(value ? 0 : 0.5, ctx.currentTime, 0.01)
}
export function isMuted() { return muted }

interface Tone { freq: number; start: number; dur: number; type?: OscillatorType; gain?: number; slideTo?: number }

function render(tones: Tone[]) {
  const ac = ensure()
  if (!ac || !master || muted) return
  const now = ac.currentTime
  for (const t of tones) {
    const osc = ac.createOscillator()
    const g = ac.createGain()
    osc.type = t.type ?? 'sine'
    const t0 = now + t.start
    osc.frequency.setValueAtTime(t.freq, t0)
    if (t.slideTo) osc.frequency.exponentialRampToValueAtTime(t.slideTo, t0 + t.dur)
    const peak = t.gain ?? 0.22
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t.dur)
    osc.connect(g)
    g.connect(master)
    osc.start(t0)
    osc.stop(t0 + t.dur + 0.03)
  }
}

const recipes: Record<SoundName, Tone[]> = {
  tap: [{ freq: 520, start: 0, dur: 0.09, type: 'sine', gain: 0.16, slideTo: 660 }],
  toggle: [{ freq: 440, start: 0, dur: 0.06, type: 'triangle', gain: 0.14 }, { freq: 660, start: 0.05, dur: 0.07, type: 'triangle', gain: 0.12 }],
  save: [{ freq: 700, start: 0, dur: 0.05, type: 'sine', gain: 0.08 }],
  flag: [{ freq: 880, start: 0, dur: 0.08, type: 'triangle', gain: 0.14, slideTo: 1040 }],
  tick: [{ freq: 620, start: 0, dur: 0.1, type: 'triangle', gain: 0.2, slideTo: 540 }],
  go: [{ freq: 784, start: 0, dur: 0.14, type: 'sine', gain: 0.22 }, { freq: 1047, start: 0.1, dur: 0.22, type: 'sine', gain: 0.22 }],
  start: [{ freq: 392, start: 0, dur: 0.12, type: 'sine', gain: 0.18 }, { freq: 523, start: 0.1, dur: 0.14, type: 'sine', gain: 0.18 }, { freq: 659, start: 0.2, dur: 0.18, type: 'sine', gain: 0.18 }],
  success: [{ freq: 659, start: 0, dur: 0.13, type: 'sine', gain: 0.2 }, { freq: 880, start: 0.11, dur: 0.2, type: 'sine', gain: 0.2 }],
  error: [{ freq: 220, start: 0, dur: 0.18, type: 'sawtooth', gain: 0.12, slideTo: 160 }, { freq: 165, start: 0.14, dur: 0.2, type: 'sawtooth', gain: 0.1 }],
  complete: [
    { freq: 523, start: 0, dur: 0.16, type: 'sine', gain: 0.2 },
    { freq: 659, start: 0.13, dur: 0.16, type: 'sine', gain: 0.2 },
    { freq: 784, start: 0.26, dur: 0.16, type: 'sine', gain: 0.2 },
    { freq: 1047, start: 0.39, dur: 0.34, type: 'sine', gain: 0.22 },
    { freq: 1319, start: 0.5, dur: 0.4, type: 'triangle', gain: 0.1 },
  ],
}

export function playSound(name: SoundName) {
  try { render(recipes[name]) } catch { /* audio is best-effort */ }
}