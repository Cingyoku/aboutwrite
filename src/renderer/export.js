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

// 将编辑器 HTML 解析为段落列表，每段由带粗体 / 斜体状态的文本片段组成，
// 导出 RTF / MD / PNG / PDF 时据此还原章节文本框中设置的格式
export function htmlToRuns(html) {
  const src = String(html || '')
  const paras = []
  let cur = []
  let bold = false
  let italic = false
  let buf = ''
  const flush = () => {
    if (buf) {
      cur.push({ text: buf, bold, italic })
      buf = ''
    }
  }
  const endPara = () => {
    flush()
    paras.push(cur)
    cur = []
  }
  const re = /<[^>]+>|[^<]+/g
  let m
  while ((m = re.exec(src))) {
    const tok = m[0]
    if (tok.startsWith('<')) {
      const t = tok.toLowerCase()
      if (/^<\/(p|div|h[1-6]|li|blockquote)/.test(t)) {
        endPara()
      } else if (/^<(p|div|h[1-6]|li|blockquote)(\s|>)/.test(t)) {
        flush()
        if (cur.length) endPara()
      } else if (/^<br/.test(t)) {
        flush()
        cur.push({ text: '\n', bold, italic })
      } else if (/^<(b|strong)(\s|>)/.test(t)) {
        flush()
        bold = true
      } else if (/^<\/(b|strong)/.test(t)) {
        flush()
        bold = false
      } else if (/^<(i|em)(\s|>)/.test(t)) {
        flush()
        italic = true
      } else if (/^<\/(i|em)/.test(t)) {
        flush()
        italic = false
      }
    } else {
      buf += decodeEntities(tok)
    }
  }
  endPara()
  while (paras.length && !paras[paras.length - 1].some((r) => r.text.trim())) paras.pop()
  return paras
}

// 片段 → RTF：粗体 \b..\b0、斜体 \i..\i0，换行 \line
function runsToRtf(runs) {
  let out = ''
  for (const r of runs) {
    let seg = Array.from(r.text)
      .map((ch) => (ch === '\n' ? '\\line ' : escapeRtfChar(ch.codePointAt(0))))
      .join('')
    if (r.bold) seg = `\\b ${seg}\\b0 `
    if (r.italic) seg = `\\i ${seg}\\i0 `
    out += seg
  }
  return out
}

// 片段 → Markdown：**粗体**、*斜体*
function runsToMd(runs) {
  const parts = []
  for (const r of runs) {
    String(r.text)
      .split('\n')
      .forEach((seg, i) => {
        if (i > 0) parts.push('\n')
        if (!seg) return
        let s = seg
        if (r.bold) s = `**${s}**`
        if (r.italic) s = `*${s}*`
        parts.push(s)
      })
  }
  return parts.join('')
}

function ptOf(fontSize) {
  return Math.max(9, Math.round(fontSize * 0.75))
}

