import { db, getSettings } from './db'
import { cardStatus, dayKey, State } from './srs'

// Study streak: how many days in a row you've studied, counting back from today.
// If you haven't studied yet today, yesterday still keeps the streak alive.
export async function streakInfo() {
  const s = await getSettings()
  const now = new Date()
  const studied = new Set(await db.logs.orderBy('dayKey').uniqueKeys())
  const key = daysAgo => dayKey(new Date(now.getTime() - daysAgo * 86400_000), s.dayStartHour)

  const studiedToday = studied.has(key(0))
  let streak = 0
  for (let i = studiedToday ? 0 : 1; studied.has(key(i)); i++) streak++
  return { streak, studiedToday }
}

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
