<script setup>
import { ref, computed, onMounted, onUnmounted, toRaw } from 'vue'
import { useRoute } from 'vue-router'
import { db } from '../lib/db'
import { buildQueue, gradeCard, undoGrade, shuffle, inOrder, Rating, State } from '../lib/srs'
import CardModal from '../components/CardModal.vue'

const route = useRoute()
const deckId = route.params.id === 'all' ? null : Number(route.params.id)
const mode = route.query.mode || 'mixed'

const deckName = ref('All decks')
const queue = ref([])
const loaded = ref(false)
const revealed = ref(false)
const busy = ref(false)
const done = ref({ total: 0, fresh: 0 })
const history = [] // back stack (plain array, kept out of Vue reactivity so IndexedDB can store its cards)
const backCount = ref(0)
const nextDue = ref(null)
const editing = ref(false)

// Shuffle preference, remembered on this device.
let saved = false
try { saved = localStorage.getItem('shuffle') === '1' } catch {}
const shuffled = ref(saved)
function toggleShuffle() {
  shuffled.value = !shuffled.value
  try { localStorage.setItem('shuffle', shuffled.value ? '1' : '0') } catch {}
  // Reorder the cards still left; the current card stays on screen.
  const [first, ...rest] = queue.value
  if (!first) return
  queue.value = [first, ...(shuffled.value ? shuffle(rest) : inOrder(rest))]
}

const current = computed(() => queue.value[0])
const progress = computed(() => {
  const total = done.value.total + queue.value.length
  return total ? (done.value.total / total) * 100 : 0
})
const kind = computed(() => {
  const s = current.value?.state
  if (s === State.New) return { label: 'New kanji', cls: 'text-ink bg-sora' }
  if (s === State.Review) return { label: 'Review', cls: 'text-matcha bg-matcha/10' }
  return { label: 'Learning', cls: 'text-yamabuki bg-yamabuki/10' }
})

