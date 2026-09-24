/**
 * The page.
 *
 * It runs the real retriever. Every chunk boundary, index and ranking a visitor
 * sees is computed here by the same `src/lib/retrieval.mjs` that produced
 * `src/generated/retrieval.json`, so a query nobody anticipated is answered by
 * the instrument the leaderboard measured rather than by a lookup table.
 *
 * The one thing it does not recompute is the leaderboard, which is read from
 * the committed measurement. That is the split `evalkit` arrived at the
 * expensive way: its page recomputed a threshold with its own rounding, the
 * headline said 177 while the library said 178, the build passed, and nine
 * assertions stayed green.
 *
 * ## The corpus arrives after the page
 *
 * 646 KB of frozen Wikipedia, 195 KB over the wire, which is most of what this
 * page weighs. It is fetched rather than bundled so the claim and the
 * leaderboard paint immediately and the instrument fills in, and the input says
 * so while it is loading rather than sitting there looking broken. `tokenlab`
 * shipped the other arrangement once and its page was a styled skeleton for
 * four seconds with nothing saying why.
 */

import './style.css'
import data from './generated/retrieval.json'
// @ts-expect-error the library is plain JavaScript, shared with the builder and
// every gate on purpose: a typed second copy for the browser is two
// implementations of one piece of arithmetic, which agree about a mistake
// sooner or later.
import { chunk, coverage, index, words } from './lib/retrieval.mjs'

type Chunk = { article: string; start: number; end: number; text: string }
type Hit = { i: number; score: number }
type Article = { lang: string; title: string; text: string; url: string; revision: string }

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id)
  if (!node) throw new Error(`the page is missing #${id}`)
  return node as T
}

const POLICIES = data.policies.map((p) => p.id)
const LANGS = data.languages.map((l) => l.lang)
const LANG_LABEL: Record<string, string> = { en: 'English', el: 'Greek' }

const state = {
  policy: 'fixed',
  lang: 'en',
  query: '',
  /** The span the query was taken from, when it came from the measurement. */
  span: null as null | { article: string; at: number; length: number },
}

let articles: Article[] = []
const built = new Map<string, { chunks: Chunk[]; search: (q: string, top?: number) => Hit[] }>()

const fmt = (n: number) => n.toLocaleString('en-US')
const pct = (n: number) => `${(100 * n).toFixed(1)}%`

/* ---------- the committed figures, painted before anything loads ---------- */

const v = data.verdict
el('kpi-fixed').textContent = pct(v.truncatedByFixed.en)
el('kpi-fixed-unit').textContent = `of English queries, ${pct(v.truncatedByFixed.el)} of Greek`
el('kpi-sentence').textContent = v.wholeBySentencePolicy.en.toFixed(3)
el('kpi-overlap').textContent = `${v.overlapIndexCostPercent.en}%`
el('kpi-overlap-unit').textContent =
  `more index than sentence alignment, which already returns ${v.wholeBySentencePolicy.en.toFixed(3)} of answers whole`
el('board-queries').textContent = String(data.languages.reduce((a, l) => a + l.queries, 0))
el('method-provenance').textContent =
  `${data.source.articles} articles, ${fmt(data.source.characters)} characters, frozen and hashed: ` +
  `${data.source.file} sha256 ${data.source.sha256.slice(0, 16)}, ${data.source.licence}. ` +
  `Chunks of about ${fmt(data.settings.targetChars)} characters, BM25 k1 ${data.settings.bm25.k1} b ${data.settings.bm25.b}, top ${data.settings.top}. ` +
  `Built ${data.built}.`

drawSegments()
drawBoard()

/* ---------- then the corpus ---------- */

void load()

async function load() {
  const res = await fetch(`${import.meta.env.BASE_URL}corpus.json`, { cache: 'force-cache' })
  if (!res.ok) {
    el('verdict').textContent = `The corpus did not load: ${res.status}. Every figure above is still the committed measurement.`
    return
  }
  const corpus = (await res.json()) as { articles: Article[] }
  articles = corpus.articles

  const started = performance.now()
  for (const lang of LANGS) {
    const theirs = articles.filter((a) => a.lang === lang)
    for (const policy of POLICIES) {
      const chunks: Chunk[] = []
      for (const a of theirs) {
        for (const { start, end } of chunk(a.text, policy, data.settings.targetChars) as Array<{ start: number; end: number }>) {
          chunks.push({ article: a.title, start, end, text: a.text.slice(start, end) })
        }
      }
      built.set(`${lang}:${policy}`, { chunks, search: index(chunks) })
    }
  }
  const ms = Math.round(performance.now() - started)

  const input = el<HTMLInputElement>('q')
  input.disabled = false
  input.placeholder = 'a sentence, or a few words'
  el<HTMLSelectElement>('preset').disabled = false
  input.addEventListener('input', () => {
    state.query = input.value
    state.span = null
    render()
  })

  drawPresets()
  el('verdict').textContent = `${built.size} indexes over ${fmt(articles.length)} articles, built in this browser in ${ms} ms.`
  pick(0)
}

