<script setup>
import { ref, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '../lib/db'
import Modal from './Modal.vue'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])
const router = useRouter()

const name = ref('')
const newPerDay = ref(10)
const symbol = ref('')
const folder = ref('')
const folders = ref([])
const error = ref('')
const input = ref(null)

watch(() => props.open, async v => {
  if (!v) return
  name.value = ''
  newPerDay.value = 10
  symbol.value = ''
  folder.value = ''
  folders.value = [...new Set((await db.decks.toArray()).map(d => d.folder).filter(Boolean))].sort()
  error.value = ''
  await nextTick()
  input.value?.focus()
})

async function create() {
  if (!name.value.trim()) { error.value = 'Give the deck a name.'; return }
  const id = await db.decks.add({ name: name.value.trim(), symbol: symbol.value.trim().slice(0, 1), folder: folder.value.trim(), newPerDay: Number(newPerDay.value) || 10, createdAt: new Date() })
  emit('close')
  router.push(`/deck/${id}?add=1`)
}

const suggestions = ['N5 Kanji', 'N4 Kanji', 'Weekly words', 'Hard ones']
</script>

<template>
  <Modal :open="open" title="New deck" @close="emit('close')">
    <form class="space-y-4" @submit.prevent="create">
      <div>
        <label class="label">Deck name</label>
        <input ref="input" v-model="name" class="input mt-1" placeholder="e.g. N5 Kanji" @input="error = ''" />
        <p v-if="error" class="mt-1 text-xs text-shu">{{ error }}</p>
        <p v-else class="hint">A deck is a group of cards. You add the kanji themselves next.</p>
        <div class="mt-2 flex flex-wrap gap-1">
          <button v-for="s in suggestions" :key="s" type="button" class="rounded-full bg-sora px-3 py-1 text-xs font-medium text-ink/75 hover:bg-sakura-soft" @click="name = s">{{ s }}</button>
        </div>
      </div>
      <div>
        <label class="label">Folder <span class="font-normal text-ink/45">(optional)</span></label>
        <input v-model="folder" list="folder-list" class="input mt-1" placeholder="e.g. N5" />
        <datalist id="folder-list"><option v-for="f in folders" :key="f" :value="f" /></datalist>
        <p class="hint">Decks with the same folder are grouped together on the home screen. Leave empty for no folder.</p>
      </div>
      <div class="flex items-center gap-4">
        <input v-model="symbol" maxlength="2" class="genko h-16 w-16 rounded-md text-center text-4xl focus:outline-none focus:ring-4 focus:ring-sakura/30" placeholder="字" />
        <div>
          <label class="label">Deck symbol <span class="font-normal text-ink/45">(optional)</span></label>
          <p class="hint !mt-0">One kanji shown on the deck. Leave empty to use the deck's first card.</p>
        </div>
      </div>
      <div>
        <label class="label">New kanji per day</label>
        <input v-model="newPerDay" type="number" min="0" class="input mt-1 w-28" />
        <p class="hint">How many unseen kanji to introduce daily. 5–10 is a good start.</p>
      </div>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" class="btn-ghost" @click="emit('close')">Cancel</button>
        <button class="btn-primary">Create deck</button>
      </div>
    </form>
  </Modal>
</template>