function buildMarkdown(docs) {
  return docs
    .map((d) => {
      const paras = htmlToRuns(d.content)
      const body = paras.map((runs) => runsToMd(runs).replace(/\n/g, '  \n')).join('\n\n')
      return `# ${d.title}\n\n${body}`
    })
    .join('\n\n---\n\n')
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
    if (sec.paras) {
      for (const runs of sec.paras) {
        out.push(`\\pard\\sa80 ${runsToRtf(runs)}\\par`)
      }
    }
    if (sec.tables) {
      for (const t of sec.tables) out.push(...rtfTable(t.headers, t.rows, fontSize))
    }
  })
  out.push('}')
  return out.join('\n')
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
    const paras = htmlToRuns(d.content)
    if (!paras.length) paras.push([{ text: '（空）', bold: false, italic: false }])
    for (const runs of paras) {
      // 按片段字体逐字换行，生成「一行 = 多个同格式片段」的布局
      const lines = []
      let line = []
      let xw = 0
      const pushLine = () => {
        lines.push(line)
        line = []
        xw = 0
      }
      for (const r of runs) {
        const font = `${r.bold ? 'bold ' : ''}${r.italic ? 'italic ' : ''}${fontSize}px "Microsoft YaHei", "Segoe UI", sans-serif`
        for (const ch of r.text) {
          if (ch === '\n') {
            pushLine()
            continue
          }
          probe.font = font
          const w = probe.measureText(ch).width
          if (xw + w > maxW && line.length) pushLine()
          const last = line[line.length - 1]
          if (last && last.font === font) {
            last.text += ch
            last.w += w
          } else {
            line.push({ text: ch, font, w })
          }
          xw += w
        }
      }
      if (line.length) pushLine()
      if (!lines.length) lines.push([])
      for (const segs of lines) blocks.push({ segs, color: '#1f2937', gapBefore: 0 })
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
    if (b.segs) {
      let cx = PAD
      for (const s of b.segs) {
        ctx.font = s.font
        ctx.fillStyle = b.color
        ctx.textBaseline = 'top'
        ctx.fillText(s.text, cx, cy)
        cx += s.w
      }
    } else if (b.text) {
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
  return docs.map((d) => {
    const paras = htmlToRuns(d.content)
    return {
      heading: (prefixTitle ? prefixTitle : '') + (d.title || '（未命名章节）'),
      paras: paras.length ? paras : [[{ text: '（空）', bold: false, italic: false }]]
    }
  })
}

// 人物关系表格：RTF 与 CSV 共用同一结构，保证两种格式内容一致
function relationsRows(rel) {
  const factionNamesOf = (p) =>
    (p.factionIds || (p.factionId ? [p.factionId] : []))
      .map((id) => (rel.factions || []).find((f) => f.id === id)?.name)
      .filter(Boolean)
      .join('/')
  const nameOf = (id) => (rel.persons || []).find((p) => p.id === id)?.name || '（未命名）'
  const headers = ['人物名称', '备注', '人物小传', '阵营', '关系对象', '关系描述']
  const rows = []
  for (const p of rel.persons || []) {
    rows.push([p.name || '（未命名）', p.note || '', p.bio || '', factionNamesOf(p), '', ''])
  }
  for (const e of rel.edges || []) {
    rows.push([nameOf(e.from), '', '', '', nameOf(e.to), e.label || ''])
  }
  return { headers, rows }
}

function relationTables(rel) {
  const { headers, rows } = relationsRows(rel)
  return [{ headers, rows }]
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
    headers: ['序号', '时间', '事件', '描述', '关联章节', '关联人物'],
    rows: tl.segments.map((s, i) => [
      String(i + 1),
      s.time || '（无时间）',
      s.event,
      s.desc || '',
      s.docLinks?.length ? s.docLinks.map(docTitle).join('、') : '',
      s.personLinks?.length ? s.personLinks.map(personDesc).join('、') : ''
    ])
  }
}

export function buildArticleRtf(article, parts = { chapters: true, relations: true, timeline: true }) {
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
  return buildRtf(article.title || '未命名文章', sections, article.docFormat?.fontSize || 16, true)
}

