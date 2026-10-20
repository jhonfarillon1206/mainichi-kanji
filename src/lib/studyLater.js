import { db, newCard } from './db'

// The "Study later" deck: copies of cards you want to review again.
// It's marked with isLater, so renaming it or moving it to a folder still works.

export async function getLaterDeck() {
  return (await db.decks.filter(d => d.isLater).first()) || null
}

async function ensureLaterDeck() {
  const existing = await getLaterDeck()
  if (existing) return existing.id
  return db.decks.add({ name: 'Study later', symbol: '復', newPerDay: 50, isLater: true, createdAt: new Date() })
}

// Fronts already in the Study later deck, used to show the 🔖 as filled.
export async function laterInfo() {
  const deck = await getLaterDeck()
  if (!deck) return { id: null, fronts: new Set() }
  const cards = await db.cards.where('deckId').equals(deck.id).toArray()
  return { id: deck.id, fronts: new Set(cards.map(c => c.front)) }
}

// Copies a card into Study later, or removes the copy if it's already there.
// The original card is never changed. Returns true if the card is now saved.
export async function toggleLater(card) {
  const id = await ensureLaterDeck()
  const copy = await db.cards.where('deckId').equals(id).filter(c => c.front === card.front).first()
  if (copy) {
    await db.transaction('rw', db.cards, db.logs, async () => {
      await db.logs.where('cardId').equals(copy.id).delete()
      await db.cards.delete(copy.id)
    })
    return false
  }
  await db.cards.add(newCard(id, card))
  return true
}

// Copies several cards at once (e.g. quiz mistakes). Skips ones already saved.
// Returns how many were added.
export async function addManyToLater(cards) {
  const id = await ensureLaterDeck()
  const have = new Set((await db.cards.where('deckId').equals(id).toArray()).map(c => c.front))
  const fresh = []
  for (const c of cards) {
    if (!have.has(c.front)) { have.add(c.front); fresh.push(newCard(id, c)) }
  }
  if (fresh.length) await db.cards.bulkAdd(fresh)
  return { added: fresh.length, deckId: id }
}
