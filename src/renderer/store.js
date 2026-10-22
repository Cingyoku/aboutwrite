import { reactive, watch } from 'vue'
import { storage } from './storage'

export const uid = () =>
  globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)

function normalize(raw) {
  const d = raw && typeof raw === 'object' ? raw : {}
  const articles = Array.isArray(d.articles) ? d.articles : []
  for (const a of articles) {
    a.id ||= uid()
    a.title ||= '未命名文章'
    a.content ||= ''
    a.createdAt ||= Date.now()
    a.updatedAt ||= Date.now()
    a.children ||= []
    for (const c of a.children) {
      c.id ||= uid()
      if (c.type === 'timeline') {
        c.title ||= '时间轴'
        c.segments ||= []
        for (const s of c.segments) {
          s.id ||= uid()
          s.time ||= ''
          s.event ||= ''
          s.docLinks ||= []
          s.personLinks ||= []
        }
      } else if (c.type === 'relations') {
        c.title ||= '人物关系'
        c.persons ||= []
        c.edges ||= []
        for (const p of c.persons) {
          p.id ||= uid()
          p.name ||= ''
          p.note ||= ''
          if (typeof p.x !== 'number') p.x = 100
          if (typeof p.y !== 'number') p.y = 100
        }
        for (const e of c.edges) {
          e.id ||= uid()
          e.label ||= ''
        }
      } else {
        c.type = 'doc'
        c.title ||= '独立文档'
        c.content ||= ''
      }
    }
  }
  return { articles }
}

function cleanDocReferences(article, docId) {
  for (const c of article.children) {
    if (c.type !== 'timeline') continue
    for (const s of c.segments) s.docLinks = s.docLinks.filter((id) => id !== docId)
  }
}

function cleanRelationsReferences(article, relationsId) {
  for (const c of article.children) {
    if (c.type !== 'timeline') continue
    for (const s of c.segments) s.personLinks = s.personLinks.filter((l) => l.relationsId !== relationsId)
  }
}

function cleanPersonReferences(article, personId) {
  for (const c of article.children) {
    if (c.type !== 'timeline') continue
    for (const s of c.segments) s.personLinks = s.personLinks.filter((l) => l.personId !== personId)
  }
}

let saveTimer = null
function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    storage.save(JSON.parse(JSON.stringify(store.data)))
  }, 300)
}

