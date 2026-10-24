import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'

let decodeEl = null
function decodeEntities(s) {
  if (typeof document === 'undefined') return s
  if (!decodeEl) decodeEl = document.createElement('textarea')
  decodeEl.innerHTML = s
  return decodeEl.value
}

export function htmlToPlain(html) {
  const stripped = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
  return decodeEntities(stripped)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function ptOf(fontSize) {
  return Math.max(9, Math.round(fontSize * 0.75))
}

function buildMarkdown(docs) {
  return docs.map((d) => `# ${d.title}\n\n${htmlToPlain(d.content)}`).join('\n\n---\n\n')
}

function escapeRtfChar(cp) {
  if (cp === 0x5c) return '\\\\'
  if (cp === 0x7b) return '\\{'
  if (cp === 0x7d) return '\\}'
  if (cp === 0x0a) return '\\par\n'
  if (cp < 0x80) return String.fromCharCode(cp)
  if (cp > 0xffff) {
    const h = Math.floor((cp - 0x10000) / 0x400) + 0xd800
    const l = ((cp - 0x10000) % 0x400) + 0xdc00
    return `\\u${h - 0x10000}?\\u${l - 0x10000}?`
  }
  const signed = (cp << 16) >> 16
  return `\\u${signed}?`
}

function rtfText(s) {
  return Array.from(s || '')
    .map((ch) => escapeRtfChar(ch.codePointAt(0)))
    .join('')
}

function rtfTable(headers, rows, fontSize) {
  const cols = headers.length
  const total = 9360
  const w = Math.floor(total / cols)
  const bounds = []
  for (let i = 1; i <= cols; i++) {
    bounds.push(
      `\\clbrdrt\\brdrs\\brdrw10 \\clbrdrl\\brdrs\\brdrw10 \\clbrdrb\\brdrs\\brdrw10 \\clbrdrr\\brdrs\\brdrw10 \\cellx${w * i}`
    )
  }
  const rowDef = `\\trowd\\trgaph108\\trleft0 ${bounds.join(' ')}`
  const out = []
  let head = rowDef
  for (const h of headers) head += `\\intbl\\b ${rtfText(h)}\\cell\\b0`
  out.push(head + '\\row')
  for (const r of rows) {
    let line = rowDef
    for (let i = 0; i < cols; i++) line += `\\intbl ${rtfText(String(r[i] ?? ''))}\\cell`
    out.push(line + '\\row')
  }
  out.push('\\pard\\sa120')
  return out
}

function buildRtf(title, sections, fontSize, pageBreaks) {
  const fs = ptOf(fontSize) * 2
  const out = []
  out.push(`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fcharset134 SimSun;}}`)
  out.push(`\\viewkind4\\uc1\\pard\\sa120\\b\\fs${fs + 8} ${rtfText(title || '未命名')}\\par\\b0\\fs${fs}`)
  sections.forEach((sec, si) => {
    if (pageBreaks && si > 0) out.push('\\page')
    out.push(`\\pard\\sa120\\b\\fs${fs + 4} ${rtfText(sec.heading || '')}\\par\\b0\\fs${fs}`)
    if (sec.lines) {
      for (const line of sec.lines) {
        out.push(`\\pard\\sa80 ${rtfText(line)}\\par`)
      }
    }
    if (sec.tables) {
      for (const t of sec.tables) out.push(...rtfTable(t.headers, t.rows, fontSize))
    }
  })
  out.push('}')
  return out.join('\n')
}

async function buildDocx(docs, docFormat) {
  const fontSize = docFormat?.fontSize || 16
  const halfPoints = ptOf(fontSize) * 2
  const children = []
  docs.forEach((d, di) => {
    if (di > 0) children.push(new Paragraph({ text: '', pageBreakBefore: true }))
    children.push(new Paragraph({ text: d.title, heading: HeadingLevel.HEADING_1 }))
    const plain = htmlToPlain(d.content)
    const lines = plain ? plain.split('\n') : ['']
    for (const line of lines) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line, size: halfPoints })],
          spacing: { line: 360 }
        })
      )
    }
  })
  const doc = new Document({ sections: [{ children }] })
  return Packer.toBlob(doc)
}

