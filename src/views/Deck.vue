<script setup>
import { ref, reactive, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db, useLive, getSettings } from '../lib/db'
import { cardStatus, isLeech, resetCard, dayKey, State } from '../lib/srs'
import { toast, ask } from '../lib/ui'
import { shareDeck } from '../lib/share'
import Modal from '../components/Modal.vue'
import CardModal from '../components/CardModal.vue'

const route = useRoute()
const router = useRouter()
const deckId = Number(route.params.id)

const data = useLive(async () => {
  const settings = await getSettings()
  const [deck, cards, decks, todaysLogs] = await Promise.all([
    db.decks.get(deckId),
    db.cards.where('deckId').equals(deckId).toArray(),
    db.decks.toArray(),
    db.logs.where('dayKey').equals(dayKey(new Date(), settings.dayStartHour)).toArray()
  ])
  const newDoneToday = todaysLogs.filter(l => l.deckId === deckId && l.stateBefore === State.New).length
  return { deck, cards, decks, settings, newDoneToday }
}, null)

// ---- Counts ----
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'learning', label: 'Learning' },
  { key: 'due', label: 'To review' },
  { key: 'mastered', label: 'Mastered' },
  { key: 'leech', label: 'Hard' },
  { key: 'suspended', label: 'Paused' }
]
const counts = computed(() => {
  const out = Object.fromEntries(FILTERS.map(f => [f.key, 0]))
  if (!data.value) return out
  const now = new Date()
  for (const c of data.value.cards) {
    out.all++
    out[cardStatus(c, data.value.settings, now)]++
    if (isLeech(c, data.value.settings)) out.leech++
  }
  return out
})
const newLeft = computed(() => {
  if (!data.value?.deck) return 0
  return Math.max(0, Math.min((data.value.deck.newPerDay ?? 10) - data.value.newDoneToday, counts.value.new))
})
const waiting = computed(() => counts.value.due + newLeft.value)
const symbol = computed(() => data.value?.deck?.symbol || [...(data.value?.cards || [])].sort((a, b) => a.id - b.id)[0]?.front?.[0] || '字')

// ---- Card modal ----
const cardModal = reactive({ open: route.query.add === '1', card: null })
const fronts = computed(() => data.value?.cards.map(c => c.front) || [])
function openAdd() { cardModal.card = null; cardModal.open = true }
function openEdit(c) { cardModal.card = c; cardModal.open = true }
function closeCardModal() {
  cardModal.open = false
  if (route.query.add) router.replace({ query: { ...route.query, add: undefined } })
}

// ---- Deck settings ----
const deckModal = ref(false)
const deckForm = reactive({ name: '', newPerDay: 10, symbol: '' })
function openDeckSettings() {
  deckForm.name = data.value.deck.name
  deckForm.newPerDay = data.value.deck.newPerDay ?? 10
  deckForm.symbol = data.value.deck.symbol || ''
  deckModal.value = true
}
async function saveDeck() {
  if (!deckForm.name.trim()) return
  await db.decks.update(deckId, { name: deckForm.name.trim(), symbol: deckForm.symbol.trim().slice(0, 1), newPerDay: Number(deckForm.newPerDay) || 0 })
  deckModal.value = false
  toast('Deck saved')
}
async function share() {
  const result = await shareDeck(deckId)
  if (result === 'downloaded') toast('Deck file downloaded. Send it to a friend to import.')
  if (result === 'shared') toast('Deck shared')
}

async function deleteDeck() {
  const n = data.value.cards.length
  deckModal.value = false
  const ok = await ask({
    title: `Delete "${data.value.deck.name}"?`,
    message: `This deletes the deck, its ${n} card${n === 1 ? '' : 's'}, and their study history. This can't be undone.`,
    confirmText: 'Delete deck',
    danger: true
  })
  if (!ok) return
  await db.transaction('rw', db.decks, db.cards, db.logs, async () => {
    await db.cards.where('deckId').equals(deckId).delete()
    await db.logs.where('deckId').equals(deckId).delete()
    await db.decks.delete(deckId)
  })
  toast('Deck deleted')
  router.push('/')
}

// ---- Card actions ----
const menuOpen = ref(null)
function closeMenu() { menuOpen.value = null }

async function toggleSuspend(c) {
  closeMenu()
  await db.cards.update(c.id, { suspended: !c.suspended })
  toast(c.suspended ? `${c.front} resumed` : `${c.front} paused. It won't appear in study.`)
}
async function reset(c) {
  closeMenu()
  const ok = await ask({ title: `Start ${c.front} over?`, message: 'It becomes a new card again and its review schedule is cleared.', confirmText: 'Start over' })
  if (ok) { await db.cards.put(resetCard(c)); toast(`${c.front} reset`) }
}
async function remove(c) {
  closeMenu()
  const logs = await db.logs.where('cardId').equals(c.id).toArray()
  const { status, leech, ...card } = c
  await db.transaction('rw', db.cards, db.logs, async () => {
    await db.logs.where('cardId').equals(c.id).delete()
    await db.cards.delete(c.id)
  })
  toast(`Deleted ${c.front}`, {
    action: 'Undo',
    timeout: 6000,
    onAction: async () => {
      await db.cards.add(card)
      await db.logs.bulkAdd(logs)
    }
  })
}
async function move(c, to) {
  closeMenu()
  if (!to || to === deckId) return
  await db.transaction('rw', db.cards, db.logs, async () => {
    await db.cards.update(c.id, { deckId: to })
    await db.logs.where('cardId').equals(c.id).modify({ deckId: to })
  })
  toast(`Moved ${c.front} to ${data.value.decks.find(d => d.id === to)?.name}`)
}

