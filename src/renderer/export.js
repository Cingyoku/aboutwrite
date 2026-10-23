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

function buildRtf(title, sections, fontSize, pageBreaks) {
  const fs = ptOf(fontSize) * 2
  const out = []
  out.push(`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fcharset134 SimSun;}}`)
  out.push(`\\viewkind4\\uc1\\pard\\sa120\\b\\fs${fs + 8} ${rtfText(title || '未命名')}\\par\\b0\\fs${fs}`)
  sections.forEach((sec, si) => {
    if (pageBreaks && si > 0) out.push('\\page')
    out.push(`\\pard\\sa120\\b\\fs${fs + 4} ${rtfText(sec.heading || '')}\\par\\b0\\fs${fs}`)
    for (const line of sec.lines) {
      out.push(`\\pard\\sa80 ${rtfText(line)}\\par`)
    }
  })
  out.push('}')
  return out.join('\n')
}

async function buildDocx(docs, docFormat) {
  const fontSize = docFormat?.fontSize || 16
  const indent = docFormat?.indent !== false
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
          indent: indent ? { firstLine: ptOf(fontSize) * 40 } : undefined,
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

function relationLines(rel) {
  const lines = []
  const factionNameOf = (p) => {
    const f = rel.factions?.find((x) => x.id === p.factionId)
    return f ? f.name : ''
  }
  if (rel.factions?.length) {
    lines.push('【阵营】')
    for (const f of rel.factions) lines.push(`${f.name || '未命名阵营'}：${f.desc || '（无描述）'}`)
    lines.push('')
  }
  lines.push('【人物】')
  for (const p of rel.persons) {
    const fa = factionNameOf(p)
    let row = `${p.name || '（未命名）'}${fa ? `（${fa}）` : ''}`
    if (p.note) row += ` — ${p.note}`
    lines.push(row)
    if (p.bio) lines.push(`小传：${p.bio}`)
  }
  if (rel.edges?.length) {
    lines.push('')
    lines.push('【关系】')
    for (const e of rel.edges) {
      const a = rel.persons.find((p) => p.id === e.from)
      const b = rel.persons.find((p) => p.id === e.to)
      lines.push(`${a?.name || '（未命名）'} ——${e.label || '关联'}——> ${b?.name || '（未命名）'}`)
    }
  }
  return lines
}

function timelineLines(tl, article) {
  const lines = []
  const docTitle = (id) => article.children.find((c) => c.id === id)?.title || '（已删除）'
  const personDesc = (l) => {
    const rel = article.children.find((c) => c.id === l.relationsId)
    if (!rel) return '（已删除）'
    if (!l.personId) return rel.title
    const p = rel.persons.find((x) => x.id === l.personId)
    return `${rel.title} / ${p ? p.name || '（未命名）' : '（已删除人物）'}`
  }
  tl.segments.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.time || '（无时间）'}　${s.event}`)
    if (s.docLinks?.length) lines.push(`   关联章节：${s.docLinks.map(docTitle).join('、')}`)
    if (s.personLinks?.length) lines.push(`   关联人物：${s.personLinks.map(personDesc).join('、')}`)
  })
  return lines
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

export async function exportArticle(article, parts) {
  const sections = []
  if (article.content && htmlToPlain(article.content)) {
    sections.push({ heading: '文章正文', lines: htmlToPlain(article.content).split('\n') })
  }
  const docs = article.children.filter((c) => c.type === 'doc')
  if (parts.chapters && docs.length) {
    sections.push(...chaptersToSections(docs, '章节：'))
  }
  const rels = article.children.filter((c) => c.type === 'relations')
  if (parts.relations) {
    for (const r of rels) sections.push({ heading: `人物关系：${r.title}`, lines: relationLines(r) })
  }
  const tls = article.children.filter((c) => c.type === 'timeline')
  if (parts.timeline) {
    for (const t of tls) sections.push({ heading: `时间轴：${t.title}`, lines: timelineLines(t, article) })
  }
  if (!sections.length) throw new Error('文章下没有可导出的内容')
  const rtf = buildRtf(article.title || '未命名文章', sections, article.docFormat?.fontSize || 16, true)
  const name = (article.title || '文章').replace(/[\\/:*?"<>|]/g, '_')
  return saveFile(`${name}-全书.rtf`, rtf, 'application/rtf')
}
