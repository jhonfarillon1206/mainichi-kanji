<script setup>
import { ref, computed, onMounted, onUnmounted, toRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db } from '../lib/db'
import { gradeCard, shuffle, Rating } from '../lib/srs'

const route = useRoute()
const router = useRouter()
const deckId = Number(route.params.id)

// Settings come from the URL so "New quiz" / "Retry missed" are just links.
const field = route.query.ask === 'reading' ? 'reading' : 'meaning' // what you pick: meaning or reading
const length = route.query.n === 'all' ? 'all' : Number(route.query.n) || 10
const onlyIds = route.query.ids ? route.query.ids.split('.').map(Number) : null // retry-missed round

const deck = ref(null)
const pool = ref([]) // all usable cards in the deck
const questions = ref([])
const index = ref(0)
const picked = ref(null) // option chosen for the current question
const results = ref([]) // { card, correct, chosen }
const loaded = ref(false)

const usable = c => !c.suspended && (c[field] || '').trim()
const fieldCounts = ref({ meaning: 0, reading: 0 })

onMounted(async () => {
  deck.value = await db.decks.get(deckId)
  const cards = await db.cards.where('deckId').equals(deckId).toArray()
  const distinct = f => new Set(cards.filter(c => !c.suspended && (c[f] || '').trim()).map(c => c[f].trim())).size
  fieldCounts.value = { meaning: distinct('meaning'), reading: distinct('reading') }

  pool.value = cards.filter(usable)
  let chosen = onlyIds ? pool.value.filter(c => onlyIds.includes(c.id)) : shuffle(pool.value)
  if (!onlyIds && length !== 'all') chosen = chosen.slice(0, length)
  questions.value = shuffle(chosen).map(card => ({ card, options: makeOptions(card) }))
  loaded.value = true
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => window.removeEventListener('keydown', onKey))

// The right answer plus 3 different wrong answers from the same deck.
function makeOptions(card) {
  const answer = card[field].trim()
  const others = [...new Set(shuffle(pool.value).map(c => c[field].trim()))].filter(v => v !== answer)
  return shuffle([answer, ...others.slice(0, 3)])
}

const current = computed(() => questions.value[index.value])
const answer = computed(() => current.value?.card[field].trim())
const finished = computed(() => loaded.value && index.value >= questions.value.length)
const score = computed(() => results.value.filter(r => r.correct).length)
const missed = computed(() => results.value.filter(r => !r.correct))
const enoughChoices = computed(() => fieldCounts.value[field] >= 4)

async function choose(option) {
  if (picked.value !== null || !current.value) return
  picked.value = option
  const correct = option === answer.value
  results.value.push({ card: current.value.card, correct, chosen: option })
  // Counts as studying: keeps your streak, and a wrong answer brings the card back sooner.
  await gradeCard({ ...toRaw(current.value.card) }, correct ? Rating.Good : Rating.Again)
}

function next() {
  if (picked.value === null) return
  picked.value = null
  index.value++
}

function onKey(e) {
  if (finished.value) return
  if (picked.value === null && ['1', '2', '3', '4'].includes(e.key)) {
    const opt = current.value?.options[Number(e.key) - 1]
    if (opt) choose(opt)
  } else if (picked.value !== null && (e.key === 'Enter' || e.code === 'Space' || e.key === 'ArrowRight')) {
    e.preventDefault()
    next()
  }
}

function optionClass(option) {
  if (picked.value === null) return 'border-ink/12 bg-white hover:border-ink/30 hover:bg-sora/40'
  if (option === answer.value) return 'border-matcha bg-matcha/12 text-matcha'
  if (option === picked.value) return 'border-shu bg-sakura-soft text-shu'
  return 'border-ink/8 bg-white opacity-50'
}

const link = q => `/quiz/${deckId}?` + new URLSearchParams({ ask: field, n: String(length), ...q, t: Date.now() })
const retryLink = computed(() => link({ ids: missed.value.map(r => r.card.id).join('.') }))
const lengths = [10, 20, 'all']
const percent = computed(() => (results.value.length ? Math.round((score.value / results.value.length) * 100) : 0))
const verdict = computed(() => (percent.value === 100 ? '満点' : percent.value >= 80 ? '良' : percent.value >= 50 ? '可' : '練'))
</script>

<template>
  <div class="mx-auto max-w-xl">
    <!-- Top bar -->
    <div class="mb-3 flex items-center gap-2">
      <RouterLink :to="`/deck/${deckId}`" class="mr-auto truncate text-sm font-bold text-ink/55 hover:text-ink">← {{ deck?.name || 'Deck' }}</RouterLink>
      <div class="flex shrink-0 rounded-full bg-white/60 p-1 text-xs">
        <RouterLink
          v-for="f in ['meaning', 'reading']" :key="f" :to="link({ ask: f })"
          class="whitespace-nowrap rounded-full px-3 py-1 capitalize"
          :class="field === f ? 'bg-ink font-bold text-white' : 'font-medium text-ink/65'"
        >{{ f }}</RouterLink>
      </div>
      <div v-if="!onlyIds" class="flex shrink-0 rounded-full bg-white/60 p-1 text-xs">
        <RouterLink
          v-for="n in lengths" :key="n" :to="link({ n: String(n) })"
          class="whitespace-nowrap rounded-full px-2.5 py-1"
          :class="String(length) === String(n) ? 'bg-ink font-bold text-white' : 'font-medium text-ink/65'"
        >{{ n === 'all' ? 'All' : n }}</RouterLink>
      </div>
    </div>

    <template v-if="loaded">
      <!-- Not enough cards -->
      <div v-if="!enoughChoices" class="panel py-10 text-center">
        <div class="genko mx-auto h-24 w-24 rounded-lg text-6xl text-ink/25">問</div>
        <h2 class="mt-5 text-xl font-extrabold">Not enough cards to quiz {{ field }}s</h2>
        <p class="mx-auto mt-1 max-w-sm text-sm text-ink/65">
          A quiz needs at least 4 cards with different {{ field }}s in this deck.
          <template v-if="fieldCounts[field === 'meaning' ? 'reading' : 'meaning'] >= 4"> Try the other quiz type at the top.</template>
        </p>
        <RouterLink :to="`/deck/${deckId}`" class="btn-primary mt-6">Back to deck</RouterLink>
      </div>

      <!-- Results -->
      <div v-else-if="finished" class="panel py-8 text-center">
        <div class="mx-auto flex h-24 w-24 rotate-[-8deg] items-center justify-center rounded-full border-4 border-shu font-jp text-4xl font-semibold text-shu">{{ verdict }}</div>
        <h2 class="mt-5 text-2xl font-extrabold">{{ score }} / {{ results.length }} correct</h2>
        <p class="text-sm text-ink/55">{{ percent }}%</p>

        <div v-if="missed.length" class="mx-auto mt-6 max-w-sm text-left">
          <div class="label mb-2">To review</div>
          <ul class="divide-y divide-ink/8 overflow-hidden rounded-2xl border border-ink/10 bg-white">
            <li v-for="r in missed" :key="r.card.id" class="flex items-center gap-3 px-3 py-2">
              <span class="genko h-11 w-11 rounded text-2xl" :class="r.card.front.length > 2 && '!text-sm'">{{ r.card.front }}</span>
              <span class="min-w-0 flex-1 text-sm">
                <span class="block font-bold text-matcha">{{ r.card[field] }}</span>
                <span class="block truncate text-xs text-shu line-through">{{ r.chosen }}</span>
              </span>
            </li>
          </ul>
        </div>
        <p v-else class="mt-4 text-sm text-matcha">Perfect score. 全問正解！</p>

        <div class="mt-6 flex flex-wrap justify-center gap-2">
          <RouterLink :to="`/deck/${deckId}`" class="btn-ghost">Back to deck</RouterLink>
          <RouterLink :to="link({})" :class="missed.length ? 'btn-ghost' : 'btn-primary'">New quiz</RouterLink>
          <RouterLink v-if="missed.length" :to="retryLink" class="btn-primary">Retry missed {{ missed.length }}</RouterLink>
        </div>
      </div>

      <!-- Question -->
      <div v-else>
        <div class="mb-4 flex items-center gap-3">
          <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-white/70">
            <div class="h-2.5 rounded-full bg-gradient-to-r from-sakura to-shu transition-all" :style="{ width: (index / questions.length) * 100 + '%' }" />
          </div>
          <span class="text-xs font-bold tabular-nums text-ink/55">{{ index + 1 }} / {{ questions.length }}</span>
          <span class="rounded-full bg-matcha/10 px-2 py-0.5 text-xs font-bold text-matcha">✓ {{ score }}</span>
        </div>

        <div class="panel flex flex-col items-center !pb-5 !pt-6 text-center">
          <p class="mb-4 text-sm font-bold text-ink/55">What's the {{ field }}?</p>
          <div class="genko h-36 w-36 rounded-xl sm:h-44 sm:w-44" :class="current.card.front.length > 2 ? 'text-4xl' : current.card.front.length > 1 ? 'text-6xl sm:text-7xl' : 'text-8xl sm:text-9xl'">{{ current.card.front }}</div>
          <p v-if="picked !== null" class="mt-4 min-h-6 text-sm text-ink/65">
            <template v-if="field === 'meaning' && current.card.reading">{{ current.card.reading }}</template>
            <template v-else-if="field === 'reading' && current.card.meaning">{{ current.card.meaning }}</template>
          </p>
          <p v-else class="mt-4 min-h-6" />
        </div>

        <div class="mt-4 grid gap-2">
          <button
            v-for="(opt, i) in current.options" :key="opt"
            class="flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left font-bold transition active:scale-[.99]"
            :class="optionClass(opt)" :disabled="picked !== null"
            @click="choose(opt)"
          >
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/6 text-xs text-ink/50">{{ i + 1 }}</span>
            <span class="min-w-0 flex-1" :class="field === 'reading' && 'text-lg'">{{ opt }}</span>
            <span v-if="picked !== null && opt === answer">✓</span>
            <span v-else-if="opt === picked">✕</span>
          </button>
        </div>

        <button v-if="picked !== null" class="btn-primary mt-4 w-full py-4 text-base" @click="next">
          {{ index + 1 < questions.length ? 'Next →' : 'See results' }}
        </button>
        <p class="mt-3 hidden text-center text-xs text-ink/40 sm:block">1–4 : answer · Enter or → : next</p>
      </div>
    </template>
  </div>
</template>