/* ---------- controls ---------- */

function drawSegments() {
  for (const [id, values, label] of [
    ['policy', POLICIES, (x: string) => x],
    ['lang', LANGS, (x: string) => LANG_LABEL[x] ?? x],
  ] as const) {
    const host = el(id)
    host.textContent = ''
    for (const value of values) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'seg-btn'
      b.dataset.value = value
      b.setAttribute('role', 'radio')
      b.textContent = label(value)
      const note = data.policies.find((p) => p.id === value)?.note
      if (note) b.title = note
      b.addEventListener('click', () => {
        if (id === 'policy') state.policy = value
        else {
          state.lang = value
          drawPresets()
          pick(0)
          return
        }
        render()
      })
      host.appendChild(b)
    }
  }
}

/**
 * The preset list leads with the queries a fixed cut truncates, worst first,
 * because a visitor who arrives and picks the first thing in the list should
 * land on the case this page is about rather than on one of the 85 where
 * nothing happens.
 */
function presets() {
  const lang = data.languages.find((l) => l.lang === state.lang)
  if (!lang) return []
  return lang.rows
    .map((r, i) => ({ ...r, text: lang.queryTexts[i].sentence, lost: r.by.fixed.sentence.lostChars }))
    .sort((a, b) => b.lost - a.lost)
}

function drawPresets() {
  const sel = el<HTMLSelectElement>('preset')
  sel.textContent = ''
  presets().forEach((p, i) => {
    const o = document.createElement('option')
    o.value = String(i)
    o.textContent = (p.lost > 0 ? `${p.lost} characters lost: ` : '') + p.text.slice(0, 70)
    sel.appendChild(o)
  })
  sel.onchange = () => pick(Number(sel.value))
}

function pick(i: number) {
  const p = presets()[i]
  if (!p) return
  state.query = p.text
  state.span = { article: p.article, at: p.at, length: p.length }
  el<HTMLInputElement>('q').value = p.text
  el<HTMLSelectElement>('preset').value = String(i)
  render()
}

/* ---------- the instrument ---------- */

function render() {
  for (const b of document.querySelectorAll<HTMLButtonElement>('.seg-btn')) {
    const on = b.dataset.value === state.policy || b.dataset.value === state.lang
    b.classList.toggle('is-on', on)
    b.setAttribute('aria-checked', String(on))
  }

  const bundle = built.get(`${state.lang}:${state.policy}`)
  const paper = el('paper')
  const ranked = el('ranked')
  paper.textContent = ''
  ranked.textContent = ''
  if (!bundle || state.query.trim() === '') return

  const hits = bundle.search(state.query, data.settings.top)
  if (hits.length === 0 || hits[0].score === 0) {
    el('verdict').textContent = 'Nothing in this corpus shares a word with that.'
    el('paper-alt').textContent = ''
    return
  }

  const top = bundle.chunks[hits[0].i]
  const span = state.span
  const cov = span ? coverage(top, span) : null

  /*
   * The picture. The chunk is drawn as the text it is, with the boundary above
   * and below it as a rule, and the query's own characters marked inside it.
   * What the chunk does not contain is drawn beyond the rule in grey, which is
   * the whole finding: the cut passes through the sentence and the part that
   * answers the question is on the other side.
   */
  const article = articles.find((a) => a.title === top.article)
  if (!article) return

  const frag = document.createDocumentFragment()
  frag.appendChild(rule(`${top.article}, characters ${fmt(top.start)} to ${fmt(top.end)}`))

  if (span && cov && cov.lostBefore > 0) {
    frag.appendChild(lost(article.text.slice(span.at, span.at + cov.lostBefore), 'before'))
    frag.appendChild(rule('the cut'))
  }

  const body = document.createElement('div')
  body.className = 'chunk'
  const inside = article.text.slice(top.start, top.end)
  if (span && cov && cov.insideChars > 0) {
    const from = Math.max(top.start, span.at) - top.start
    const to = from + cov.insideChars
    body.appendChild(document.createTextNode(clip(inside.slice(0, from), 'head')))
    const mark = document.createElement('mark')
    mark.textContent = inside.slice(from, to)
    body.appendChild(mark)
    body.appendChild(document.createTextNode(clip(inside.slice(to), 'tail')))
  } else {
    body.appendChild(document.createTextNode(clip(inside, 'both')))
  }
  frag.appendChild(body)

  if (span && cov && cov.lostAfter > 0) {
    frag.appendChild(rule('the cut'))
    frag.appendChild(lost(article.text.slice(span.at + span.length - cov.lostAfter, span.at + span.length), 'after'))
  }
  frag.appendChild(rule(`${fmt(top.end - top.start)} characters in this chunk`))
  paper.appendChild(frag)

  const verdict = el('verdict')
  if (!cov) {
    verdict.textContent = `Top result: ${top.article}, characters ${fmt(top.start)} to ${fmt(top.end)}. Typed queries have no known span, so nothing is marked.`
  } else if (cov.fraction >= 0.999) {
    verdict.innerHTML = `<strong class="good">Whole.</strong> The top result contains all ${fmt(span!.length)} characters of the query.`
  } else {
    verdict.innerHTML =
      `<strong class="bad">Truncated.</strong> The top result holds ${pct(cov.fraction)} of the query. ` +
      `<strong>${cov.lostChars} characters</strong> are on the other side of the cut.`
  }

  el('paper-alt').textContent =
    `The top result for this query under the ${state.policy} policy: ${top.article}, characters ${fmt(top.start)} to ${fmt(top.end)}. ` +
    (cov && cov.fraction < 0.999
      ? `${cov.lostChars} characters of the query fall outside it and are shown in grey beyond the rule.`
      : 'The whole query is inside it, marked.')

  for (const [rank, h] of hits.entries()) {
    const c = bundle.chunks[h.i]
    const hc = span ? coverage(c, span) : null
    const tr = document.createElement('tr')
    if (rank === 0) tr.className = 'is-top'
    const cells = [
      String(rank + 1),
      `${c.article} ${fmt(c.start)}–${fmt(c.end)}`,
      h.score.toFixed(2),
      hc ? (hc.fraction >= 0.999 ? 'all of it' : hc.fraction > 0 ? pct(hc.fraction) : 'none') : '—',
    ]
    cells.forEach((text, i) => {
      const cell = document.createElement(i === 1 ? 'th' : 'td')
      if (i === 1) cell.setAttribute('scope', 'row')
      cell.textContent = text
      tr.appendChild(cell)
    })
    ranked.appendChild(tr)
  }
}

