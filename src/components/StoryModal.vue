<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { db } from '../lib/db'
import { parseStory, EXAMPLE } from '../lib/story'
import { toast } from '../lib/ui'
import Modal from './Modal.vue'

// story = null → add; story object → edit.
const props = defineProps({ open: Boolean, story: Object })
const emit = defineEmits(['close', 'saved'])

const text = ref('')
const error = ref('')
const box = ref(null)

watch(() => props.open, async v => {
  if (!v) return
  text.value = props.story?.raw || ''
  error.value = ''
  await nextTick()
  box.value?.focus()
})

const preview = computed(() => {
  if (!text.value.trim()) return null
  try { return parseStory(text.value) } catch { return null }
})

async function save() {
  let parsed
  try { parsed = parseStory(text.value) } catch (e) { error.value = e.message; return }
  const record = { ...parsed, raw: text.value.trim() }
  if (props.story) {
    await db.stories.update(props.story.id, record)
    toast('Story saved')
    emit('saved', props.story.id)
  } else {
    const id = await db.stories.add({ ...record, createdAt: new Date(), readAt: null })
    toast(`Added "${parsed.title}"`)
    emit('saved', id)
  }
  emit('close')
}
</script>

<template>
  <Modal :open="open" :title="story ? 'Edit story' : 'Add a story'" wide @close="emit('close')">
    <div class="space-y-3">
      <p class="text-sm text-ink/65">
        Paste a chapter in this format. Write furigana as <code class="rounded bg-sora px-1 text-xs">漢字{かんじ}</code>.
        Only the <code class="rounded bg-sora px-1 text-xs">[story]</code> part is required.
      </p>
      <textarea ref="box" v-model="text" rows="12" class="input font-mono text-xs" :placeholder="EXAMPLE" @input="error = ''" />
      <button v-if="!text" type="button" class="text-xs text-ink/55 underline" @click="text = EXAMPLE">Fill in the example</button>
      <p v-if="error" class="text-sm text-shu">{{ error }}</p>
      <p v-else-if="preview" class="text-xs text-ink/55">
        <b class="text-ink">{{ preview.title }}</b> · {{ preview.level }} · {{ preview.questions.length }} questions{{ preview.translation ? ' · translation' : '' }}
      </p>
      <div class="flex justify-end gap-2 border-t border-ink/8 pt-4">
        <button class="btn-ghost" @click="emit('close')">Cancel</button>
        <button class="btn-primary" :disabled="!text.trim()" @click="save">{{ story ? 'Save changes' : 'Add story' }}</button>
      </div>
    </div>
  </Modal>
</template>