// ---- List ----
const q = ref(route.query.q || '')
const filter = ref('all')

const rows = computed(() => {
  if (!data.value) return []
  const { cards, settings } = data.value
  const now = new Date()
  const term = q.value.trim().toLowerCase()
  return cards
    .map(c => ({ ...c, status: cardStatus(c, settings, now), leech: isLeech(c, settings) }))
    .filter(c => filter.value === 'all' || (filter.value === 'leech' ? c.leech : c.status === filter.value))
    .filter(c => !term || [c.front, c.reading, c.meaning, c.example].some(v => (v || '').toLowerCase().includes(term)))
    .sort((a, b) => b.id - a.id)
})

const STATUS = {
  new: { label: 'New', cls: 'bg-sora text-ink' },
  learning: { label: 'Learning', cls: 'bg-yamabuki/10 text-yamabuki' },
  due: { label: 'To review', cls: 'bg-sakura-soft text-shu' },
  mastered: { label: 'Mastered', cls: 'bg-matcha/10 text-matcha' },
  suspended: { label: 'Paused', cls: 'bg-sora text-ink/55' }
}
function nextLabel(c) {
  if (c.status === 'new' || c.status === 'suspended') return ''
  const min = (c.due - new Date()) / 60000
  if (min <= 0) return 'Review now'
  if (min < 60) return `Next in ${Math.ceil(min)} min`
  if (min < 1440) return `Next in ${Math.round(min / 60)} h`
  const d = Math.round(min / 1440)
  return `Next in ${d} day${d > 1 ? 's' : ''}`
}
</script>

