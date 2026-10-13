<script setup>
import { ref, watch, nextTick } from "vue";
import { ui, dismiss } from "../lib/ui";
import Modal from "./Modal.vue";

const typed = ref("");
const confirmBtn = ref(null);
watch(
  () => ui.confirm,
  async (c) => {
    typed.value = "";
    if (c && !c.typeToConfirm) {
      await nextTick();
      confirmBtn.value?.focus();
    }
  }
);

function act(t) {
  t.onAction?.();
  dismiss(t.id);
}
</script>

<template>
  <!-- Confirm dialog -->
  <Modal
    :open="!!ui.confirm"
    :title="ui.confirm?.title"
    @close="ui.confirm?.resolve(false)"
  >
    <template v-if="ui.confirm">
      <p class="text-sm text-ink/65">{{ ui.confirm.message }}</p>
      <div v-if="ui.confirm.typeToConfirm" class="mt-4">
        <label class="text-sm text-ink/65"
          >Type <b>{{ ui.confirm.typeToConfirm }}</b> to confirm</label
        >
        <input v-model="typed" class="input mt-1" autofocus />
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <button class="btn-ghost" @click="ui.confirm.resolve(false)">
          Cancel
        </button>
        <button
          ref="confirmBtn"
          :class="ui.confirm.danger ? 'btn-red' : 'btn-primary'"
          :disabled="
            !!ui.confirm.typeToConfirm && typed !== ui.confirm.typeToConfirm
          "
          @click="ui.confirm.resolve(true)"
        >
          {{ ui.confirm.confirmText }}
        </button>
      </div>
    </template>
  </Modal>

  <!-- Toasts -->
  <div
    class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
  >
    <TransitionGroup name="fade">
      <div
        v-for="t in ui.toasts"
        :key="t.id"
        class="pointer-events-auto flex items-center gap-4 rounded-full bg-ink px-5 py-3 font-medium text-sm text-white shadow-lg"
      >
        <span>{{ t.message }}</span>
        <button
          v-if="t.action"
          class="font-semibold text-sakura hover:underline"
          @click="act(t)"
        >
          {{ t.action }}
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
