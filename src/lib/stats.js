import { db, getSettings } from './db'
import { cardStatus, dayKey, State } from './srs'

// One row per deck for the home screen.
export async function deckSummaries() {
  const s = await getSettings()
  const now = new Date()
  const today = dayKey(now, s.dayStartHour)
  const [decks, cards, todaysLogs] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.logs.where('dayKey').equals(today).toArray()
  ])

  return decks
    .map(d => {
      const deckCards = cards.filter(c => c.deckId === d.id).sort((a, b) => a.id - b.id)
      const counts = { new: 0, learning: 0, due: 0, mastered: 0, suspended: 0 }
      for (const c of deckCards) counts[cardStatus(c, s, now)]++
      const newDone = todaysLogs.filter(l => l.deckId === d.id && l.stateBefore === State.New).length
      const newLeft = Math.max(0, Math.min((d.newPerDay ?? 10) - newDone, counts.new))
      return {
        ...d,
        symbol: d.symbol || deckCards[0]?.front?.[0] || '字',
        total: deckCards.length,
        mastered: counts.mastered,
        due: counts.due,
        newLeft,
        waiting: counts.due + newLeft
      }
    })
    .sort((a, b) => a.id - b.id)
}