<template>
  <div v-if="data && !data.deck" class="panel text-center">
    <p class="text-ink/65">This deck doesn't exist anymore.</p>
    <RouterLink to="/" class="btn-primary mt-4">Back to home</RouterLink>
  </div>

  <div v-else-if="data" class="space-y-5" @click="menuOpen && closeMenu()">
    <CardModal :open="cardModal.open" :deck-id="deckId" :card="cardModal.card" :fronts="fronts" @close="closeCardModal" />

    <Modal :open="deckModal" title="Deck settings" @close="deckModal = false">
      <form class="space-y-4" @submit.prevent="saveDeck">
        <div>
          <label class="label">Deck name</label>
          <input v-model="deckForm.name" class="input mt-1" />
        </div>
        <div class="flex items-center gap-4">
          <input v-model="deckForm.symbol" maxlength="2" class="genko h-16 w-16 rounded-md text-center text-4xl focus:outline-none focus:ring-4 focus:ring-sakura/30" :placeholder="symbol" />
          <div>
            <label class="label">Deck symbol</label>
            <p class="hint !mt-0">One kanji shown on the deck. Leave empty to use the first card.</p>
          </div>
        </div>
        <div>
          <label class="label">New kanji per day</label>
          <input v-model="deckForm.newPerDay" type="number" min="0" class="input mt-1 w-28" />
          <p class="hint">Set to 0 to only review kanji you've already started.</p>
        </div>
        <div class="rounded-2xl bg-sora/60 p-4">
          <div class="label">Share this deck</div>
          <p class="hint !mt-0.5">Sends a file a friend can open with <b>Import deck</b> on their home screen. Only the cards are shared, not your progress.</p>
          <button type="button" class="btn-ghost mt-3" :disabled="!counts.all" @click="share">Share deck</button>
        </div>
        <div class="flex items-center gap-2 border-t border-ink/8 pt-4">
          <button type="button" class="btn-danger mr-auto" @click="deleteDeck">Delete deck</button>
          <button type="button" class="btn-ghost" @click="deckModal = false">Cancel</button>
          <button class="btn-primary" :disabled="!deckForm.name.trim()">Save</button>
        </div>
      </form>
    </Modal>

    <!-- Header -->
    <RouterLink to="/" class="text-sm font-bold text-ink/55 hover:text-ink">← All decks</RouterLink>
    <section class="flex flex-wrap items-center gap-3">
      <div class="mr-auto flex min-w-0 items-center gap-4">
        <div class="genko h-16 w-16 rounded-md text-4xl">{{ symbol }}</div>
        <div class="min-w-0">
          <h1 class="truncate text-2xl font-extrabold sm:text-3xl">{{ data.deck.name }}</h1>
          <p class="text-sm text-ink/55">
            {{ counts.all }} {{ counts.all === 1 ? 'card' : 'cards' }}, {{ data.deck.newPerDay ?? 10 }} new per day
          </p>
        </div>
      </div>
      <button class="btn-ghost" title="Deck settings" @click="openDeckSettings">⚙ Settings</button>
      <button class="btn-ghost" @click="openAdd">+ Add kanji</button>
      <RouterLink v-if="waiting" :to="`/study/${deckId}?mode=mixed`" class="btn-primary">Study {{ waiting }}</RouterLink>
      <RouterLink v-if="counts.all" :to="`/study/${deckId}?mode=all`" :class="waiting ? 'btn-ghost' : 'btn-primary'">Practice all {{ counts.all - counts.suspended }}</RouterLink>
    </section>

    <!-- Empty -->
    <section v-if="!counts.all" class="panel py-12 text-center">
      <div class="genko mx-auto h-24 w-24 rounded-lg text-6xl text-ink/25">字</div>
      <h2 class="mt-5 text-xl font-bold">No kanji in this deck yet</h2>
      <p class="mx-auto mt-1 max-w-sm text-sm text-ink/55">Add the kanji you want to learn. Each card has a kanji on the front, and its reading and meaning on the back.</p>
      <button class="btn-primary mt-5 px-6 py-3" @click="openAdd">+ Add kanji</button>
    </section>

    <!-- List -->
    <section v-else class="panel !p-0">
      <div class="space-y-3 border-b border-ink/8 p-4">
        <input v-model="q" type="search" class="input" placeholder="Search by kanji, reading, or meaning" />
        <div class="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          <template v-for="f in FILTERS" :key="f.key">
            <button
              v-if="f.key === 'all' || counts[f.key]"
              class="shrink-0 rounded-full border-2 px-3 py-1 text-xs font-bold"
              :class="filter === f.key ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-white text-ink/65 hover:bg-sora/50'"
              @click="filter = f.key"
            >{{ f.label }} <span class="opacity-60">{{ counts[f.key] }}</span></button>
          </template>
        </div>
      </div>

      <p v-if="!rows.length" class="py-10 text-center text-sm text-ink/55">
        No cards match.
        <button class="underline" @click="q = ''; filter = 'all'">Clear search</button>
      </p>

      <ul class="divide-y divide-ink/8">
        <li v-for="c in rows" :key="c.id" class="relative flex items-center gap-4 px-4 py-3 hover:bg-sora/50" :class="c.suspended && 'opacity-60'">
          <button class="flex min-w-0 flex-1 items-center gap-4 text-left" @click="openEdit(c)">
            <span class="genko h-14 w-14 rounded text-3xl" :class="c.front.length > 2 && '!text-lg'">{{ c.front }}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate">
                <span class="font-medium">{{ c.reading || '—' }}</span>
                <span class="text-ink/55">, {{ c.meaning || 'no meaning' }}</span>
              </span>
              <span v-if="c.example" class="block truncate text-sm text-ink/55">{{ c.example }}</span>
              <span class="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <span class="rounded-full px-2 py-0.5 font-medium" :class="STATUS[c.status].cls">{{ STATUS[c.status].label }}</span>
                <span v-if="c.leech" class="rounded-full bg-shu px-2 py-0.5 font-medium text-white">Hard: forgotten {{ c.lapses }}×</span>
                <span v-if="nextLabel(c)" class="text-ink/55">{{ nextLabel(c) }}</span>
              </span>
            </span>
          </button>

          <div class="relative">
            <button class="rounded-lg px-2.5 py-1.5 text-lg leading-none text-ink/55 hover:bg-sora" aria-label="More actions" @click.stop="menuOpen = menuOpen === c.id ? null : c.id">⋯</button>
            <div v-if="menuOpen === c.id" class="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-2xl border border-ink/10 bg-washi py-1 text-sm shadow-xl" @click.stop>
              <button class="block w-full px-4 py-2 text-left hover:bg-sora/50" @click="closeMenu(); openEdit(c)">Edit</button>
              <button class="block w-full px-4 py-2 text-left hover:bg-sora/50" @click="toggleSuspend(c)">{{ c.suspended ? 'Resume' : 'Pause (skip in study)' }}</button>
              <button v-if="c.reps" class="block w-full px-4 py-2 text-left hover:bg-sora/50" @click="reset(c)">Start over</button>
              <template v-if="data.decks.length > 1">
                <div class="border-t border-ink/8 px-4 pt-2 pb-1 text-xs text-ink/40">Move to</div>
                <button
                  v-for="d in data.decks.filter(d => d.id !== deckId)" :key="d.id"
                  class="block w-full truncate px-4 py-1.5 text-left hover:bg-sora/50" @click="move(c, d.id)"
                >{{ d.name }}</button>
              </template>
              <button class="block w-full border-t border-ink/8 px-4 py-2 text-left text-shu hover:bg-sakura-soft" @click="remove(c)">Delete</button>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
