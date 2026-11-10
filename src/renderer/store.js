import { reactive, watch } from 'vue'
import { storage } from './storage'

export const uid = () =>
  globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)

export const FONT_SIZES = [12, 14, 16, 18, 20, 22, 24]

// 日期键：YYYY-MM-DD（本地时区）
export function dateKey(ts = Date.now()) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const FACTION_COLORS = [
  '#e05d5d',
  '#e08a3c',
  '#3ca46a',
  '#3c7de0',
  '#8a5de0',
  '#d45db3',
  '#5db8d4',
  '#8a9440'
]

let decodeEl = null
function decodeEntities(s) {
  if (typeof document === 'undefined') return s
  if (!decodeEl) decodeEl = document.createElement('textarea')
  decodeEl.innerHTML = s
  return decodeEl.value
}

export function countWords(html) {
  const stripped = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
  const text = decodeEntities(stripped)
  const words = (text.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).length
  // 汉字与日语假名均按单字计数（假名含平假名、片假名、半角片假名、片假名扩展及「々」）
  const cjk = (text.match(/[\u3005\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/g) || []).length
  return words + cjk
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function migrateDocContent(c) {
  if (c.rich) return
  const raw = typeof c.content === 'string' ? c.content : ''
  c.content = raw
    .split(/\r\n|\r|\n/)
    .map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`)
    .join('')
  c.rich = true
}

function normalize(raw) {
  const d = raw && typeof raw === 'object' ? raw : {}
  const articles = Array.isArray(d.articles) ? d.articles : []
  const inspirations = Array.isArray(d.inspirations) ? d.inspirations : []
  for (const i of inspirations) {
    i.id ||= uid()
    i.title ||= '未命名灵感'
    i.content ||= ''
    i.createdAt ||= Date.now()
    i.updatedAt ||= Date.now()
  }
  for (const a of articles) {
    a.id ||= uid()
    a.title ||= '未命名文章'
    a.content ||= ''
    a.createdAt ||= Date.now()
    a.updatedAt ||= Date.now()
    a.children ||= []
    if (!a.docFormat || typeof a.docFormat !== 'object') a.docFormat = {}
    if (typeof a.docFormat.indent !== 'boolean') a.docFormat.indent = true
    if (!FONT_SIZES.includes(a.docFormat.fontSize)) a.docFormat.fontSize = 16
    for (const c of a.children) {
      c.id ||= uid()
      if (c.type === 'timeline') {
        c.title ||= '时间轴'
        c.segments ||= []
        for (const s of c.segments) {
          s.id ||= uid()
          s.time ||= ''
          s.event ||= ''
          s.desc ||= ''
          if (typeof s.descHidden !== 'boolean') s.descHidden = false
          s.docLinks ||= []
          s.personLinks ||= []
        }
      } else if (c.type === 'relations') {
        c.title ||= '人物关系'
        c.persons ||= []
        c.edges ||= []
        c.factions ||= []
        for (const p of c.persons) {
          p.id ||= uid()
          p.name ||= ''
          p.note ||= ''
          p.bio ||= ''
          if (!Array.isArray(p.factionIds)) p.factionIds = p.factionId ? [p.factionId] : []
          p.factionIds = p.factionIds.filter((fid) => typeof fid === 'string')
          p.factionId = p.factionIds[0] || null
          if (typeof p.x !== 'number') p.x = 100
          if (typeof p.y !== 'number') p.y = 100
        }
        for (const f of c.factions) {
          f.id ||= uid()
          f.name ||= ''
          f.desc ||= ''
          if (!FACTION_COLORS.includes(f.color)) f.color = FACTION_COLORS[0]
        }
        for (const e of c.edges) {
          e.id ||= uid()
          e.label ||= ''
          delete e.bend
        }
      } else {
        c.type = 'doc'
        c.title ||= '章节'
        c.content ||= ''
        migrateDocContent(c)
      }
    }
  }
  const stats = d.stats && typeof d.stats === 'object' ? d.stats : {}
  stats.words = stats.words && typeof stats.words === 'object' ? stats.words : {}
  stats.duration = stats.duration && typeof stats.duration === 'object' ? stats.duration : {}
  if (typeof stats.totalWordsSnapshot !== 'number') stats.totalWordsSnapshot = -1
  if (
    !stats.dayStart ||
    typeof stats.dayStart !== 'object' ||
    typeof stats.dayStart.date !== 'string' ||
    typeof stats.dayStart.total !== 'number'
  ) {
    stats.dayStart = null
  }
  return { articles, inspirations, stats }
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
  currentInspirationId: null,
  data: { articles: [], inspirations: [], stats: { words: {}, duration: {}, totalWordsSnapshot: -1 } },
  focus: null,
  // 列头「居中视图」信号：自增触发所有人物关系画布重新居中
  relFitTick: 0,
  // 列头时间轴「新建」信号：指向需要追加文段的时间轴
  segFocus: null,
  // 最近一次章节编辑输入时间，用于统计码字时长
  _lastInput: 0,

  markWritingActivity() {
    this._lastInput = Date.now()
  },

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
    const article = {
      id: uid(),
      title,
      content: '',
      createdAt: now,
      updatedAt: now,
      children: [],
      docFormat: { indent: true, fontSize: 16 }
    }
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
    this.currentInspirationId = null
    this.focus = null
    this.view = 'list'
  },

  get currentInspiration() {
    return (this.data.inspirations || []).find((i) => i.id === this.currentInspirationId) || null
  },

  createInspiration(title) {
    if (!Array.isArray(this.data.inspirations)) this.data.inspirations = []
    const now = Date.now()
    const insp = { id: uid(), title: title || '未命名灵感', content: '', createdAt: now, updatedAt: now }
    this.data.inspirations.unshift(insp)
    return insp
  },

  openInspiration(id) {
    this.currentInspirationId = id
    this.view = 'inspiration'
  },

  deleteInspiration(id) {
    const list = this.data.inspirations || []
    const idx = list.findIndex((i) => i.id === id)
    if (idx >= 0) list.splice(idx, 1)
    if (this.currentInspirationId === id) {
      this.currentInspirationId = null
      this.view = 'list'
    }
  },

  addChild(articleId, type, title) {
    const a = this.data.articles.find((x) => x.id === articleId)
    if (!a) return null
    const base = { doc: '章节', timeline: '时间轴', relations: '人物关系' }[type] || '子项目'
    const child = { id: uid(), type, title: title || base }
    if (type === 'doc') {
      child.content = ''
      child.rich = true
    }
    if (type === 'timeline') child.segments = []
    if (type === 'relations') {
      child.persons = []
      child.edges = []
      child.factions = []
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

  updateDocFormat(articleId, patch) {
    const a = this.data.articles.find((x) => x.id === articleId)
    if (!a) return
    if (typeof patch.indent === 'boolean') a.docFormat.indent = patch.indent
    if (FONT_SIZES.includes(patch.fontSize)) a.docFormat.fontSize = patch.fontSize
  },

  addSegment(articleId, timelineId) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const tl = a?.children.find((c) => c.id === timelineId)
    if (!tl) return null
    const seg = { id: uid(), time: '', event: '', desc: '', descHidden: false, docLinks: [], personLinks: [] }
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
    if (typeof patch.desc === 'string') seg.desc = patch.desc
    if (typeof patch.descHidden === 'boolean') seg.descHidden = patch.descHidden
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
    const p = { id: uid(), name, note: '', bio: '', factionIds: [], factionId: null, x: 70 + (i % 7) * 78, y: 55 + Math.floor(i / 7) * 100 }
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
    if (typeof patch.bio === 'string') p.bio = patch.bio
    if (Array.isArray(patch.factionIds)) {
      const valid = new Set(rel.factions.map((f) => f.id))
      p.factionIds = patch.factionIds.filter((fid) => valid.has(fid))
      p.factionId = p.factionIds[0] || null
    } else if (patch.factionId === null || typeof patch.factionId === 'string') {
      p.factionIds = patch.factionId ? [patch.factionId] : []
      p.factionId = patch.factionId
    }
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

  addFaction(articleId, relationsId, name) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const rel = a?.children.find((c) => c.id === relationsId)
    if (!rel) return null
    const f = {
      id: uid(),
      name: name || '未命名阵营',
      desc: '',
      color: FACTION_COLORS[rel.factions.length % FACTION_COLORS.length]
    }
    rel.factions.push(f)
    return f
  },

  updateFaction(articleId, relationsId, factionId, patch) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const rel = a?.children.find((c) => c.id === relationsId)
    const f = rel?.factions.find((x) => x.id === factionId)
    if (!f) return
    if (typeof patch.name === 'string') f.name = patch.name
    if (typeof patch.desc === 'string') f.desc = patch.desc
    if (FACTION_COLORS.includes(patch.color)) f.color = patch.color
  },

  removeFaction(articleId, relationsId, factionId) {
    const a = this.data.articles.find((x) => x.id === articleId)
    const rel = a?.children.find((c) => c.id === relationsId)
    if (!rel) return
    const idx = rel.factions.findIndex((f) => f.id === factionId)
    if (idx < 0) return
    rel.factions.splice(idx, 1)
    for (const p of rel.persons) {
      p.factionIds = p.factionIds.filter((fid) => fid !== factionId)
      p.factionId = p.factionIds[0] || null
    }
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

  focusChild(childId, personId = null, segId = null) {
    this.focus = { childId, personId, segId, ts: Date.now() }
  },

  // 用备份 JSON 整体替换当前数据
  replaceAll(raw) {
    this.data = normalize(raw)
    this.back()
  },

  // 合并导入备份：仅修正备份涉及的内容——文章 / 灵感按备份版本覆盖（同 id）并补入备份独有的项，
  // 同 id 文章内的章节等子项目同样按 id 覆盖 / 补入；
  // 备份之外（导出后新增）的文章、灵感与子项目保持不变，统计与码字记录沿用当前数据
  mergeBackup(raw) {
    const incoming = normalize(raw)
    const keepNew = (cur, inc) => {
      const incIds = new Set(inc.map((x) => x.id))
      return cur.filter((x) => !incIds.has(x.id))
    }
    const curAById = new Map(this.data.articles.map((x) => [x.id, x]))
    const articles = incoming.articles.map((inc) => {
      const cur = curAById.get(inc.id)
      if (!cur) return inc
      return { ...inc, children: [...inc.children, ...keepNew(cur.children, inc.children)] }
    })
    articles.push(...keepNew(this.data.articles, incoming.articles))
    this.data = {
      ...this.data,
      articles,
      inspirations: [...incoming.inspirations, ...keepNew(this.data.inspirations, incoming.inspirations)]
    }
    this.back()
  },

  // 导入人物关系：{ persons: [{name, note, bio, factions:[名称]}], edges: [{from,to,label}] }（名称均为文本）
  importRelations(articleId, data, title = '导入的人物关系') {
    const a = this.data.articles.find((x) => x.id === articleId)
    if (!a) return null
    const child = { id: uid(), type: 'relations', title, persons: [], edges: [], factions: [] }
    const factionByName = new Map()
    let fi = 0
    for (const p of data.persons) {
      for (const fname of p.factions) {
        if (!fname || factionByName.has(fname)) continue
        const f = { id: uid(), name: fname, desc: '', color: FACTION_COLORS[fi++ % FACTION_COLORS.length] }
        child.factions.push(f)
        factionByName.set(fname, f.id)
      }
    }
    const personByName = new Map()
    let i = 0
    for (const p of data.persons) {
      if (!p.name || personByName.has(p.name)) continue
      const factionIds = p.factions.map((n) => factionByName.get(n)).filter(Boolean)
      const person = {
        id: uid(),
        name: p.name,
        note: p.note || '',
        bio: p.bio || '',
        factionIds,
        factionId: factionIds[0] || null,
        x: 70 + (i % 7) * 78,
        y: 55 + Math.floor(i / 7) * 100
      }
      child.persons.push(person)
      personByName.set(p.name, person.id)
      i++
    }
    for (const e of data.edges) {
      const from = personByName.get(e.from)
      const to = personByName.get(e.to)
      if (!from || !to || from === to) continue
      child.edges.push({ id: uid(), from, to, label: e.label || '' })
    }
    a.children.push(child)
    a.updatedAt = Date.now()
    return child
  },

  // 导入时间轴：[{ title, segments: [{time,event,desc,docs:[章节标题],persons:['关系图 / 人物名'|'关系图']}] }]
  importTimeline(articleId, groups, baseTitle = '导入的时间轴') {
    const a = this.data.articles.find((x) => x.id === articleId)
    if (!a || !groups.length) return []
    const docByName = new Map(a.children.filter((c) => c.type === 'doc').map((c) => [c.title, c.id]))
    const created = []
    for (const g of groups) {
      const title = groups.length === 1 && g.title === '导入的时间轴' ? baseTitle : g.title
      const tl = { id: uid(), type: 'timeline', title, segments: [] }
      for (const s of g.segments) {
        const seg = { id: uid(), time: s.time, event: s.event, desc: s.desc, docLinks: [], personLinks: [], descHidden: false }
        for (const dt of s.docs) {
          const id = docByName.get(dt)
          if (id && !seg.docLinks.includes(id)) seg.docLinks.push(id)
        }
        for (const pd of s.persons) {
          const parts = pd.split('/').map((x) => x.trim())
          const relName = parts[0]
          const personName = parts[1] || ''
          const rel = a.children.find((c) => c.type === 'relations' && c.title === relName)
          if (!rel) continue
          if (!personName) {
            seg.personLinks.push({ relationsId: rel.id, personId: null })
            continue
          }
          const p = rel.persons.find((x) => x.name === personName)
          if (p) seg.personLinks.push({ relationsId: rel.id, personId: p.id })
        }
        tl.segments.push(seg)
      }
      a.children.push(tl)
      created.push(tl)
    }
    a.updatedAt = Date.now()
    return created
  }
})

watch(() => store.data, scheduleSave, { deep: true })

// ---------- 码字统计（仅统计章节） ----------
function chapterTotalWords() {
  let total = 0
  for (const a of store.data.articles) {
    for (const c of a.children) {
      if (c.type === 'doc') total += countWords(c.content)
    }
  }
  return total
}

function trackWordDiff() {
  const stats = store.data.stats
  if (!stats) return
  const total = chapterTotalWords()
  stats.totalWordsSnapshot = total
  const today = dateKey()
  // 每日字数＝当日净增字数：首次写入时记录当日起点总量，之后实时覆盖为
  // 「当前总量 − 当日起点」，删除同步扣减，仅保留该时段最终完成的字数
  if (!stats.dayStart || stats.dayStart.date !== today) {
    stats.dayStart = { date: today, total }
  }
  const net = Math.max(0, total - stats.dayStart.total)
  if (net > 0 || stats.words[today] !== undefined) stats.words[today] = net
}

watch(
  () => store.data,
  () => {
    if (store.ready) trackWordDiff()
  },
  { deep: true }
)

// 每 5 秒结算一次码字时长：30 秒内有章节编辑输入则计入 5 秒
if (typeof window !== 'undefined') {
  setInterval(() => {
    const stats = store.data.stats
    if (!stats) return
    if (store._lastInput && Date.now() - store._lastInput < 30000) {
      const k = dateKey()
      stats.duration[k] = (stats.duration[k] || 0) + 5
    }
  }, 5000)

  // 章节编辑器输入 → 标记活跃（灵感编辑不计入）
  document.addEventListener('input', (e) => {
    if (e.target?.closest?.('.col-body .rich-editor')) store.markWritingActivity()
  })
}

window.addEventListener('beforeunload', () => {
  if (store.ready) storage.save(JSON.parse(JSON.stringify(store.data)))
})