/** Long chunks are clipped for reading, from the end furthest from the mark. */
function clip(s: string, side: 'head' | 'tail' | 'both') {
  const LIMIT = 420
  if (s.length <= LIMIT) return s
  if (side === 'head') return `… ${s.slice(-LIMIT)}`
  if (side === 'tail') return `${s.slice(0, LIMIT)} …`
  return `${s.slice(0, LIMIT)} … ${s.slice(-LIMIT)}`
}

function rule(label: string) {
  const d = document.createElement('div')
  d.className = 'rule'
  d.innerHTML = `<span>${label}</span>`
  return d
}

function lost(text: string, where: 'before' | 'after') {
  const d = document.createElement('div')
  d.className = `chunk chunk--lost chunk--${where}`
  d.textContent = text
  return d
}

/* ---------- the leaderboard, from the committed measurement ---------- */

function drawBoard() {
  const body = el('scores')
  body.textContent = ''
  for (const lang of data.languages) {
    const head = document.createElement('tr')
    head.className = 'group'
    const th = document.createElement('th')
    th.colSpan = 7
    th.scope = 'colgroup'
    th.textContent = `${LANG_LABEL[lang.lang] ?? lang.lang}, ${lang.queries} queries, ${lang.articles.length} articles`
    head.appendChild(th)
    body.appendChild(head)

    for (const policy of POLICIES) {
      const s = lang.summary[policy as 'fixed']
      const lc = s.sentence.lostChars
      const tr = document.createElement('tr')
      if (s.sentence.whole === 1) tr.className = 'is-clean'
      const cells = [
        policy,
        fmt(lang.chunkCounts[policy as 'fixed']),
        fmt(lang.indexedChars[policy as 'fixed']),
        s.sentence.whole.toFixed(3),
        s.keywords.whole.toFixed(3),
        s.sentence.majority.toFixed(3),
        lc ? `${lc.median} / ${lc.high}` : 'none',
      ]
      cells.forEach((text, i) => {
        const cell = document.createElement(i === 0 ? 'th' : 'td')
        if (i === 0) cell.setAttribute('scope', 'row')
        cell.textContent = text
        tr.appendChild(cell)
      })
      body.appendChild(tr)
    }
  }

  const en = data.languages.find((l) => l.lang === 'en')!
  const missed = v.missedPairs
    .map((m) => `${LANG_LABEL[m.lang] ?? m.lang} ${m.policy}, ${m.family} queries, at ${m.majority.toFixed(3)}`)
    .join('; ')
  el('board-note').textContent =
    `The overlap policy is what production pipelines ship so an answer is never cut in half. It works, and so does ` +
    `sentence alignment, for ${fmt(en.indexedChars.overlap - en.indexedChars.sentence)} fewer indexed characters in English alone. ` +
    `Both return the whole answer on every one of these queries. ` +
    (missed
      ? `The one majority cell below 1.000 is ${missed}: a single query whose longest words point somewhere else in the same article.`
      : 'Every majority cell is 1.000.')
}

void words