export async function exportArticle(article, parts) {
  const rtf = buildArticleRtf(article, parts)
  const name = (article.title || '文章').replace(/[\\/:*?"<>|]/g, '_')
  return saveFile(`${name}-全书.rtf`, rtf, 'application/rtf')
}

export function buildInspirationRtf(insp) {
  const plain = htmlToPlain(insp.content) || '（空）'
  return buildRtf(insp.title || '未命名灵感', [{ heading: '', lines: plain.split('\n') }], 16, false)
}

function escXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const SVG_R = 22

const SVG_STEP = 18
const SVG_LABEL_GAP = 11

function svgLineTrim(off, dist) {
  const o2 = off * off
  return o2 >= dist * dist ? 0 : Math.sqrt(dist * dist - o2)
}

function svgEdgeGeometry(fromPos, toPos, off) {
  // 统一按规范方向（id 较小端 -> 较大端）计算几何，保证同一对人物的多条线在共享坐标系中等距偏移；
  // 反向关系线若各自计算，垂直向量会翻转导致偏移落在同一侧而完全重叠
  const forward = String(fromPos.id) <= String(toPos.id)
  const tail = forward ? fromPos : toPos
  const head = forward ? toPos : fromPos
  const dx = head.x - tail.x
  const dy = head.y - tail.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const px = -uy
  const py = ux
  const tA = svgLineTrim(off, SVG_R + 3)
  const tB = svgLineTrim(off, SVG_R + 7)
  const near = { x: tail.x + ux * tA + px * off, y: tail.y + uy * tA + py * off }
  const far = { x: head.x - ux * tB + px * off, y: head.y - uy * tB + py * off }
  const a = forward ? near : far
  const b = forward ? far : near
  const mid = { x: (near.x + far.x) / 2, y: (near.y + far.y) / 2 }
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI
  if (ang > 90) ang -= 180
  if (ang < -90) ang += 180
  const rad = (ang * Math.PI) / 180
  const out = dx >= 0 ? -1 : 1
  const side = off * out >= 0 ? 1 : -1
  const label = {
    x: mid.x + Math.sin(rad) * SVG_LABEL_GAP * side,
    y: mid.y - Math.cos(rad) * SVG_LABEL_GAP * side
  }
  return { a, b, mid, label, ang }
}

export function buildRelationsSvg(rel) {
  const persons = rel.persons || []
  const posOf = (id) => {
    const p = persons.find((x) => x.id === id)
    return p ? { id: p.id, x: p.x, y: p.y } : { id, x: 0, y: 0 }
  }
  const factionOf = (p) => (rel.factions || []).find((f) => f.id === p.factionId) || null

  const groups = new Map()
  for (const e of rel.edges || []) {
    const key = [e.from, e.to].sort().join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(e)
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const grow = (x0, y0, x1, y1) => {
    minX = Math.min(minX, x0, x1)
    minY = Math.min(minY, y0, y1)
    maxX = Math.max(maxX, x0, x1)
    maxY = Math.max(maxY, y0, y1)
  }

  const edgeSvg = []
  for (const ids of groups.values()) {
    ids.forEach((e, i) => {
      const off = ids.length > 1 ? (i - (ids.length - 1) / 2) * SVG_STEP : 0
      const { a, b, label, ang } = svgEdgeGeometry(posOf(e.from), posOf(e.to), off)
      edgeSvg.push(
        `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" fill="none" stroke="#94a3b8" stroke-width="1.6" marker-end="url(#arrow)"></path>`
      )
      if (e.label) {
        edgeSvg.push(
          `<text transform="translate(${label.x} ${label.y}) rotate(${ang})" text-anchor="middle" dominant-baseline="central" font-size="12" fill="#1f2937" stroke="#ffffff" stroke-width="4" paint-order="stroke">${escXml(e.label)}</text>`
        )
        const halfW = e.label.length * 6 + 6
        grow(label.x - halfW, label.y - 9, label.x + halfW, label.y + 9)
      } else {
        grow(a.x, a.y, b.x, b.y)
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
    const name = p.name || '（未命名）'
    const halfW = Math.max(SVG_R + 2, (name.length * 13) / 2)
    grow(p.x - halfW, p.y - SVG_R - 2, p.x + halfW, p.y + 38 + 14)
    return `<g><title>${tip}</title><circle cx="${p.x}" cy="${p.y}" r="${SVG_R}" fill="#f8fafc" stroke="${stroke}" stroke-width="1.6"></circle>${dot}<text x="${p.x}" y="${p.y + 38}" text-anchor="middle" font-size="13" fill="#1f2937" stroke="#ffffff" stroke-width="4" paint-order="stroke">${escXml(name)}</text></g>`
  })

  if (!persons.length) {
    minX = 0
    minY = 0
    maxX = 600
    maxY = 400
  }

  const PAD = 26
  const TITLE_H = 32
  let x0 = minX - PAD
  let y0 = minY - PAD - TITLE_H
  let x1 = maxX + PAD
  let y1 = maxY + PAD
  if (x1 - x0 < 600) {
    const cx = (x0 + x1) / 2
    x0 = cx - 300
    x1 = cx + 300
  }
  if (y1 - y0 < 400) {
    const cy = (y0 + y1) / 2
    y0 = cy - 200
    y1 = cy + 200
  }
  const W = Math.round(x1 - x0)
  const H = Math.round(y1 - y0)

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${W} ${H}" width="${W}" height="${H}">`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#94a3b8"></path></marker></defs>`,
    `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#ffffff"></rect>`,
    `<text x="${x1 - 12}" y="${y0 + 22}" text-anchor="end" font-size="13" font-weight="bold" fill="#1f2937">${escXml(rel.title || '人物关系')}</text>`,
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
    const descLines = s.desc ? wrapByCount(s.desc, perLine) : []
    const links = []
    if (s.docLinks?.length) links.push(`关联章节：${s.docLinks.map(docTitle).join('、')}`)
    if (s.personLinks?.length) links.push(`关联人物：${s.personLinks.map(personDesc).join('、')}`)
    const linkLines = links.flatMap((l) => wrapByCount(l, perLine))
    return { s, i, lines, descLines, linkLines }
  })

  let y = PAD + 46
  const items = segs.map(({ s, i, lines, descLines, linkLines }) => {
    const top = y
    const h = 14 + (lines.length + descLines.length + linkLines.length) * lineH + 22
    y += h
    return { s, i, lines, descLines, linkLines, top, h }
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
    for (const l of it.descLines) {
      ty += lineH
      parts.push(
        `<text x="${textX}" y="${ty}" font-size="12" fill="#475569">${escXml(l)}</text>`
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
  if (format === 'png') {
    const blob = await buildPng(docs, docFormat)
    return saveFile(`${name}.png`, blob, 'image/png')
  }
  throw new Error('不支持的导出格式')
}

// ---------- PDF 导出：构建打印用 HTML，由主进程渲染为 PDF ----------
function escapeHtmlText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export async function exportChaptersPdf(docs, baseName, docFormat) {
  if (!docs.length) throw new Error('没有可导出的章节内容')
  const fontSize = docFormat?.fontSize || 16
  const pt = Math.max(9, Math.round(fontSize * 0.75))
  const body = docs
    .map((d) => {
      const paras = htmlToRuns(d.content)
      const list = paras.length ? paras : [[{ text: '（空）', bold: false, italic: false }]]
      const parasHtml = list
        .map((runs) => {
          const inner = runs
            .map((r) => {
              let s = escapeHtmlText(r.text).replace(/\n/g, '<br/>')
              if (r.bold) s = `<b>${s}</b>`
              if (r.italic) s = `<i>${s}</i>`
              return s
            })
            .join('')
          return `<p>${inner || '&nbsp;'}</p>`
        })
        .join('')
      return `<h2>${escapeHtmlText(d.title || '（未命名章节）')}</h2>${parasHtml}`
    })
    .join('')
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `body{font-family:"Microsoft YaHei","SimSun",sans-serif;font-size:${pt}pt;line-height:1.9;color:#111111;}` +
    `h1{font-size:${(pt * 1.4).toFixed(1)}pt;text-align:center;margin:0 0 20px;}` +
    `h2{font-size:${(pt * 1.15).toFixed(1)}pt;margin:22px 0 10px;border-bottom:1px solid #dddddd;padding-bottom:4px;}` +
    `p{margin:0 0 6px;text-indent:2em;}` +
    `</style></head><body><h1>${escapeHtmlText(baseName || '章节')}</h1>${body}</body></html>`
  const name = (baseName || '章节').replace(/[\\/:*?"<>|]/g, '_')
  if (typeof window !== 'undefined' && window.electronAPI?.exportPdf) {
    return window.electronAPI.exportPdf({ name: `${name}.pdf`, html })
  }
  throw new Error('PDF 导出仅支持桌面版（Electron）环境')
}

// ---------- 多文件导出：桌面端选一次文件夹写入全部文件，浏览器端逐个下载 ----------
export async function saveFiles(files) {
  if (!files.length) throw new Error('没有可导出的内容')
  const api = typeof window !== 'undefined' ? window.electronAPI : null
  if (api?.exportFolder) {
    const payload = files.map((f) => ({ name: f.name, data: new TextEncoder().encode(f.data) }))
    return api.exportFolder(payload)
  }
  let last = { saved: true }
  for (const f of files) last = await saveFile(f.name, f.data, f.mime || 'application/rtf')
  return last
}

// ---------- CSV 导出 ----------
function csvCell(v) {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function csvTable(headers, rows) {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(','))
  return '\uFEFF' + lines.join('\r\n')
}

export function relationsToCsv(rel) {
  const { headers, rows } = relationsRows(rel)
  return csvTable(headers, rows)
}

export function timelineToCsv(tl, article) {
  const docTitle = (id) => article?.children.find((c) => c.id === id)?.title || '（已删除）'
  const personDesc = (l) => {
    const rel = article?.children.find((c) => c.id === l.relationsId)
    if (!rel) return '（已删除）'
    if (!l.personId) return rel.title
    const p = rel.persons.find((x) => x.id === l.personId)
    return `${rel.title} / ${p ? p.name || '（未命名）' : '（已删除人物）'}`
  }
  const headers = ['时间', '事件', '描述', '关联章节', '关联人物']
  const rows = (tl.segments || []).map((s) => [
    s.time || '',
    s.event || '',
    s.desc || '',
    s.docLinks?.length ? s.docLinks.map(docTitle).join('、') : '',
    s.personLinks?.length ? s.personLinks.map(personDesc).join('、') : ''
  ])
  return csvTable(headers, rows)
}

// ---------- 导入：RTF / CSV 文本解析 ----------
function splitCsvLine(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else q = false
      } else cur += c
    } else if (c === '"') q = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((f) => f.trim())
}

function splitFields(line) {
  if (line.includes('\t')) return line.split('\t').map((f) => f.trim())
  return splitCsvLine(line)
}

// 提取 RTF 纯文本：\par→换行、\tab→制表符、\'xx 按 GBK 解码、\uN 走 Unicode
export function rtfToText(rtf) {
  const s = String(rtf || '')
  let out = ''
  const bytes = []
  const flushBytes = () => {
    if (!bytes.length) return
    try {
      out += new TextDecoder('gbk').decode(new Uint8Array(bytes))
    } catch (err) {
      out += bytes.map((b) => String.fromCharCode(b)).join('')
    }
    bytes.length = 0
  }
  const DEST = /^(fonttbl|colortbl|stylesheet|info|pict|object|themedata|listtable|listoverridetable|rsidtbl|generator|xmlnstbl|latentstyles|datastore)/
  let i = 0
  let ucSkip = 1
  let skip = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === '{' || ch === '}') {
      if (ch === '{') {
        const m = /^{\s*\\(?:\*\s*\\)?([a-zA-Z]+)/.exec(s.slice(i, i + 48))
        if (m && DEST.test(m[1])) {
          let d = 0
          let j = i
          for (; j < s.length; j++) {
            if (s[j] === '{') d++
            else if (s[j] === '}') {
              d--
              if (!d) {
                j++
                break
              }
            }
          }
          i = j
          continue
        }
      }
      i++
      continue
    }
    if (ch !== '\\') {
      if (skip > 0) {
        skip--
        i++
        continue
      }
      flushBytes()
      out += ch
      i++
      continue
    }
    const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(s.slice(i))
    if (m) {
      const word = m[1]
      const arg = m[2] ? parseInt(m[2], 10) : null
      i += m[0].length
      if (word === 'par' || word === 'line' || word === 'sect') {
        flushBytes()
        out += '\n'
      } else if (word === 'tab') {
        flushBytes()
        out += '\t'
      } else if (word === 'uc') {
        ucSkip = arg ?? 1
      } else if (word === 'u') {
        flushBytes()
        if (arg !== null) out += String.fromCharCode(arg < 0 ? arg + 65536 : arg)
        skip = ucSkip
      }
      continue
    }
    const hx = /^\\'([0-9a-fA-F]{2})/.exec(s.slice(i))
    if (hx) {
      if (skip > 0) {
        skip--
        i += hx[0].length
        continue
      }
      bytes.push(parseInt(hx[1], 16))
      i += hx[0].length
      continue
    }
    const ch2 = s[i + 1]
    if (ch2 === '{' || ch2 === '}' || ch2 === '\\') {
      if (skip > 0) {
        skip--
        i += 2
        continue
      }
      flushBytes()
      out += ch2
      i += 2
      continue
    }
    if (ch2 === '\n' || ch2 === '\r') {
      i += 2
      continue
    }
    i++
  }
  flushBytes()
  return out.replace(/\r/g, '')
}

export function parseTableText(text) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
  let hi = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) {
      hi = i
      break
    }
  }
  if (hi < 0) return null
  const headers = splitFields(lines[hi])
  const rows = []
  for (let i = hi + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cells = splitFields(lines[i])
    while (cells.length < headers.length) cells.push('')
    rows.push(cells.slice(0, headers.length))
  }
  return { headers, rows }
}

function headerIndex(headers, patterns) {
  for (const pat of patterns) {
    const i = headers.findIndex((h) => pat.test(String(h || '')))
    if (i >= 0) return i
  }
  return -1
}

export function detectTableKind(headers) {
  if (headerIndex(headers, [/关系对象|关系人/]) >= 0) return 'relations'
  if (headerIndex(headers, [/人物名称|^人物$|名称/]) >= 0 && headerIndex(headers, [/阵营/]) >= 0) return 'relations'
  if (headerIndex(headers, [/事件/]) >= 0 && headerIndex(headers, [/时间|日期/]) >= 0) return 'timeline'
  return null
}

export function parseRelationsTable(t) {
  const { headers, rows } = t
  const iName = headerIndex(headers, [/人物名称/, /^人物$/, /名称/])
  if (iName < 0) return null
  const iNote = headerIndex(headers, [/备注/])
  const iBio = headerIndex(headers, [/小传/, /简介/])
  const iFac = headerIndex(headers, [/阵营/])
  const iTo = headerIndex(headers, [/关系对象/, /关系人/])
  const iLabel = headerIndex(headers, [/关系描述/, /^关系$/])
  const persons = []
  const edges = []
  const seen = new Set()
  for (const r of rows) {
    const name = (r[iName] || '').trim()
    const to = iTo >= 0 ? (r[iTo] || '').trim() : ''
    if (name && !seen.has(name)) {
      seen.add(name)
      persons.push({
        name,
        note: iNote >= 0 ? r[iNote] || '' : '',
        bio: iBio >= 0 ? r[iBio] || '' : '',
        factions:
          iFac >= 0
            ? String(r[iFac] || '')
                .split(/[\/、,，;；]/)
                .map((x) => x.trim())
                .filter(Boolean)
            : []
      })
    }
    if (to) {
      edges.push({ from: name, to, label: iLabel >= 0 ? (r[iLabel] || '').trim() : '' })
    }
  }
  return { persons, edges }
}

export function parseTimelineTable(t) {
  const { headers, rows } = t
  const iTl = headerIndex(headers, [/时间轴/])
  const iTime = headerIndex(headers, [/时间/, /日期/])
  const iEvent = headerIndex(headers, [/事件/])
  const iDesc = headerIndex(headers, [/描述/])
  const iDocs = headerIndex(headers, [/章节/])
  const iPersons = headerIndex(headers, [/人物/])
  const groups = new Map()
  for (const r of rows) {
    const event = (iEvent >= 0 ? r[iEvent] || '' : '').trim()
    if (!event) continue
    const tlName = iTl >= 0 ? (r[iTl] || '').trim() : ''
    const key = tlName || '导入的时间轴'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({
      time: iTime >= 0 ? (r[iTime] || '').trim() : '',
      event,
      desc: iDesc >= 0 ? (r[iDesc] || '').trim() : '',
      docs:
        iDocs >= 0
          ? String(r[iDocs] || '')
              .split('、')
              .map((x) => x.trim())
              .filter(Boolean)
          : [],
      persons:
        iPersons >= 0
          ? String(r[iPersons] || '')
              .split('、')
              .map((x) => x.trim())
              .filter(Boolean)
          : []
    })
  }
  return [...groups.entries()].map(([title, segments]) => ({ title, segments }))
}

