<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { db, newCard, parseImport } from '../lib/db'
import { toast } from '../lib/ui'
import Modal from './Modal.vue'

// card = null → add mode; card = object → edit mode.
const props = defineProps({ open: Boolean, deckId: Number, card: Object, fronts: { type: Array, default: () => [] } })
const emit = defineEmits(['close'])

const tab = ref('one')
const blank = () => ({ front: '', reading: '', meaning: '', example: '', notes: '' })
const form = reactive(blank())
const error = ref('')
const added = ref(0)
const frontInput = ref(null)
const pasteText = ref('')

const editing = computed(() => !!props.card)

watch(() => props.open, async v => {
  if (!v) return
  tab.value = 'one'
  error.value = ''
  added.value = 0
  pasteText.value = ''
  Object.assign(form, props.card
    ? { front: props.card.front, reading: props.card.reading, meaning: props.card.meaning, example: props.card.example, notes: props.card.notes || '' }
    : blank())
  await nextTick()
  frontInput.value?.focus()
}, { immediate: true })

const duplicate = computed(() => {
  const f = form.front.trim()
  return f && f !== props.card?.front && props.fronts.includes(f)
})

async function save(closeAfter) {
  const front = form.front.trim()
  if (!front) { error.value = 'Type the kanji first.'; frontInput.value?.focus(); return }
  if (duplicate.value) { error.value = `${front} is already in this deck.`; return }

  if (editing.value) {
    const fields = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]))
    await db.cards.update(props.card.id, fields)
    toast(`Saved ${front}`)
    emit('close')
    return
  }
  await db.cards.add(newCard(props.deckId, form))
  added.value++
  if (closeAfter) {
    toast(`Added ${front}`)
    emit('close')
  } else {
    Object.assign(form, blank())
    error.value = ''
    frontInput.value?.focus()
  }
}

// ---- Paste a list ----
const parsed = computed(() => parseImport(pasteText.value))
const fresh = computed(() => {
  const seen = new Set(props.fronts)
  return parsed.value.filter(r => {
    const f = r.front.trim()
    if (seen.has(f)) return false
    seen.add(f)
    return true
  })
})

async function importList() {
  if (!fresh.value.length) return
  await db.cards.bulkAdd(fresh.value.map(r => newCard(props.deckId, r)))
  const skipped = parsed.value.length - fresh.value.length
  toast(`Added ${fresh.value.length} cards${skipped ? `, skipped ${skipped} duplicate${skipped > 1 ? 's' : ''}` : ''}`)
  emit('close')
}

const EXAMPLE = '日 | にち、ひ | day, sun | 日曜日（にちようび）Sunday\n月 | げつ、つき | month, moon | 月曜日（げつようび）Monday\n火 | か、ひ | fire'
</script>

