<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { db, exportAll, importAll, addSampleDeck, useLive, getBackground, setBackground, clearBackground, getBackgroundFade, setBackgroundFade } from '../lib/db'
import { toast, ask } from '../lib/ui'

const router = useRouter()

const fileInput = ref(null)

// ---- Background picture ----
const bgInput = ref(null)
const bgBlob = useLive(getBackground, null)
const bgPreview = ref(null)
const bgFade = useLive(getBackgroundFade, 0.5)
// Saved as you drag the slider.
function changeFade(e) { setBackgroundFade(Number(e.target.value) / 100) }
watch(bgBlob, blob => {
  if (bgPreview.value) URL.revokeObjectURL(bgPreview.value)
  bgPreview.value = blob instanceof Blob ? URL.createObjectURL(blob) : null
})
onUnmounted(() => bgPreview.value && URL.revokeObjectURL(bgPreview.value))

// Shrinks big phone photos (max 1600px) so they load fast and use little storage.
async function shrink(file) {
  const img = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
}

async function pickBackground(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    await setBackground(await shrink(file))
    toast('Background updated')
  } catch {
    toast("That picture couldn't be used. Try a JPG or PNG.", { timeout: 6000 })
  }
}

async function removeBackground() {
  await clearBackground()
  toast('Background removed')
}

async function doExport() {
  const data = await exportAll()
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `mainichi-kanji-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
  try { localStorage.setItem('lastBackup', new Date().toISOString()) } catch {}
  lastBackup.value = new Date().toISOString()
  toast('Backup downloaded')
}

async function doImport(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  const ok = await ask({
    title: 'Restore this backup?',
    message: `Everything currently in the app will be replaced with the contents of ${file.name}.`,
    confirmText: 'Restore',
    danger: true
  })
  if (!ok) return
  try {
    await importAll(JSON.parse(await file.text()))
    toast('Backup restored')
  } catch (err) {
    toast('Restore failed: ' + err.message, { timeout: 6000 })
  }
}

async function loadSample() {
  const id = await addSampleDeck()
  toast('Sample deck added')
  router.push(`/deck/${id}`)
}

async function wipe() {
  const ok = await ask({
    title: 'Delete everything?',
    message: 'All decks, cards, and study history will be erased from this browser. Export a backup first if you might need it.',
    confirmText: 'Delete everything',
    danger: true,
    typeToConfirm: 'DELETE'
  })
  if (!ok) return
  await Promise.all([db.decks.clear(), db.cards.clear(), db.logs.clear()])
  toast('All data deleted')
}

const lastBackup = ref(null)
try { lastBackup.value = localStorage.getItem('lastBackup') } catch {}
</script>

<template>
  <div class="mx-auto max-w-xl space-y-6">
    <h1 class="legible mt-4 flex items-baseline gap-3"><span class="font-jp text-5xl font-semibold sm:text-6xl">設定</span><span class="text-lg font-bold text-ink/50">Settings</span></h1>
    <section class="panel space-y-3">
      <h2 class="text-lg font-bold">Background</h2>
      <p class="text-sm text-ink/65">Use your own picture behind the app. It's saved only on this device.</p>
      <div
        class="relative h-36 overflow-hidden rounded-2xl border border-ink/10 bg-cover bg-center"
        :style="bgPreview ? { backgroundImage: `url(${bgPreview})` } : { background: 'linear-gradient(180deg, #c9e0f7, #f2f6fb)' }"
      >
        <div v-if="bgPreview" class="absolute inset-0" :style="{ background: `rgba(242, 246, 251, ${bgFade})` }" />
      </div>
      <label v-if="bgPreview" class="block">
        <span class="flex justify-between text-sm font-bold text-ink/70">Picture fade <span class="font-medium text-ink/50">{{ Math.round(bgFade * 100) }}%</span></span>
        <input type="range" min="0" max="85" step="5" :value="Math.round(bgFade * 100)" class="mt-2 w-full accent-[#2b3a67]" @input="changeFade" />
        <span class="flex justify-between text-xs text-ink/45"><span>Clear picture</span><span>Soft, easier to read</span></span>
      </label>
      <div class="flex flex-wrap gap-2">
        <button class="btn-primary" @click="bgInput.click()">{{ bgPreview ? 'Change picture' : 'Choose picture' }}</button>
        <button v-if="bgPreview" class="btn-ghost" @click="removeBackground">Remove</button>
        <input ref="bgInput" type="file" accept="image/*" class="hidden" @change="pickBackground" />
      </div>
    </section>

    <section class="panel space-y-3">
      <h2 class="text-lg font-bold">Backup</h2>
      <p class="text-sm text-ink/65">
        Your data lives only in this browser. Clearing site data or switching browsers loses it, so export regularly.
        <span v-if="lastBackup" class="block text-xs text-ink/55">Last export: {{ new Date(lastBackup).toLocaleString() }}</span>
      </p>
      <div class="flex flex-wrap gap-2">
        <button class="btn-primary" @click="doExport">Export backup (.json)</button>
        <button class="btn-ghost" @click="fileInput.click()">Restore from backup</button>
        <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="doImport" />
      </div>
    </section>

    <section class="panel space-y-3">
      <h2 class="text-lg font-bold">Data</h2>
      <div class="flex flex-wrap gap-2">
        <button class="btn-ghost" @click="loadSample">Add sample deck</button>
        <button class="btn-danger" @click="wipe">Delete all data</button>
      </div>
    </section>
  </div>
</template>
