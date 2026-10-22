import Dexie, { liveQuery } from 'dexie'
import { ref, onUnmounted } from 'vue'
import { createEmptyCard } from 'ts-fsrs'

export const db = new Dexie('kanji-deck')

db.version(1).stores({
  decks: '++id, name',
  cards: '++id, deckId, due, state',
  logs: '++id, cardId, deckId, dayKey, reviewedAt',
  settings: 'key'
})

// v2: reading practice stories (pasted in the Reading tab).
db.version(2).stores({
  stories: '++id, level'
})

export const DEFAULT_SETTINGS = {
  dayStartHour: 4,       // a "day" rolls over at 4 AM, like Anki
  reviewCap: 200,        // max reviews per session
  leechThreshold: 4,     // lapses before a card is flagged as a leech
  masteredDays: 21       // review interval (days) that counts as mastered
}

export async function getSettings() {
  const row = await db.settings.get('main')
  return { ...DEFAULT_SETTINGS, ...(row?.value || {}) }
}

export async function saveSettings(value) {
  await db.settings.put({ key: 'main', value: { ...value } })
}

// Custom background picture, stored as an image file on this device only.
export async function getBackground() {
  return (await db.settings.get('background'))?.value || null
}

export async function setBackground(blob) {
  await db.settings.put({ key: 'background', value: blob })
}

export async function clearBackground() {
  await db.settings.delete('background')
}

// Built-in theme: 'sora' (default), 'sakura', 'matcha' or 'dusk'.
export const THEMES = [
  { key: 'sora', name: 'Sky', colors: ['#c9e0f7', '#f2f6fb'] },
  { key: 'sakura', name: 'Sakura', colors: ['#f8cdd8', '#fff8f6'] },
  { key: 'matcha', name: 'Matcha', colors: ['#cbe2c4', '#f8faf3'] },
  { key: 'dusk', name: 'Dusk', colors: ['#a9b4e0', '#fbe6d8'] }
]

export async function getTheme() {
  return (await db.settings.get('theme'))?.value || 'sora'
}

export async function setTheme(key) {
  await db.settings.put({ key: 'theme', value: key })
}

// How much the picture is faded (0 = full picture, 0.85 = almost hidden). Default 0.5.
export async function getBackgroundFade() {
  const row = await db.settings.get('backgroundFade')
  return typeof row?.value === 'number' ? row.value : 0.5
}

export async function setBackgroundFade(value) {
  await db.settings.put({ key: 'backgroundFade', value })
}

// Reactive Dexie query: re-runs whenever the tables it reads change.
export function useLive(querier, initial) {
  const value = ref(initial)
  const sub = liveQuery(querier).subscribe({
    next: v => { value.value = v },
    error: e => console.error(e)
  })
  onUnmounted(() => sub.unsubscribe())
  return value
}

export function newCard(deckId, fields) {
  return {
    deckId,
    front: fields.front.trim(),
    reading: (fields.reading || '').trim(),
    meaning: (fields.meaning || '').trim(),
    example: (fields.example || '').trim(),
    notes: (fields.notes || '').trim(),
    suspended: false,
    createdAt: new Date(),
    ...createEmptyCard(new Date())
  }
}

// Parses "front | reading | meaning | example" lines (tabs also work).
export function parseImport(text) {
  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      const [front, reading, meaning, example] = l.split(/\s*[|\t]\s*/)
      return { front, reading, meaning, example }
    })
    .filter(r => r.front)
}

const SAMPLE = [
  ['日', 'にち、ひ', 'day, sun', '日曜日（にちようび）Sunday'],
  ['月', 'げつ、つき', 'month, moon', '月曜日（げつようび）Monday'],
  ['火', 'か、ひ', 'fire', '火曜日（かようび）Tuesday'],
  ['水', 'すい、みず', 'water', '水を飲む（みずをのむ）drink water'],
  ['木', 'もく、き', 'tree, wood', '木曜日（もくようび）Thursday'],
  ['金', 'きん、かね', 'gold, money', 'お金（おかね）money'],
  ['土', 'ど、つち', 'earth, soil', '土曜日（どようび）Saturday'],
  ['人', 'じん、ひと', 'person', '日本人（にほんじん）Japanese person'],
  ['山', 'さん、やま', 'mountain', '富士山（ふじさん）Mt. Fuji'],
  ['川', 'かわ', 'river', '川で泳ぐ（かわでおよぐ）swim in a river']
]

export async function addSampleDeck() {
  const id = await db.decks.add({ name: 'Sample: N5 basics', newPerDay: 10, createdAt: new Date() })
  await db.cards.bulkAdd(SAMPLE.map(([front, reading, meaning, example]) => newCard(id, { front, reading, meaning, example })))
  return id
}

export async function exportAll() {
  const [decks, cards, logs, settings, stories] = await Promise.all([
    db.decks.toArray(), db.cards.toArray(), db.logs.toArray(),
    db.settings.where('key').notEqual('background').toArray(), // the picture stays on this device
    db.stories.toArray()
  ])
  return { app: 'kanji-deck', version: 2, exportedAt: new Date(), decks, cards, logs, settings, stories }
}

export async function importAll(data) {
  if (data?.app !== 'kanji-deck') throw new Error('Not a Kanji Deck backup file.')
  const toDate = v => (v ? new Date(v) : v)
  const cards = data.cards.map(c => ({
    ...c, due: toDate(c.due), last_review: toDate(c.last_review), createdAt: toDate(c.createdAt)
  }))
  const logs = data.logs.map(l => ({ ...l, reviewedAt: toDate(l.reviewedAt) }))
  await db.transaction('rw', db.decks, db.cards, db.logs, db.settings, db.stories, async () => {
    await Promise.all([db.decks.clear(), db.cards.clear(), db.logs.clear(), db.settings.where('key').notEqual('background').delete()])
    // Older backups have no stories; keep the current ones in that case.
    if (Array.isArray(data.stories)) {
      await db.stories.clear()
      await db.stories.bulkAdd(data.stories.map(s => ({ ...s, createdAt: toDate(s.createdAt), readAt: toDate(s.readAt) })))
    }
    await db.decks.bulkAdd(data.decks)
    await db.cards.bulkAdd(cards)
    await db.logs.bulkAdd(logs)
    await db.settings.bulkPut(data.settings.filter(r => r.key !== 'background'))
  })
}