export const store = reactive({
  ready: false,
  loadError: false,
  view: 'list',
  currentArticleId: null,
  data: { articles: [] },
  focus: null,

  async init() {
    try {
      const raw = await storage.load()
      this.data = normalize(raw)
    } catch (err) {
      console.error('[store] init failed:', err)
      this.loadError = true
      this.data = normalize(null)
    }
    this.ready = true
  },

  get current() {
    return this.data.articles.find((a) => a.id === this.currentArticleId) || null
  },

  createArticle(title) {
    const now = Date.now()
    const article = { id: uid(), title, content: '', createdAt: now, updatedAt: now, children: [] }
    this.data.articles.unshift(article)
    this.openArticle(article.id)
    return article
  },

  deleteArticle(id) {
    const idx = this.data.articles.findIndex((a) => a.id === id)
    if (idx >= 0) this.data.articles.splice(idx, 1)
  },

  openArticle(id) {
    this.currentArticleId = id
    this.focus = null
    this.view = 'workspace'
  },

  back() {
    this.currentArticleId = null
    this.focus = null
    this.view = 'list'
  },

  addChild(articleId, type, title) {
    const a = this.data.articles.find((x) => x.id === articleId)
    if (!a) return null
    const base = { doc: '独立文档', timeline: '时间轴', relations: '人物关系' }[type] || '子项目'
    const child = { id: uid(), type, title: title || base }
    if (type === 'doc') child.content = ''
    if (type === 'timeline') child.segments = []
    if (type === 'relations') {
      child.persons = []
      child.edges = []
    }
    a.children.push(child)
    a.updatedAt = Date.now()
    return child
  },

  removeChild(articleId, childId) {
    const a = this.data.articles.find((x) => x.id === articleId)
    if (!a) return
    const idx = a.children.findIndex((c) => c.id === childId)
    if (idx < 0) return
    const child = a.children[idx]
    a.children.splice(idx, 1)
    if (child.type === 'doc') cleanDocReferences(a, childId)
    if (child.type === 'relations') cleanRelationsReferences(a, childId)
  },

  childById(article, childId) {
    return article?.children.find((c) => c.id === childId) || null
  },

  addSegment(articleId, timelineId) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const tl = a?.children.find((c) => c.id === timelineId)
    if (!tl) return null
    const seg = { id: uid(), time: '', event: '', docLinks: [], personLinks: [] }
    tl.segments.push(seg)
    return seg
  },

  updateSegment(articleId, timelineId, segmentId, patch) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const tl = a?.children.find((c) => c.id === timelineId)
    const seg = tl?.segments.find((s) => s.id === segmentId)
    if (!seg) return
    if (typeof patch.time === 'string') seg.time = patch.time
    if (typeof patch.event === 'string') seg.event = patch.event
  },

  removeSegment(articleId, timelineId, segmentId) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const tl = a?.children.find((c) => c.id === timelineId)
    if (!tl) return
    const idx = tl.segments.findIndex((s) => s.id === segmentId)
    if (idx >= 0) tl.segments.splice(idx, 1)
  },

  moveSegment(articleId, timelineId, from, to) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const tl = a?.children.find((c) => c.id === timelineId)
    if (!tl || from === to) return
    if (from < 0 || from >= tl.segments.length) return
    const [item] = tl.segments.splice(from, 1)
    tl.segments.splice(Math.max(0, Math.min(to, tl.segments.length)), 0, item)
  },

  addDocLink(articleId, timelineId, segmentId, docId) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const tl = a?.children.find((c) => c.id === timelineId)
    const seg = tl?.segments.find((s) => s.id === segmentId)
    if (!seg || seg.docLinks.includes(docId)) return
    seg.docLinks.push(docId)
  },

  removeDocLink(articleId, timelineId, segmentId, index) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const tl = a?.children.find((c) => c.id === timelineId)
    const seg = tl?.segments.find((s) => s.id === segmentId)
    if (!seg) return
    seg.docLinks.splice(index, 1)
  },

  addPersonLink(articleId, timelineId, segmentId, relationsId, personId) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const tl = a?.children.find((c) => c.id === timelineId)
    const seg = tl?.segments.find((s) => s.id === segmentId)
    if (!seg) return
    const exists = seg.personLinks.some((l) => l.relationsId === relationsId && (l.personId || null) === (personId || null))
    if (exists) return
    seg.personLinks.push({ relationsId, personId: personId || null })
  },

  removePersonLink(articleId, timelineId, segmentId, index) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const tl = a?.children.find((c) => c.id === timelineId)
    const seg = tl?.segments.find((s) => s.id === segmentId)
    if (!seg) return
    seg.personLinks.splice(index, 1)
  },

  addPerson(articleId, relationsId, name) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const rel = a?.children.find((c) => c.id === relationsId)
    if (!rel) return null
    const i = rel.persons.length
    const p = { id: uid(), name, note: '', x: 70 + (i % 7) * 78, y: 55 + Math.floor(i / 7) * 100 }
    rel.persons.push(p)
    return p
  },

  updatePerson(articleId, relationsId, personId, patch) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const rel = a?.children.find((c) => c.id === relationsId)
    const p = rel?.persons.find((x) => x.id === personId)
    if (!p) return
    if (typeof patch.name === 'string') p.name = patch.name
    if (typeof patch.note === 'string') p.note = patch.note
  },

  removePerson(articleId, relationsId, personId) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const rel = a?.children.find((c) => c.id === relationsId)
    if (!rel) return
    const idx = rel.persons.findIndex((p) => p.id === personId)
    if (idx < 0) return
    rel.persons.splice(idx, 1)
    rel.edges = rel.edges.filter((e) => e.from !== personId && e.to !== personId)
    cleanPersonReferences(a, personId)
  },

  addEdge(articleId, relationsId, fromId, toId, label) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const rel = a?.children.find((c) => c.id === relationsId)
    if (!rel || fromId === toId) return
    const e = { id: uid(), from: fromId, to: toId, label }
    rel.edges.push(e)
    return e
  },

  updateEdge(articleId, relationsId, edgeId, label) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const rel = a?.children.find((c) => c.id === relationsId)
    const e = rel?.edges.find((x) => x.id === edgeId)
    if (!e) return
    e.label = label
  },

  removeEdge(articleId, relationsId, edgeId) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const rel = a?.children.find((c) => c.id === relationsId)
    if (!rel) return
    const idx = rel.edges.findIndex((e) => e.id === edgeId)
    if (idx >= 0) rel.edges.splice(idx, 1)
  },

  focusChild(childId, personId = null) {
    this.focus = { childId, personId, ts: Date.now() }
  }
})

watch(() => store.data, scheduleSave, { deep: true })

window.addEventListener('beforeunload', () => {
  if (store.ready) storage.save(JSON.parse(JSON.stringify(store.data)))
})
