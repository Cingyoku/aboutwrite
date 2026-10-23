<script setup>
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  fontSize: { type: Number, default: 16 },
  indent: { type: Boolean, default: true },
  placeholder: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])

const el = ref(null)

function onInput() {
  emit('update:modelValue', el.value.innerHTML)
}

watch(
  () => props.modelValue,
  (nv) => {
    if (el.value && nv !== el.value.innerHTML) el.value.innerHTML = nv || ''
  }
)

onMounted(() => {
  try {
    document.execCommand('defaultParagraphSeparator', false, 'p')
  } catch (err) {
    /* noop */
  }
  el.value.innerHTML = props.modelValue || ''
})
</script>

<template>
  <div
    ref="el"
    class="rich-editor"
    :class="{ 'indent-on': indent }"
    :style="{ fontSize: fontSize + 'px' }"
    contenteditable="true"
    :data-placeholder="placeholder"
    @input="onInput"
  ></div>
</template>

<style scoped>
.rich-editor {
  width: 100%;
  min-height: 220px;
  max-height: 480px;
  overflow-y: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
  line-height: 1.85;
  outline: none;
  word-break: break-word;
}
.rich-editor:focus { border-color: var(--accent); }
.rich-editor p { margin: 0; }
.rich-editor.indent-on p { text-indent: 2em; }
.rich-editor:empty::before { content: attr(data-placeholder); color: var(--muted); }
</style>
