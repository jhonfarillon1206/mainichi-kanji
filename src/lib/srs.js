import { fsrs, generatorParameters, createEmptyCard, Rating, State } from 'ts-fsrs'
import { db, getSettings } from './db'

export { Rating, State }

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }))

export const GRADES = [
  { rating: Rating.Again, label: 'Again', hint: 'Forgot', key: '1', cls: 'bg-shu shadow-[0_3px_0_#8f2a1d]' },
  { rating: Rating.Hard, label: 'Hard', hint: 'Struggled', key: '2', cls: 'bg-yamabuki shadow-[0_3px_0_#7d500a]' },
  { rating: Rating.Good, label: 'Good', hint: 'Remembered', key: '3', cls: 'bg-matcha shadow-[0_3px_0_#33522c]' },
  { rating: Rating.Easy, label: 'Easy', hint: 'Too easy', key: '4', cls: 'bg-ink shadow-[0_3px_0_#18224a]' }
]

// Calendar day a moment belongs to, with the day rolling over at dayStartHour.
export function dayKey(date, dayStartHour) {
  const d = new Date(date.getTime() - dayStartHour * 3600_000)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// End of the current study day (next rollover).
export function endOfDay(now, dayStartHour) {
  const d = new Date(now)
  d.setHours(dayStartHour, 0, 0, 0)
  if (d <= now) d.setDate(d.getDate() + 1)
  return d
}

export function cardStatus(card, s, now = new Date()) {
  if (card.suspended) return 'suspended'
  if (card.state === State.New) return 'new'
  if (card.state === State.Review && card.scheduled_days >= s.masteredDays) {
    return card.due <= now ? 'due' : 'mastered'
  }
  return card.due <= now ? 'due' : 'learning'
}

export const isLeech = (card, s) => card.lapses >= s.leechThreshold

// Interval preview shown on each grade button, e.g. "10m", "3d", "2mo".
export function previews(card, now = new Date()) {
  const r = scheduler.repeat(card, now)
  const out = {}
  for (const g of GRADES) out[g.rating] = formatInterval(r[g.rating].card.due - now)
  return out
}

function formatInterval(ms) {
  const min = Math.max(1, Math.round(ms / 60000))
  if (min < 60) return `${min}m`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  if (d < 31) return `${d}d`
  const mo = d / 30
  if (mo < 12) return `${mo.toFixed(mo < 3 ? 1 : 0)}mo`
  return `${(d / 365).toFixed(1)}y`
}

// Builds a session queue. mode: 'mixed' | 'review' | 'new'.
// deckId null = all decks.
export async function buildQueue(deckId, mode) {
  const s = await getSettings()
  const now = new Date()
  const today = dayKey(now, s.dayStartHour)

  const cards = deckId
    ? await db.cards.where('deckId').equals(deckId).toArray()
    : await db.cards.toArray()
  const decks = await db.decks.toArray()
  const deckMap = Object.fromEntries(decks.map(d => [d.id, d]))

  const active = cards.filter(c => !c.suspended)

  // All cards: every card in the deck, shuffled, with no daily limits.
  if (mode === 'all') {
    const all = [...active]
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[all[i], all[j]] = [all[j], all[i]]
    }
    return all
  }

  const due = active
    .filter(c => c.state !== State.New && c.due <= now)
    .sort((a, b) => a.due - b.due)
    .slice(0, s.reviewCap)

  // New cards: respect each deck's daily limit minus what was introduced today.
  const todaysLogs = await db.logs.where('dayKey').equals(today).toArray()
  const introduced = {}
  for (const l of todaysLogs) {
    if (l.stateBefore === State.New) introduced[l.deckId] = (introduced[l.deckId] || 0) + 1
  }
  const fresh = []
  const byDeck = {}
  for (const c of active.filter(c => c.state === State.New).sort((a, b) => a.id - b.id)) {
    const limit = (deckMap[c.deckId]?.newPerDay ?? 10) - (introduced[c.deckId] || 0)
    byDeck[c.deckId] = byDeck[c.deckId] || 0
    if (byDeck[c.deckId] < limit) {
      fresh.push(c)
      byDeck[c.deckId]++
    }
  }

  if (mode === 'review') return due
  if (mode === 'new') return fresh
  // Mixed: spread new cards through the reviews.
  const out = []
  const step = fresh.length ? Math.max(1, Math.floor(due.length / fresh.length)) : 1
  let di = 0, fi = 0
  while (di < due.length || fi < fresh.length) {
    for (let k = 0; k < step && di < due.length; k++) out.push(due[di++])
    if (fi < fresh.length) out.push(fresh[fi++])
  }
  return out
}

// Grades a card, saves it, writes the review log. Returns { updated, logId } (logId is used for undo).
export async function gradeCard(card, rating) {
  const s = await getSettings()
  const now = new Date()
  const { card: next } = scheduler.next(card, now, rating)
  const updated = { ...card, ...next }
  let logId
  await db.transaction('rw', db.cards, db.logs, async () => {
    await db.cards.put(updated)
    logId = await db.logs.add({
      cardId: card.id,
      deckId: card.deckId,
      rating,
      stateBefore: card.state,
      reviewedAt: now,
      dayKey: dayKey(now, s.dayStartHour)
    })
  })
  return { updated, logId }
}

export async function undoGrade(previous, logId) {
  await db.transaction('rw', db.cards, db.logs, async () => {
    await db.cards.put(previous)
    await db.logs.delete(logId)
  })
}

export function resetCard(card) {
  return { ...card, ...createEmptyCard(new Date()) }
}
