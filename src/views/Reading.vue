<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { db, useLive } from '../lib/db'
import StoryModal from '../components/StoryModal.vue'

const router = useRouter()
const stories = useLive(() => db.stories.toArray(), null)
const adding = ref(false)

// Grouped by level (N5, N4, …), then in the order they were added.
const groups = computed(() => {
  if (!stories.value) return []
  const by = {}
  for (const s of stories.value) (by[s.level] ||= []).push(s)
  const order = l => (/^N\d$/.test(l) ? -Number(l[1]) : 0)
  return Object.keys(by)
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
    .map(level => ({ level, list: by[level].sort((a, b) => a.id - b.id), read: by[level].filter(s => s.readAt).length }))
})
</script>

<template>
  <StoryModal :open="adding" @close="adding = false" @saved="id => router.push(`/reading/${id}`)" />

  <template v-if="stories">
    <section class="mb-6 mt-4 flex flex-wrap items-end gap-4">
      <h1 class="legible mr-auto flex items-baseline gap-3">
        <span class="font-jp text-5xl font-semibold sm:text-6xl">読む</span>
        <span class="text-lg font-bold text-ink/50">Reading</span>
      </h1>
      <button v-if="stories.length" class="btn-primary" @click="adding = true">+ Add story</button>
    </section>

    <section v-if="!stories.length" class="panel flex flex-col items-center px-6 py-12 text-center">
      <div class="genko h-28 w-28 rounded-lg text-7xl text-ink/25">読</div>
      <h2 class="mt-6 text-xl font-bold">No stories yet</h2>
      <p class="mt-2 max-w-sm text-ink/65">Paste a reading chapter to practise kanji in context. Tap any word to see its reading.</p>
      <button class="btn-primary mt-7 px-7 py-3 text-base" @click="adding = true">Add a story</button>
    </section>

    <div v-else class="space-y-6">
      <section v-for="g in groups" :key="g.level">
        <h2 class="legible mb-3 flex items-baseline gap-2 px-1">
          <span class="text-lg font-extrabold">{{ g.level }}</span>
          <span class="text-sm font-bold text-ink/50">{{ g.read }} / {{ g.list.length }} read</span>
        </h2>
        <ul class="grid gap-3 sm:grid-cols-2">
          <li v-for="(s, i) in g.list" :key="s.id">
            <RouterLink :to="`/reading/${s.id}`" class="panel flex items-center gap-4 !p-4 transition hover:-translate-y-0.5">
              <span class="genko h-14 w-14 rounded text-2xl">{{ i + 1 }}</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-jp text-lg font-semibold">{{ s.title }}</span>
                <span class="block text-xs text-ink/55">{{ s.questions.length }} questions</span>
              </span>
              <span v-if="s.readAt" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-shu/60 font-jp text-sm text-shu" title="Read">済</span>
            </RouterLink>
          </li>
        </ul>
      </section>
    </div>
  </template>
</template>
