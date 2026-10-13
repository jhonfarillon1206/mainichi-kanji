<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { db, getSettings, saveSettings, exportAll, importAll, addSampleDeck, DEFAULT_SETTINGS } from '../lib/db'
import { toast, ask } from '../lib/ui'

const router = useRouter()

const form = reactive({ ...DEFAULT_SETTINGS })
const fileInput = ref(null)

onMounted(async () => Object.assign(form, await getSettings()))

async function save() {
  await saveSettings(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v)])))
  toast('Settings saved')
}

async function doExport() {
  const data = await exportAll()
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `kanji-deck-backup-${new Date().toISOString().slice(0, 10)}.json`
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
    Object.assign(form, await getSettings())
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
    <h1 class="mt-4 flex items-baseline gap-3"><span class="font-jp text-5xl font-semibold sm:text-6xl">設定</span><span class="text-lg font-bold text-ink/50">Settings</span></h1>
    <section class="panel">
      <h2 class="mb-4 text-lg font-bold">Study</h2>
      <form class="space-y-4" @submit.prevent="save">
        <label class="flex items-center justify-between gap-4 text-sm">
          <span>Next day starts at (hour, 0–23)<br><span class="text-xs text-ink/55">Late-night study still counts for the previous day.</span></span>
          <input v-model="form.dayStartHour" type="number" min="0" max="23" class="input w-24" />
        </label>
        <label class="flex items-center justify-between gap-4 text-sm">
          <span>Maximum reviews per session</span>
          <input v-model="form.reviewCap" type="number" min="1" class="input w-24" />
        </label>
        <label class="flex items-center justify-between gap-4 text-sm">
          <span>Leech threshold<br><span class="text-xs text-ink/55">Times forgotten before a card is flagged.</span></span>
          <input v-model="form.leechThreshold" type="number" min="1" class="input w-24" />
        </label>
        <label class="flex items-center justify-between gap-4 text-sm">
          <span>Mastered after (days)<br><span class="text-xs text-ink/55">Review interval that counts as mastered.</span></span>
          <input v-model="form.masteredDays" type="number" min="1" class="input w-24" />
        </label>
        <p class="text-xs text-ink/55">New cards per day are set per deck, in each deck's settings.</p>
        <button class="btn-primary">Save settings</button>
      </form>
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