<template>
  <Modal :open="open" :title="editing ? `Edit ${card.front}` : 'Add cards'" wide @close="emit('close')">
    <div v-if="!editing" class="mb-5 grid grid-cols-2 rounded-full bg-sora p-1 text-sm">
      <button class="rounded-full py-1.5" :class="tab === 'one' ? 'bg-white font-bold shadow-sm' : 'text-ink/60'" @click="tab = 'one'">One at a time</button>
      <button class="rounded-full py-1.5" :class="tab === 'paste' ? 'bg-white font-bold shadow-sm' : 'text-ink/60'" @click="tab = 'paste'">Paste a list</button>
    </div>

    <!-- One card -->
    <form v-if="tab === 'one'" class="space-y-4" @submit.prevent="save(false)">
      <div class="grid gap-4 sm:grid-cols-[8.5rem_1fr]">
        <div>
          <label class="label">Kanji <span class="text-shu">*</span></label>
          <input
            ref="frontInput" v-model="form.front" maxlength="12"
            class="genko mt-1 h-32 w-32 rounded-lg text-center text-6xl focus:outline-none focus:ring-4 focus:ring-sakura/30" :class="error && '!border-shu'"
            @input="error = ''"
          />
          <p class="hint">e.g. 人</p>
        </div>
        <div class="space-y-3">
          <div>
            <label class="label">Reading</label>
            <input v-model="form.reading" class="input mt-1" placeholder="ひと、じん" />
          </div>
          <div>
            <label class="label">Meaning</label>
            <input v-model="form.meaning" class="input mt-1" placeholder="person" />
          </div>
        </div>
      </div>
      <p v-if="error" class="-mt-2 text-sm text-shu">{{ error }}</p>
      <p v-else-if="duplicate" class="-mt-2 text-sm text-yamabuki">{{ form.front.trim() }} is already in this deck.</p>

      <div>
        <label class="label">Example <span class="font-normal text-ink/40">(optional)</span></label>
        <textarea v-model="form.example" rows="2" class="input mt-1" placeholder="あの人は優しいです。That person is kind." />
      </div>
      <div>
        <label class="label">Notes <span class="font-normal text-ink/40">(optional)</span></label>
        <input v-model="form.notes" class="input mt-1" placeholder="A mnemonic, e.g. looks like a person walking" />
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2 border-t border-ink/8 pt-4">
        <span v-if="added" class="mr-auto text-sm text-matcha">✓ {{ added }} added</span>
        <template v-if="editing">
          <button type="button" class="btn-ghost" @click="emit('close')">Cancel</button>
          <button class="btn-primary">Save changes</button>
        </template>
        <template v-else>
          <button type="button" class="btn-ghost" @click="added && !form.front.trim() ? emit('close') : save(true)">
            {{ added && !form.front.trim() ? 'Done' : 'Save & close' }}
          </button>
          <button class="btn-primary">Save & add another <span class="opacity-60">↵</span></button>
        </template>
      </div>
    </form>

    <!-- Paste a list -->
    <div v-else class="space-y-3">
      <p class="text-sm text-ink/65">
        One kanji per line, parts separated by <b>|</b>: <code class="rounded bg-sora px-1 text-xs">kanji | reading | meaning | example</code>.
        Only the kanji is required. You can also copy rows straight from Excel or Google Sheets.
      </p>
      <textarea v-model="pasteText" rows="7" class="input font-mono" :placeholder="EXAMPLE" />
      <button v-if="!pasteText" type="button" class="text-xs text-ink/55 underline" @click="pasteText = EXAMPLE">Fill in the example</button>

      <div v-if="parsed.length" class="overflow-hidden rounded-lg border border-ink/10">
        <table class="w-full text-left text-sm">
          <thead class="bg-sora/50 text-xs text-ink/55">
            <tr><th class="px-3 py-2">Kanji</th><th class="px-3 py-2">Reading</th><th class="px-3 py-2">Meaning</th></tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in parsed.slice(0, 5)" :key="i" class="border-t border-ink/8" :class="!fresh.includes(r) && 'text-ink/40 line-through'">
              <td class="font-jp px-3 py-1.5 text-lg">{{ r.front }}</td>
              <td class="px-3 py-1.5">{{ r.reading }}</td>
              <td class="px-3 py-1.5">{{ r.meaning }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="parsed.length > 5" class="border-t border-ink/8 bg-sora/50 px-3 py-1.5 text-xs text-ink/55">…and {{ parsed.length - 5 }} more</div>
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-ink/8 pt-4">
        <span v-if="parsed.length !== fresh.length" class="mr-auto text-xs text-ink/55">{{ parsed.length - fresh.length }} already in deck, will be skipped</span>
        <button class="btn-ghost" @click="emit('close')">Cancel</button>
        <button class="btn-primary" :disabled="!fresh.length" @click="importList">Add {{ fresh.length || '' }} card{{ fresh.length === 1 ? '' : 's' }}</button>
      </div>
    </div>
  </Modal>
</template>
