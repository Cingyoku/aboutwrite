<script setup>
import { computed } from 'vue'

const props = defineProps({
  article: { type: Object, required: true },
  mode: { type: String, required: true } // 'doc' | 'person'
})

const emit = defineEmits(['close', 'pick-doc', 'pick-person'])

const docs = computed(() => props.article.children.filter((c) => c.type === 'doc'))
const relations = computed(() => props.article.children.filter((c) => c.type === 'relations'))

function pickDoc(doc) {
  emit('pick-doc', doc.id)
}

function pickPerson(rel, personId) {
  emit('pick-person', rel.id, personId)
}
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <h3 v-if="mode === 'doc'">关联独立文档</h3>
      <h3 v-else>关联人物关系</h3>

      <template v-if="mode === 'doc'">
        <div v-if="docs.length === 0" class="col-empty">当前文章下还没有独立文档，请先在左侧列新建。</div>
        <div
          v-for="d in docs"
          :key="d.id"
          class="pick-item"
          @click="pickDoc(d)"
        >
          {{ d.title }}
          <div class="pick-sub" v-if="d.content">{{ d.content.slice(0, 40) }}</div>
        </div>
      </template>

      <template v-else>
        <div v-if="relations.length === 0" class="col-empty">当前文章下还没有人物关系，请先在中间列新建。</div>
        <div v-for="r in relations" :key="r.id">
          <div class="pick-group">{{ r.title }}（{{ r.persons.length }} 个人物）</div>
          <div class="pick-item" style="margin-bottom: 6px" @click="pickPerson(r, null)">
            整个关系图「{{ r.title }}」
          </div>
          <div
            v-for="p in r.persons"
            :key="p.id"
            class="pick-item"
            style="margin-bottom: 6px"
            @click="pickPerson(r, p.id)"
          >
            {{ p.name || '（未命名）' }}
            <div class="pick-sub" v-if="p.note">{{ p.note }}</div>
          </div>
        </div>
      </template>

      <div class="modal-foot">
        <button class="btn small" @click="emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>
