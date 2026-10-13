<script setup>
import { watch, onUnmounted } from 'vue'

const props = defineProps({ open: Boolean, title: String, wide: Boolean })
const emit = defineEmits(['close'])

function onKey(e) { if (e.key === 'Escape') emit('close') }
watch(() => props.open, v => {
  if (v) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
}, { immediate: true })
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-40 flex items-end justify-center bg-ink/35 backdrop-blur-[2px] sm:items-center sm:p-4" @mousedown.self="emit('close')">
        <div class="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border-t-4 border-sakura bg-washi p-6 shadow-2xl sm:rounded-3xl" :class="wide ? 'sm:max-w-2xl' : 'sm:max-w-md'">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-xl font-bold">{{ title }}</h2>
            <button class="-mr-2 rounded-full p-2 text-ink/40 hover:bg-sora hover:text-ink" aria-label="Close" @click="emit('close')">✕</button>
          </div>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
