<script setup>
import { ref, reactive, computed, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db, useLive } from '../lib/db'
import { tokens, spoken, paragraphs } from '../lib/story'
import { toast, ask } from '../lib/ui'
import StoryModal from '../components/StoryModal.vue'

const route = useRoute()
const router = useRouter()
const id = Number(route.params.id)

const data = useLive(async () => {
  const story = await db.stories.get(id)
  if (!story) return { story: null }
  const same = (await db.stories.where('level').equals(story.level).toArray()).sort((a, b) => a.id - b.id)
  const i = same.findIndex(s => s.id === id)
  return { story, number: i + 1, prev: same[i - 1] || null, next: same[i + 1] || null }
}, null)
const story = computed(() => data.value?.story)
const paras = computed(() => (story.value ? paragraphs(story.value.body).map(p => p.map(tokens)) : []))

// ---- Furigana: all on, or tap a word to show just that one. All-on is remembered on this device. ----
let savedFuri = false
try { savedFuri = localStorage.getItem('furigana') === '1' } catch {}
const furigana = ref(savedFuri)
function toggleFurigana() {
  furigana.value = !furigana.value
  try { localStorage.setItem('furigana', furigana.value ? '1' : '0') } catch {}
}
const shown = reactive(new Set())
const flip = key => (shown.has(key) ? shown.delete(key) : shown.add(key))

// ---- Read aloud (phone's Japanese voice), one sentence at a time ----
const canSpeak = ref(false)
const speaking = ref(false)
let voice = null
function loadVoices() {
  voice = speechSynthesis.getVoices().find(v => v.lang?.toLowerCase().startsWith('ja')) || null
  canSpeak.value = !!voice
}
if ('speechSynthesis' in window) {
  loadVoices()
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices)
}
function readAloud() {
  if (speaking.value) { speechSynthesis.cancel(); speaking.value = false; return }
  const sentences = spoken(story.value.body).replace(/\n+/g, '。').split(/(?<=[。！？!?])/).map(s => s.trim()).filter(s => s.replace(/[。「」、]/g, ''))
  speechSynthesis.cancel()
  speaking.value = true
  sentences.forEach((s, i) => {
    const u = new SpeechSynthesisUtterance(s)
    u.lang = 'ja-JP'
    u.voice = voice
    u.rate = 0.9
    if (i === sentences.length - 1) u.onend = () => { speaking.value = false }
    speechSynthesis.speak(u)
  })
}
onUnmounted(() => canSpeak.value && speechSynthesis.cancel())

// ---- Questions, translation, done ----
const answers = reactive(new Set())
const showTranslation = ref(false)

async function toggleRead() {
  const done = !story.value.readAt
  await db.stories.update(id, { readAt: done ? new Date() : null })
  if (done) toast('Marked as read')
}

const editing = ref(false)
async function remove() {
  const ok = await ask({ title: `Delete "${story.value.title}"?`, message: "This removes the story from this device.", confirmText: 'Delete story', danger: true })
  if (!ok) return
  await db.stories.delete(id)
  toast('Story deleted')
  router.push('/reading')
}
</script>

