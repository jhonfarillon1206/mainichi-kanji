import { reactive } from 'vue'

// App-wide toasts and confirm dialog (replaces browser alert/confirm).
export const ui = reactive({ toasts: [], confirm: null })

let nextId = 0

export function toast(message, { action, onAction, timeout = 4000 } = {}) {
  const id = ++nextId
  ui.toasts.push({ id, message, action, onAction })
  setTimeout(() => dismiss(id), timeout)
}

export function dismiss(id) {
  const i = ui.toasts.findIndex(t => t.id === id)
  if (i >= 0) ui.toasts.splice(i, 1)
}

// Resolves true/false. typeToConfirm makes the user type a word first.
export function ask({ title, message = '', confirmText = 'Confirm', danger = false, typeToConfirm = '' }) {
  return new Promise(resolve => {
    ui.confirm = {
      title, message, confirmText, danger, typeToConfirm,
      resolve: v => { ui.confirm = null; resolve(v) }
    }
  })
}