async function buildPng(docs, docFormat) {
  const fontSize = docFormat?.fontSize || 16
  const W = 1000
  const PAD = 48
  const LH = 1.85
  const probe = document.createElement('canvas').getContext('2d')

  function wrap(text, font, maxW) {
    probe.font = font
    const out = []
    for (const raw of String(text).split('\n')) {
      if (!raw) {
        out.push('')
        continue
      }
      let line = ''
      for (const ch of raw) {
        if (probe.measureText(line + ch).width > maxW) {
          out.push(line)
          line = ch
        } else {
          line += ch
        }
      }
      out.push(line)
    }
    return out
  }

  const bodyFont = `${fontSize}px "Microsoft YaHei", "Segoe UI", sans-serif`
  const titleFont = `bold ${Math.round(fontSize * 1.25)}px "Microsoft YaHei", "Segoe UI", sans-serif`
  const maxW = W - PAD * 2

  const blocks = []
  for (const d of docs) {
    blocks.push({ text: d.title || '（未命名章节）', font: titleFont, color: '#1d4ed8', gapBefore: blocks.length ? 26 : 0 })
    const plain = htmlToPlain(d.content) || '（空）'
    for (const line of plain.split('\n')) {
      blocks.push({ text: line || '', font: bodyFont, color: '#1f2937', gapBefore: 0 })
    }
  }

  const bodyLh = Math.round(fontSize * LH)
  const titleLh = Math.round(fontSize * 1.25 * 1.6)
  let y = PAD + 24
  for (const b of blocks) {
    y += b.gapBefore
    const lh = b.font === titleFont ? titleLh : bodyLh
    b.lh = lh
    y += lh
  }
  const H = y + PAD
  if (H > 16000) throw new Error('内容过长，PNG 导出仅支持约 16000px 高度以内的内容')

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  let cy = PAD + 24
  for (const b of blocks) {
    cy += b.gapBefore
    if (b.text) {
      ctx.font = b.font
      ctx.fillStyle = b.color
      ctx.textBaseline = 'top'
      ctx.fillText(b.text, PAD, cy)
    }
    cy += b.lh
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG 生成失败'))), 'image/png')
  })
}

function chaptersToSections(docs, prefixTitle) {
  return docs.map((d) => ({
    heading: (prefixTitle ? prefixTitle : '') + (d.title || '（未命名章节）'),
    lines: htmlToPlain(d.content) ? htmlToPlain(d.content).split('\n') : ['（空）']
  }))
}

function relationTables(rel) {
  const tables = []
  const factionNameOf = (p) => {
    const f = rel.factions?.find((x) => x.id === p.factionId)
    return f ? f.name : ''
  }
  const nameOf = (id) => rel.persons.find((p) => p.id === id)?.name || '（未命名）'
  if (rel.factions?.length) {
    tables.push({
      headers: ['阵营', '颜色', '描述'],
      rows: rel.factions.map((f) => [f.name || '未命名阵营', f.color, f.desc || '（无描述）'])
    })
  }
  tables.push({
    headers: ['人物', '阵营', '备注', '小传'],
    rows: rel.persons.map((p) => [
      p.name || '（未命名）',
      factionNameOf(p) || '（无阵营）',
      p.note || '',
      p.bio || ''
    ])
  })
  if (rel.edges?.length) {
    tables.push({
      headers: ['人物 A', '关系', '人物 B'],
      rows: rel.edges.map((e) => [nameOf(e.from), e.label || '关联', nameOf(e.to)])
    })
  }
  return tables
}

function timelineTable(tl, article) {
  const docTitle = (id) => article.children.find((c) => c.id === id)?.title || '（已删除）'
  const personDesc = (l) => {
    const rel = article.children.find((c) => c.id === l.relationsId)
    if (!rel) return '（已删除）'
    if (!l.personId) return rel.title
    const p = rel.persons.find((x) => x.id === l.personId)
    return `${rel.title} / ${p ? p.name || '（未命名）' : '（已删除人物）'}`
  }
  return {
    headers: ['序号', '时间', '事件', '关联章节', '关联人物'],
    rows: tl.segments.map((s, i) => [
      String(i + 1),
      s.time || '（无时间）',
      s.event,
      s.docLinks?.length ? s.docLinks.map(docTitle).join('、') : '',
      s.personLinks?.length ? s.personLinks.map(personDesc).join('、') : ''
    ])
  }
}