<template>
  <div v-if="data && !story" class="panel text-center">
    <p class="text-ink/65">This story doesn't exist anymore.</p>
    <RouterLink to="/reading" class="btn-primary mt-4">Back to Reading</RouterLink>
  </div>

  <div v-else-if="story" class="mx-auto max-w-2xl">
    <StoryModal :open="editing" :story="story" @close="editing = false" />

    <!-- Top bar -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <RouterLink to="/reading" class="mr-auto text-sm font-bold text-ink/55 hover:text-ink">← Reading</RouterLink>
      <button
        class="rounded-full px-3 py-1.5 text-xs font-bold transition"
        :class="furigana ? 'bg-sakura text-ink' : 'bg-white/60 text-ink/55'"
        :aria-pressed="furigana" @click="toggleFurigana"
      >ふりがな {{ furigana ? 'on' : 'off' }}</button>
      <button v-if="canSpeak" class="rounded-full bg-white/60 px-3 py-1.5 text-xs font-bold text-ink/70 hover:text-ink" @click="readAloud">
        {{ speaking ? '■ Stop' : '🔊 Read aloud' }}
      </button>
    </div>

    <!-- Story -->
    <article class="panel !px-5 !py-6 sm:!px-8">
      <p class="label !text-xs">{{ story.level }} · Chapter {{ data.number }}</p>
      <h1 class="mt-1 font-jp text-2xl font-semibold sm:text-3xl">{{ story.title }}</h1>
      <p v-if="!furigana" class="mt-1 text-xs text-ink/45">Tap a kanji word to see its reading.</p>

      <div class="mt-5 space-y-5 font-jp text-xl leading-[2.4] sm:text-2xl">
        <p v-for="(para, pi) in paras" :key="pi">
          <template v-for="(line, li) in para" :key="li">
            <br v-if="li > 0" />
            <template v-for="(t, ti) in line" :key="ti">
              <ruby
                v-if="t.reading"
                class="cursor-pointer rounded decoration-sakura decoration-2 underline-offset-[6px] hover:bg-sakura-soft"
                :class="!furigana && !shown.has(`${pi}-${li}-${ti}`) && 'underline decoration-dotted'"
                @click="flip(`${pi}-${li}-${ti}`)"
              >{{ t.text }}<rt class="text-[0.5em] text-shu" :class="!(furigana || shown.has(`${pi}-${li}-${ti}`)) && 'invisible'">{{ t.reading }}</rt></ruby>
              <template v-else>{{ t.text }}</template>
            </template>
          </template>
        </p>
      </div>
    </article>

    <!-- Questions -->
    <section v-if="story.questions.length" class="panel mt-4">
      <h2 class="mb-3 text-lg font-bold">Questions</h2>
      <ol class="space-y-3">
        <li v-for="(q, i) in story.questions" :key="i" class="rounded-2xl bg-sora/50 p-3">
          <p class="font-jp text-lg">
            {{ i + 1 }}.
            <ruby v-for="(t, ti) in tokens(q.q)" :key="ti">{{ t.text }}<rt v-if="t.reading" class="text-[0.5em] text-shu" :class="!furigana && 'invisible'">{{ t.reading }}</rt></ruby>
          </p>
          <p v-if="answers.has(i)" class="mt-2 font-jp text-matcha">
            → <ruby v-for="(t, ti) in tokens(q.a)" :key="ti">{{ t.text }}<rt v-if="t.reading" class="text-[0.5em]">{{ t.reading }}</rt></ruby>
          </p>
          <button v-else-if="q.a" class="mt-2 text-xs font-bold text-ink/55 underline hover:text-ink" @click="answers.add(i)">Show answer</button>
        </li>
      </ol>
    </section>

    <!-- Translation -->
    <section v-if="story.translation" class="panel mt-4">
      <button class="flex w-full items-center justify-between text-left" :aria-expanded="showTranslation" @click="showTranslation = !showTranslation">
        <span class="text-lg font-bold">Translation</span>
        <span class="text-sm font-bold text-ink/55">{{ showTranslation ? 'Hide' : 'Show' }}</span>
      </button>
      <p v-if="showTranslation" class="mt-3 whitespace-pre-line text-ink/80">{{ story.translation }}</p>
    </section>

    <!-- Done + navigation -->
    <div class="mt-5 flex flex-wrap items-center gap-2">
      <button :class="story.readAt ? 'btn-ghost' : 'btn-primary'" @click="toggleRead">
        {{ story.readAt ? '✓ Read' : 'Mark as read' }}
      </button>
      <button class="btn-ghost" @click="editing = true">Edit</button>
      <button class="btn-danger mr-auto" @click="remove">Delete</button>
      <RouterLink v-if="data.prev" :to="`/reading/${data.prev.id}`" class="btn-ghost">← Prev</RouterLink>
      <RouterLink v-if="data.next" :to="`/reading/${data.next.id}`" class="btn-primary">Next chapter →</RouterLink>
    </div>
  </div>
</template>
