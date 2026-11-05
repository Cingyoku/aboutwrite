<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  article: { type: Object, required: true },
  mode: { type: String, required: true } // 'doc' | 'person'
})

const emit = defineEmits(['close', 'pick-doc', 'pick-person'])

const docs = computed(() => props.article.children.filter((c) => c.type === 'doc'))
const relations = computed(() => props.article.children.filter((c) => c.type === 'relations'))

const query = ref('')

const matchedRelations = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return relations.value
  return relations.value
    .map((r) => {
      const hit = (r.title || '').toLowerCase().includes(q)
      const persons = r.persons.filter(
        (p) => hit || (p.name || '').toLowerCase().includes(q) || (p.note || '').toLowerCase().includes(q)
      )
      return persons.length || hit ? { ...r, persons } : null
    })
    .filter(Boolean)
})

function preview(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, 40)
}

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
      <h3 v-if="mode === 'doc'">关联章节</h3>
      <h3 v-else>关联人物关系</h3>

      <template v-if="mode === 'doc'">
        <div v-if="docs.length === 0" class="col-empty">当前文章下还没有章节，请先在章节列新建。</div>
        <div
          v-for="d in docs"
          :key="d.id"
          class="pick-item"
          @click="pickDoc(d)"
        >
          {{ d.title }}
          <div class="pick-sub" v-if="d.content">{{ preview(d.content) }}</div>
        </div>
      </template>

      <template v-else>
        <input v-model="query" class="pick-search" placeholder="搜索人物名称 / 备注 / 关系图标题" />
        <div v-if="matchedRelations.length === 0" class="col-empty">没有匹配的人物或关系图。</div>
        <div v-for="r in matchedRelations" :key="r.id">
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
