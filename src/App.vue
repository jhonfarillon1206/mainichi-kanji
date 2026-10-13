<script setup>
import { ref, watch } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import Overlay from './components/Overlay.vue'
import { useLive, getBackground } from './lib/db'

// Custom background picture (set in Settings). Turns the stored image into a URL the page can show.
const bgBlob = useLive(getBackground, null)
const bgUrl = ref(null)
watch(bgBlob, blob => {
  if (bgUrl.value) URL.revokeObjectURL(bgUrl.value)
  bgUrl.value = blob instanceof Blob ? URL.createObjectURL(blob) : null
})
</script>

<template>
  <!-- Custom background with a soft light layer so text stays readable -->
  <template v-if="bgUrl">
    <div class="fixed inset-0 -z-10 bg-cover bg-center" :style="{ backgroundImage: `url(${bgUrl})` }" />
    <div class="fixed inset-0 -z-10 bg-gradient-to-b from-white/45 via-white/55 to-white/70" />
  </template>

  <header class="relative z-30">
    <nav class="mx-auto flex max-w-5xl items-center gap-1 px-4 py-4">
      <RouterLink to="/" class="mr-auto flex items-center gap-2.5">
        <svg viewBox="0 0 40 40" class="h-9 w-9" aria-hidden="true">
          <g transform="translate(20 20)">
            <path v-for="r in [0, 72, 144, 216, 288]" :key="r" :transform="`rotate(${r})`"
              d="M0 -2 C -7 -6 -8 -15 -3 -18 L 0 -15 L 3 -18 C 8 -15 7 -6 0 -2 Z" fill="#f2a7b8" stroke="#e07a95" stroke-width=".8" />
            <circle r="2.6" fill="#c8402e" />
          </g>
        </svg>
        <span class="leading-tight">
          <span class="block font-jp text-xl font-semibold">毎日漢字</span>
          <span class="block text-[11px] font-medium text-ink/55">Mainichi Kanji</span>
        </span>
      </RouterLink>
      <RouterLink to="/" class="rounded-full px-4 py-2 text-sm font-bold text-ink/60 hover:text-ink" exact-active-class="!text-ink bg-white/70">Decks</RouterLink>
      <RouterLink to="/settings" class="rounded-full px-4 py-2 text-sm font-bold text-ink/60 hover:text-ink" active-class="!text-ink bg-white/70">Settings</RouterLink>
    </nav>
  </header>
  <main class="relative z-10 mx-auto max-w-5xl px-4 pb-24 pt-2">
    <RouterView :key="$route.fullPath" />
  </main>
  <Overlay />
</template>
