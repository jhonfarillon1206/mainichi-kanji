// Reading practice stories.
//
// Paste format:
//   title: 東京の毎日 ① はじめての友だち
//   level: N5
//
//   [story]
//   わたしの名前{なまえ}はマリアです。…        ← kanji{reading} = furigana
//
//   [questions]
//   Q: マリアさんは何時{なんじ}の電車{でんしゃ}で…？
//   A: 八時{はちじ}の電車{でんしゃ}です。
//
//   [translation]
//   My name is Maria. …

export const EXAMPLE = `title: 東京の毎日 ① はじめての友だち
level: N5

[story]
わたしの名前{なまえ}はマリアです。フィリピンから来{き}た学生{がくせい}です。

[questions]
Q: マリアさんはどこから来{き}ましたか。
A: フィリピンから来{き}ました。

[translation]
My name is Maria. I'm a student from the Philippines.`

export function parseStory(raw) {
  const out = { title: '', level: '', body: '', questions: [], translation: '' }
  let section = null
  const lines = { story: [], questions: [], translation: [] }

  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    const header = line.trim().match(/^\[(story|questions|translation)\]$/i)
    if (header) { section = header[1].toLowerCase(); continue }
    if (!section) {
      const m = line.match(/^\s*(title|level)\s*[:：]\s*(.+)$/i)
      if (m) out[m[1].toLowerCase()] = m[2].trim()
      continue
    }
    lines[section].push(line)
  }

  out.body = lines.story.join('\n').trim()
  out.translation = lines.translation.join('\n').trim()
  let q = null
  for (const line of lines.questions) {
    const m = line.trim().match(/^([QA])\s*[:：.]\s*(.*)$/i)
    if (!m) continue
    if (m[1].toUpperCase() === 'Q') { q = { q: m[2], a: '' }; out.questions.push(q) }
    else if (q) q.a = m[2]
  }

  if (!out.body) throw new Error('Add the story text under a [story] line.')
  if (!out.title) out.title = out.body.replace(/\{[^}]*\}/g, '').slice(0, 20) + '…'
  out.level = (out.level || 'Other').toUpperCase()
  return out
}

// Splits text into plain runs and furigana words: 名前{なまえ} → { text: '名前', reading: 'なまえ' }.
export function tokens(text) {
  const out = []
  const re = /([一-鿿㐀-䶿々〆ヶ]+)\{([^}]+)\}/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    out.push({ text: m[1], reading: m[2] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

// Text for read-aloud: kanji replaced by their readings, so the voice never guesses.
export function spoken(text) {
  return tokens(text).map(t => t.reading || t.text).join('')
}

// Story text split into paragraphs (blank lines) and lines.
export function paragraphs(body) {
  return body.split(/\n\s*\n/).map(p => p.split('\n').map(l => l.trim()).filter(Boolean)).filter(p => p.length)
}