export async function exportArticle(article, parts) {
  const sections = []
  if (article.content && htmlToPlain(article.content)) {
    sections.push({ heading: '大纲', lines: htmlToPlain(article.content).split('\n') })
  }
  const docs = article.children.filter((c) => c.type === 'doc')
  if (parts.chapters && docs.length) {
    sections.push(...chaptersToSections(docs, '章节：'))
  }
  const rels = article.children.filter((c) => c.type === 'relations')
  if (parts.relations) {
    for (const r of rels) sections.push({ heading: `人物关系：${r.title}`, tables: relationTables(r) })
  }
  const tls = article.children.filter((c) => c.type === 'timeline')
  if (parts.timeline) {
    for (const t of tls) sections.push({ heading: `时间轴：${t.title}`, tables: [timelineTable(t, article)] })
  }
  if (!sections.length) throw new Error('文章下没有可导出的内容')
  const rtf = buildRtf(article.title || '未命名文章', sections, article.docFormat?.fontSize || 16, true)
  const name = (article.title || '文章').replace(/[\\/:*?"<>|]/g, '_')
  return saveFile(`${name}-全书.rtf`, rtf, 'application/rtf')
}

function escXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const SVG_R = 22

function svgShorten(a, b, dist) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  return { x: a.x + (dx / len) * dist, y: a.y + (dy / len) * dist }
}

export function buildRelationsSvg(rel) {
  const W = 600
  const H = 400
  const persons = rel.persons || []
  const posOf = (id) => {
    const p = persons.find((x) => x.id === id)
    return p ? { x: p.x, y: p.y } : { x: 0, y: 0 }
  }
  const factionOf = (p) => (rel.factions || []).find((f) => f.id === p.factionId) || null

  const groups = new Map()
  for (const e of rel.edges || []) {
    const key = [e.from, e.to].sort().join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(e)
  }

  const edgeSvg = []
  for (const ids of groups.values()) {
    ids.forEach((e, i) => {
      const step = 3 + 1.6
      const auto = ids.length > 1 ? (i - (ids.length - 1) / 2) * step : 0
      const off = auto + (e.bend || 0)
      const a = svgShorten(posOf(e.from), posOf(e.to), SVG_R + 3)
      const b = svgShorten(posOf(e.to), posOf(e.from), SVG_R + 7)
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      const nx = -dy / len
      const ny = dx / len
      const cx = mx + nx * off
      const cy = my + ny * off
      const lx0 = 0.25 * a.x + 0.5 * cx + 0.25 * b.x
      const ly0 = 0.25 * a.y + 0.5 * cy + 0.25 * b.y
      edgeSvg.push(
        `<path d="M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}" fill="none" stroke="#94a3b8" stroke-width="1.6" marker-end="url(#arrow)"></path>`
      )
      if (e.label) {
        const labelOff = (ids.length > 1 ? ((ids.length - 1) / 2) * step : 0) + 12 + (ids.length - 1 - i) * 14
        const lx = lx0 + nx * labelOff
        const ly = ly0 + ny * labelOff
        let ang = (Math.atan2(dy, dx) * 180) / Math.PI
        if (ang > 90) ang -= 180
        if (ang < -90) ang += 180
        edgeSvg.push(
          `<text transform="translate(${lx} ${ly}) rotate(${ang})" text-anchor="middle" dominant-baseline="central" font-size="12" fill="#1f2937" stroke="#ffffff" stroke-width="4" paint-order="stroke">${escXml(e.label)}</text>`
        )
      }
    })
  }

  const nodeSvg = persons.map((p) => {
    const f = factionOf(p)
    const stroke = f ? f.color : '#94a3b8'
    const dot = f
      ? `<circle cx="${p.x + 16}" cy="${p.y - 16}" r="4.5" fill="${f.color}" stroke="#ffffff" stroke-width="1"></circle>`
      : ''
    const tip = escXml((p.name || '未命名') + (p.bio ? '\n' + p.bio : p.note ? '：' + p.note : ''))
    return `<g><title>${tip}</title><circle cx="${p.x}" cy="${p.y}" r="${SVG_R}" fill="#f8fafc" stroke="${stroke}" stroke-width="1.6"></circle>${dot}<text x="${p.x}" y="${p.y + 38}" text-anchor="middle" font-size="13" fill="#1f2937" stroke="#ffffff" stroke-width="4" paint-order="stroke">${escXml(p.name || '（未命名）')}</text></g>`
  })

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#94a3b8"></path></marker></defs>`,
    `<rect width="${W}" height="${H}" fill="#ffffff"></rect>`,
    `<text x="${W - 12}" y="20" text-anchor="end" font-size="13" font-weight="bold" fill="#1f2937">${escXml(rel.title || '人物关系')}</text>`,
    ...edgeSvg,
    ...nodeSvg,
    `</svg>`
  ].join('\n')
}