onMounted(async () => {
  if (deckId) deckName.value = (await db.decks.get(deckId))?.name || 'Deck'
  queue.value = await buildQueue(deckId, mode, shuffled.value)
  if (!queue.value.length) {
    const upcoming = (deckId ? await db.cards.where('deckId').equals(deckId).toArray() : await db.cards.toArray())
      .filter(c => !c.suspended && c.state !== State.New)
      .map(c => c.due)
    nextDue.value = upcoming.length ? new Date(Math.min(...upcoming)) : null
  }
  loaded.value = true
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => window.removeEventListener('keydown', onKey))

// Next: marks the card as studied and schedules its next review.
async function next() {
  if (!current.value || busy.value) return
  busy.value = true
  const card = current.value
  history.push({ card: { ...toRaw(card) }, queue: [...queue.value], done: { ...done.value } })
  if (history.length > 20) history.shift()

  const { updated, logId } = await gradeCard({ ...toRaw(card) }, Rating.Good)
  history[history.length - 1].logId = logId
  backCount.value = history.length

  done.value.total++
  if (card.state === State.New) done.value.fresh++

  const rest = queue.value.slice(1)
  // Cards still in learning come back later in this session.
  const soon = updated.due - new Date() < 30 * 60_000
  queue.value = soon && updated.state !== State.Review ? [...rest, updated] : rest
  revealed.value = false
  busy.value = false
}

// Back: returns to the previous card and cancels its "Next".
async function back() {
  if (busy.value || !history.length) return
  const last = history.pop()
  backCount.value = history.length
  busy.value = true
  await undoGrade(last.card, last.logId)
  queue.value = last.queue
  done.value = last.done
  revealed.value = true
  busy.value = false
}

async function afterEdit() {
  editing.value = false
  if (!current.value) return
  const fresh = await db.cards.get(current.value.id)
  if (fresh) queue.value[0] = { ...current.value, ...fresh }
}

function onKey(e) {
  if (editing.value || e.target.matches('input, textarea, select')) return
  if (e.key === 'ArrowLeft') { back(); return }
  if (e.code === 'Space' || e.key === 'Enter' || e.key === 'ArrowRight') {
    e.preventDefault()
    if (!revealed.value) revealed.value = true
    else next()
  }
}

function fromNow(date) {
  const min = Math.round((date - new Date()) / 60000)
  if (min < 60) return `in ${Math.max(1, min)} min`
  const h = Math.round(min / 60)
  if (h < 24) return `in ${h} hour${h > 1 ? 's' : ''}`
  const d = Math.round(h / 24)
  return d === 1 ? 'tomorrow' : `in ${d} days`
}

const backTo = deckId ? `/deck/${deckId}` : '/'
const modes = [
  { key: 'mixed', label: 'Today' },
  { key: 'all', label: 'All cards' }
]
// Adding a timestamp forces a fresh session even if we're already in "All cards".
const againLink = () => `/study/${route.params.id}?mode=all&t=${Date.now()}`
</script>

<template>
  <div class="mx-auto max-w-xl">
    <CardModal v-if="current" :open="editing" :deck-id="current.deckId" :card="current" @close="afterEdit" />

    <div class="mb-3 flex items-center gap-2">
      <RouterLink :to="backTo" class="mr-auto truncate text-sm font-bold text-ink/55 hover:text-ink">← {{ deckName }}</RouterLink>
      <button
        class="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition"
        :class="shuffled ? 'bg-sakura text-ink' : 'bg-white/60 text-ink/55'"
        :aria-pressed="shuffled" title="Shuffle the order"
        @click="toggleShuffle"
      >⇄ Shuffle</button>
      <div class="flex shrink-0 rounded-full bg-white/60 p-1 text-xs">
        <RouterLink
          v-for="m in modes" :key="m.key" :to="`/study/${route.params.id}?mode=${m.key}`"
          class="whitespace-nowrap rounded-full px-3 py-1" :class="mode === m.key ? 'bg-ink font-bold text-white' : 'font-medium text-ink/65'"
        >{{ m.label }}</RouterLink>
      </div>
    </div>

    <template v-if="loaded">
      <!-- Progress -->
      <div v-if="current || done.total" class="mb-4 flex items-center gap-3">
        <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-white/70">
          <div class="h-2.5 rounded-full bg-gradient-to-r from-sakura to-shu transition-all" :style="{ width: progress + '%' }" />
        </div>
        <span class="text-xs font-bold tabular-nums text-ink/55">{{ done.total }} / {{ done.total + queue.length }}</span>
      </div>

      <!-- Finished / nothing to do -->
      <div v-if="!current" class="panel py-10 text-center">
        <div class="mx-auto flex h-24 w-24 rotate-[-8deg] items-center justify-center rounded-full border-4 border-shu font-jp text-5xl font-semibold text-shu" :class="!done.total && 'border-ink/30 text-ink/40'">{{ done.total ? '完' : '休' }}</div>
        <template v-if="done.total">
          <h2 class="mt-5 text-2xl font-extrabold">Session complete</h2>
          <div class="mx-auto mt-5 grid max-w-[14rem] grid-cols-2 gap-2 text-center">
            <div class="rounded-2xl bg-sora/60 p-3"><div class="text-2xl font-extrabold">{{ done.total }}</div><div class="text-xs text-ink/55">cards</div></div>
            <div class="rounded-2xl bg-sora p-3"><div class="text-2xl font-extrabold text-ink">{{ done.fresh }}</div><div class="text-xs text-ink/55">new</div></div>
          </div>
        </template>
        <template v-else>
          <h2 class="mt-5 text-2xl font-extrabold">Nothing to study right now</h2>
          <p class="mx-auto mt-1 max-w-sm text-sm text-ink/65">
            <template v-if="mode === 'new'">No new cards left today. Add more kanji, or raise "new per day" in the deck's settings.</template>
            <template v-else-if="nextDue">Your next review is {{ fromNow(nextDue) }}.</template>
            <template v-else>Add some kanji to a deck to get started.</template>
          </p>
        </template>
        <div class="mt-6 flex justify-center gap-2">
          <button v-if="backCount" class="btn-ghost" @click="back">← Back</button>
          <RouterLink :to="backTo" class="btn-ghost">Back to {{ deckId ? 'deck' : 'decks' }}</RouterLink>
          <RouterLink :to="againLink()" class="btn-primary">Study all again</RouterLink>
        </div>
      </div>

      <!-- Card -->
      <div v-else>
        <div
          class="panel relative flex min-h-96 select-none flex-col items-center justify-center !px-5 !pb-6 !pt-14 text-center"
          :class="!revealed && 'cursor-pointer'"
          @click="!revealed && (revealed = true)"
        >
          <span class="absolute left-4 top-4 rounded-full px-2.5 py-0.5 text-xs font-bold" :class="kind.cls">{{ kind.label }}</span>
          <button class="absolute right-3 top-3 rounded-lg px-2 py-1 text-xs text-ink/40 hover:bg-sora hover:text-ink" @click.stop="editing = true">Edit</button>

          <div class="genko h-44 w-44 rounded-xl sm:h-52 sm:w-52" :class="current.front.length > 2 ? 'text-5xl' : current.front.length > 1 ? 'text-7xl sm:text-8xl' : 'text-9xl sm:text-[9rem]'">{{ current.front }}</div>

          <div v-if="revealed" class="mt-6 w-full border-t border-ink/8 pt-5">
            <div class="text-3xl font-bold">{{ current.reading }}</div>
            <div class="mt-1 text-lg text-ink/80">{{ current.meaning }}</div>
            <div v-if="current.example" class="mt-4 whitespace-pre-line rounded-2xl bg-sakura-soft/70 px-4 py-2.5 text-ink/80">{{ current.example }}</div>
            <div v-if="current.notes" class="mt-3 text-sm italic text-ink/55">{{ current.notes }}</div>
          </div>
          <p v-else class="mt-8 text-sm text-ink/40">Tap to show the answer</p>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2">
          <button class="btn-ghost py-4 text-base" :disabled="!backCount || busy" @click="back">← Back</button>
          <button v-if="!revealed" class="btn-primary py-4 text-base" @click="revealed = true">Show answer</button>
          <button v-else class="btn-primary py-4 text-base" :disabled="busy" @click="next">Next →</button>
        </div>

        <p class="mt-3 hidden text-center text-xs text-ink/40 sm:block">Space or → : show / next · ← : back</p>
      </div>
    </template>
  </div>
</template>
