import { db, newCard } from './db'

const DECK_FILE = 'mainichi-kanji-deck'

// Sends one deck as a file. Only the cards are shared, not your study progress.
// Returns 'shared', 'downloaded' or 'cancelled'.
export async function shareDeck(deckId) {
  const deck = await db.decks.get(deckId)
  const cards = (await db.cards.where('deckId').equals(deckId).toArray()).sort((a, b) => a.id - b.id)
  const data = {
    app: DECK_FILE,
    version: 1,
    deck: { name: deck.name, symbol: deck.symbol || '', newPerDay: deck.newPerDay ?? 10 },
    cards: cards.map(({ front, reading, meaning, example, notes }) => ({ front, reading, meaning, example, notes }))
  }
  const safeName = deck.name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'deck'
  const file = new File([JSON.stringify(data)], `${safeName} (deck).json`, { type: 'application/json' })

  // On phones: open the share sheet (Messenger, Drive, etc.).
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: deck.name })
      return 'shared'
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled'
      // Some apps refuse the file type; fall back to a download.
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  return 'downloaded'
}

// Adds a shared deck as a new deck. Never touches your existing decks.
// Returns { id, name, count }.
export async function importDeck(file) {
  let data
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error("This file isn't a deck file.")
  }
  if (data?.app === 'kanji-deck') {
    throw new Error('This is a full backup. Use Settings → Restore from backup instead.')
  }
  if (data?.app !== DECK_FILE || !Array.isArray(data.cards)) {
    throw new Error("This file isn't a deck file.")
  }

  // Avoid two decks with the same name: "N5", "N5 (2)", "N5 (3)"…
  const names = new Set((await db.decks.toArray()).map(d => d.name))
  const base = (data.deck?.name || 'Shared deck').trim()
  let name = base
  for (let n = 2; names.has(name); n++) name = `${base} (${n})`

  const cards = data.cards.filter(c => c?.front)
  let id
  await db.transaction('rw', db.decks, db.cards, async () => {
    id = await db.decks.add({
      name,
      symbol: data.deck?.symbol || '',
      newPerDay: Number(data.deck?.newPerDay) || 10,
      createdAt: new Date()
    })
    await db.cards.bulkAdd(cards.map(c => newCard(id, c)))
  })
  return { id, name, count: cards.length }
}
