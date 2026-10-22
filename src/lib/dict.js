// Word lookup for Reading: your decks first, then a built-in dictionary of ~18,000 common words.
// Dictionary data: JMdict (EDRDG), CC BY-SA 4.0 — credited in Settings.

let dictPromise = null
export function loadDict() {
  dictPromise ||= fetch(import.meta.env.BASE_URL + 'dict.json')
    .then(r => (r.ok ? r.json() : {}))
    .catch(() => { dictPromise = null; return {} })
  return dictPromise
}

// Deck cards → Map(front → [{ reading, meaning, front }]).
export function deckIndex(cards) {
  const m = new Map()
  for (const c of cards || []) {
    const f = (c.front || '').trim()
    if (!f || !c.meaning) continue
    if (!m.has(f)) m.set(f, [])
    m.get(f).push({ front: f, reading: c.reading || '', meaning: c.meaning, fromDeck: true })
  }
  return m
}

// Conjugated ending → possible dictionary endings (書き/書か/書け/書い → 書く, 待っ → 待つ, 読ん → 読む…)
const ENDS = {
  い: ['う', 'く', 'ぐ'], き: ['く'], ぎ: ['ぐ'], し: ['す'], ち: ['つ'], に: ['ぬ'], び: ['ぶ'], み: ['む'], り: ['る'],
  わ: ['う'], か: ['く'], が: ['ぐ'], さ: ['す'], た: ['つ'], な: ['ぬ'], ば: ['ぶ'], ま: ['む'], ら: ['る'],
  け: ['く'], げ: ['ぐ'], せ: ['す'], て: ['つ'], ね: ['ぬ'], べ: ['ぶ'], め: ['む'], れ: ['る'],
  っ: ['う', 'つ', 'る', 'く'], ん: ['む', 'ぶ', 'ぬ']
}
const KANA = /^[ぁ-ゖー]+$/
const toHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))

// Does a reading like "いく、ゆく" fit the furigana shown in the story (e.g. "い")?
function fits(readings, ruby) {
  if (!ruby) return true
  const list = readings.split(/[、,;\s/]+/).map(toHira).filter(Boolean)
  if (!list.length || !list.some(r => KANA.test(r))) return true // romaji or empty: can't check
  return list.some(r => r.startsWith(ruby))
}

function find(word, ruby, deck, dict) {
  for (const e of deck.get(word) || []) if (fits(e.reading, ruby)) return e
  for (const [reading, meaning] of dict[word] || []) if (fits(reading, ruby)) return { front: word, reading, meaning }
  return null
}

// Numbers + counters: 八時 → 8 o'clock, 三百円 → 300 yen.
const DIGITS = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
const UNITS = { 十: 10, 百: 100, 千: 1000 }
function toNumber(k) {
  let total = 0, part = 0, digit = 0
  for (const ch of k) {
    if (ch in DIGITS) digit = DIGITS[ch]
    else if (ch in UNITS) { part += (digit || 1) * UNITS[ch]; digit = 0 }
    else if (ch === '万') { total += (part + digit || 1) * 10000; part = digit = 0 }
  }
  return total + part + digit
}
const COUNTERS = {
  時: n => `${n} o'clock`, 時半: n => `${n}:30`, 時間: n => `${n} hour${n > 1 ? 's' : ''}`, 時間半: n => `${n}.5 hours`,
  分: n => `${n} minute${n > 1 ? 's' : ''}`, 円: n => `${n.toLocaleString()} yen`, 人: n => `${n} people`,
  本: n => `${n} (long things: bottles, pens…)`, 年: n => `${n} year${n > 1 ? 's' : ''}`, 年半: n => `${n}.5 years`,
  年生: n => `${n}${['st', 'nd', 'rd'][n - 1] || 'th'}-year student`, 年目: n => `year ${n}`, 年前: n => `${n} year${n > 1 ? 's' : ''} ago`,
  日後: n => `${n} days later`, 回目: n => `the ${n}${['st', 'nd', 'rd'][n - 1] || 'th'} time`, 月: n => `month ${n}`,
  さい: n => `${n} years old`, つ: n => `${n} (things)`
}
function numberWord(word, ruby, after) {
  const m = word.match(/^([〇一二三四五六七八九十百千万]+)(.*)$/)
  if (!m) return null
  const counter = m[2] || (COUNTERS[after.slice(0, 2)] ? after.slice(0, 2) : after.slice(0, 1))
  const fn = COUNTERS[counter]
  return fn ? { front: word, reading: ruby, meaning: fn(toNumber(m[1])) } : null
}

// word = kanji run (食), ruby = its furigana (た), after = kana that follows (べました).
// Finds the longest word that fits: 食べる, 大きい, 行く, 学生…
export function lookup(word, ruby, after, deck, dict) {
  const text = word + after.slice(0, 6)
  for (let L = text.length; L >= word.length; L--) {
    const p = text.slice(0, L)
    const last = p.at(-1)
    const cands = [p + 'い']
    cands.push(p + 'る')
    if (ENDS[last] && L > word.length) for (const e of ENDS[last]) cands.push(p.slice(0, -1) + e)
    cands.push(p)
    if (word === '来' && L === 1) cands.unshift('来る')
    for (const c of cands) {
      const hit = find(c, c === '来る' ? '' : ruby, deck, dict)
      if (hit) return hit
    }
  }
  return numberWord(word, ruby, after)
}