export function buildTimelineSvg(tl, article) {
  const W = 860
  const PAD = 40
  const spineX = 210
  const textX = spineX + 26
  const maxW = W - textX - PAD
  const charW = 15
  const lineH = 24
  const perLine = Math.max(10, Math.floor(maxW / charW))

  const docTitle = (id) => article?.children.find((c) => c.id === id)?.title || '（已删除）'
  const personDesc = (l) => {
    const rel = article?.children.find((c) => c.id === l.relationsId)
    if (!rel) return '（已删除）'
    if (!l.personId) return rel.title
    const p = rel.persons.find((x) => x.id === l.personId)
    return `${rel.title} / ${p ? p.name || '（未命名）' : '（已删除人物）'}`
  }

  function wrapByCount(text, n) {
    const out = []
    for (const raw of String(text || '').split('\n')) {
      if (!raw) {
        out.push('')
        continue
      }
      for (let i = 0; i < raw.length; i += n) out.push(raw.slice(i, i + n))
    }
    return out
  }

  const segs = (tl.segments || []).map((s, i) => {
    const lines = wrapByCount(s.event || '（无事件）', perLine)
    const links = []
    if (s.docLinks?.length) links.push(`关联章节：${s.docLinks.map(docTitle).join('、')}`)
    if (s.personLinks?.length) links.push(`关联人物：${s.personLinks.map(personDesc).join('、')}`)
    const linkLines = links.flatMap((l) => wrapByCount(l, perLine))
    return { s, i, lines, linkLines }
  })

  let y = PAD + 46
  const items = segs.map(({ s, i, lines, linkLines }) => {
    const top = y
    const h = 14 + (lines.length + linkLines.length) * lineH + 22
    y += h
    return { s, i, lines, linkLines, top, h }
  })
  const H = y + PAD

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`)
  parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"></rect>`)
  parts.push(
    `<text x="${W - PAD}" y="34" text-anchor="end" font-size="18" font-weight="bold" fill="#1f2937">${escXml(tl.title || '时间轴')}</text>`
  )
  parts.push(
    `<line x1="${spineX}" y1="${PAD + 58}" x2="${spineX}" y2="${H - PAD}" stroke="#cbd5e1" stroke-width="2"></line>`
  )
  for (const it of items) {
    const cy = it.top + 12
    parts.push(`<circle cx="${spineX}" cy="${cy}" r="5" fill="#2563eb"></circle>`)
    parts.push(
      `<text x="${spineX - 16}" y="${cy + 5}" text-anchor="end" font-size="14" fill="#d97706">${escXml(it.s.time || '（无时间）')}</text>`
    )
    let ty = cy + 10
    for (const l of it.lines) {
      ty += lineH
      parts.push(
        `<text x="${textX}" y="${ty}" font-size="15" fill="#1f2937">${escXml(l)}</text>`
      )
    }
    for (const l of it.linkLines) {
      ty += lineH
      parts.push(
        `<text x="${textX}" y="${ty}" font-size="12" fill="#6b7280">${escXml(l)}</text>`
      )
    }
  }
  parts.push('</svg>')
  return parts.join('\n')
}

export async function saveFile(name, data, mime) {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data
  if (typeof window !== 'undefined' && window.electronAPI?.exportFile) {
    const buf = new Uint8Array(await blob.arrayBuffer())
    return window.electronAPI.exportFile({ name, data: buf, mime })
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return { saved: true }
}

export async function exportChapters(docs, format, baseName, docFormat) {
  if (!docs.length) throw new Error('没有可导出的章节内容')
  const name = (baseName || '章节').replace(/[\\/:*?"<>|]/g, '_')
  if (format === 'md') return saveFile(`${name}.md`, buildMarkdown(docs), 'text/markdown;charset=utf-8')
  if (format === 'rtf') {
    const rtf = buildRtf(baseName || '章节', chaptersToSections(docs), docFormat?.fontSize || 16, false)
    return saveFile(`${name}.rtf`, rtf, 'application/rtf')
  }
  if (format === 'docx') {
    const blob = await buildDocx(docs, docFormat)
    return saveFile(`${name}.docx`, blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  }
  if (format === 'png') {
    const blob = await buildPng(docs, docFormat)
    return saveFile(`${name}.png`, blob, 'image/png')
  }
  throw new Error('不支持的导出格式')
}

