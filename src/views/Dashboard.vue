<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLive, addSampleDeck } from '../lib/db'
import { deckSummaries, streakInfo } from '../lib/stats'
import { importDeck } from '../lib/share'
import { toast } from '../lib/ui'
import NewDeckModal from '../components/NewDeckModal.vue'

const router = useRouter()
const decks = useLive(deckSummaries, null)
const showNewDeck = ref(false)
const streak = useLive(streakInfo, { streak: 0, studiedToday: false })

// ---- Import a deck a friend shared ----
const importInput = ref(null)
async function onImport(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    const { id, name, count } = await importDeck(file)
    toast(`Added "${name}" with ${count} cards`)
    router.push(`/deck/${id}`)
  } catch (err) {
    toast(err.message, { timeout: 6000 })
  }
}

async function trySample() {
  const id = await addSampleDeck()
  router.push(`/deck/${id}`)
}

const pct = d => (d.total ? Math.round((d.mastered / d.total) * 100) : 0)

const petals = [
  { left: '8%', size: 14, dur: 17, delay: 0 },
  { left: '27%', size: 10, dur: 22, delay: 6 },
  { left: '48%', size: 16, dur: 19, delay: 11 },
  { left: '66%', size: 11, dur: 24, delay: 3 },
  { left: '84%', size: 13, dur: 20, delay: 9 }
]
</script>

<template>
  <div aria-hidden="true">
    <svg v-for="(p, i) in petals" :key="i" class="petal" viewBox="0 0 20 20"
      :style="{ left: p.left, width: p.size + 'px', animationDuration: p.dur + 's', animationDelay: p.delay + 's' }">
      <path d="M10 19 C 2 13 1 5 6 1 L 10 4 L 14 1 C 19 5 18 13 10 19 Z" fill="#f2a7b8" opacity=".85" />
    </svg>
  </div>

  <NewDeckModal :open="showNewDeck" @close="showNewDeck = false" />
  <input ref="importInput" type="file" accept="application/json,.json" class="hidden" @change="onImport" />

  <template v-if="decks">
    <!-- Title -->
    <section class="mb-6 mt-4 flex flex-wrap items-end gap-4">
      <div class="mr-auto">
        <h1 class="legible flex items-baseline gap-3">
          <span class="font-jp text-5xl font-semibold sm:text-6xl">デッキ</span>
          <span class="text-lg font-bold text-ink/50">My decks</span>
        </h1>
        <!-- Streak -->
        <div
          class="mt-3 inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white/75 px-3 py-1.5 text-sm backdrop-blur-sm"
          :title="streak.streak ? `You've studied ${streak.streak} day${streak.streak === 1 ? '' : 's'} in a row` : 'Study any deck to start a streak'"
        >
          <span :class="streak.streak ? '' : 'grayscale opacity-50'">🔥</span>
          <template v-if="streak.streak">
            <span class="font-extrabold">{{ streak.streak }}-day streak</span>
            <span v-if="!streak.studiedToday" class="text-ink/55">· study today to keep it</span>
          </template>
          <span v-else class="font-bold text-ink/60">Study today to start a streak</span>
        </div>
      </div>
      <div v-if="decks.length" class="flex gap-2">
        <button class="btn-ghost" @click="importInput.click()">Import deck</button>
        <button class="btn-primary" @click="showNewDeck = true">+ New deck</button>
      </div>
    </section>

    <!-- No decks yet -->
    <section v-if="!decks.length" class="panel flex flex-col items-center px-6 py-12 text-center">
      <div class="genko h-28 w-28 rounded-lg text-7xl text-ink/25">字</div>
      <h2 class="mt-6 text-xl font-bold">Make your first deck</h2>
      <p class="mt-2 max-w-sm text-ink/65">A deck holds kanji you want to learn together, such as N5 or this week's words.</p>
      <div class="mt-7 flex flex-wrap justify-center gap-3">
        <button class="btn-primary px-7 py-3 text-base" @click="showNewDeck = true">Create a deck</button>
        <button class="btn-ghost px-7 py-3 text-base" @click="trySample">Try a sample deck</button>
      </div>
      <button class="mt-4 text-sm font-bold text-ink/55 underline hover:text-ink" @click="importInput.click()">Import a deck from a friend</button>
    </section>

    <!-- Deck list -->
    <ul v-else class="grid gap-4 sm:grid-cols-2">
      <li v-for="d in decks" :key="d.id" class="panel relative flex min-w-0 items-center gap-3 sm:gap-4 !p-4 transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-14px_rgba(43,58,103,.35)]">
        <div class="genko h-16 w-16 rounded-md text-4xl sm:h-20 sm:w-20 sm:text-5xl">{{ d.symbol }}</div>

        <div class="min-w-0 flex-1">
          <RouterLink :to="`/deck/${d.id}`" class="block truncate text-lg font-bold after:absolute after:inset-0 after:content-['']">{{ d.name }}</RouterLink>
          <p class="text-sm text-ink/60">
            {{ d.total }} {{ d.total === 1 ? 'card' : 'cards' }}<template v-if="d.total">, {{ d.mastered }} mastered</template>
          </p>
          <div v-if="d.total" class="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/8" :title="`${pct(d)}% mastered`">
            <div class="h-full rounded-full bg-matcha" :style="{ width: pct(d) + '%' }" />
          </div>
        </div>

        <RouterLink v-if="d.waiting" :to="`/study/${d.id}?mode=mixed`" class="btn-primary relative z-10 shrink-0 !px-4">
          Study <span class="rounded-full bg-sakura px-1.5 text-xs text-ink">{{ d.waiting }}</span>
        </RouterLink>
        <RouterLink v-else-if="!d.total" :to="`/deck/${d.id}?add=1`" class="btn-ghost relative z-10 shrink-0 !px-4">Add kanji</RouterLink>
        <RouterLink v-else :to="`/study/${d.id}?mode=all`" class="btn-ghost relative z-10 shrink-0 whitespace-nowrap !px-4" title="Done for today. Tap to go through all cards again.">
          Practice
        </RouterLink>
      </li>

      <li>
        <button class="glass flex h-full min-h-28 w-full items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-ink/25 p-4 font-bold text-ink/55 transition hover:border-sakura hover:bg-white/50 hover:text-ink" @click="showNewDeck = true">
          <span class="text-2xl leading-none">+</span> New deck
        </button>
      </li>
    </ul>
  </template>
</template>
