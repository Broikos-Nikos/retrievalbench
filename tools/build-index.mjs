/**
 * Measure the three chunking policies and write `src/generated/retrieval.json`.
 *
 *   npm run build:index
 *
 * The page reads this file and rebuilds the same indexes in the browser from
 * the same committed corpus, so every figure it shows was produced here and
 * every chunk it draws is the one measured here.
 *
 * ## Why the corpus is committed
 *
 * `data/corpus.json` is a frozen copy of `chunkline`'s, which is itself frozen
 * text from Wikipedia with each article's revision id. `chunkline` froze it
 * because two of its articles were edited within a day of being measured, and
 * re-running the same processing gave a different answer: both measurements
 * were honest, they were measurements of different documents. Copying it here
 * rather than reading the sibling repository keeps this project reproducible
 * from its own clone.
 *
 * ## Two query families, because the finding has to survive a real question
 *
 * The spec measured verbatim sentences, which is the standard self retrieval
 * task and needs no labels. A visitor does not type a sentence out of the
 * article; they type five or six words. So every query is asked twice, once as
 * the sentence and once as its longest words in the order they appear, and both
 * are reported. If the finding only holds for verbatim sentences it is a
 * property of the task rather than of the boundary, and the page would be
 * demonstrating something the numbers do not support.
 */

import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLICIES, POLICY_NOTE, chunk, coverage, index, spread, words } from '../src/lib/retrieval.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/*
 * The hash of the text, not of the bytes on this disk. Git stores text with LF
 * and checks it out with CRLF wherever `core.autocrlf` is on, so a raw hash
 * names a checkout rather than a document. Three projects in this workspace
 * shipped exactly that and every one of their builds passed locally and would
 * have failed in CI.
 */
const corpusBytes = readFileSync(resolve(root, 'data/corpus.json'))
const textSha = (buf) => createHash('sha256').update(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8').digest('hex')
const corpus = JSON.parse(corpusBytes.toString('utf8'))

/** What `chunkline`'s 512 token chunk measured as on this prose, in characters. */
const TARGET = 2084
const TOP = 5
const PER_ARTICLE = 24

/** A visitor types a handful of words, not a sentence. */
const KEYWORDS = 6

function queriesFor(article) {
  const text = article.text
  const sentences = text
    .split(/(?<=[.;!?·])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 70 && s.length <= 260 && words(s).length >= 10)
  const out = []
  for (let i = 0; i < PER_ARTICLE && sentences.length > 0; i++) {
    const s = sentences[Math.floor((i * sentences.length) / PER_ARTICLE)]
    const at = text.indexOf(s)
    if (at < 0) continue
    /*
     * The longest words, kept in the order they appear rather than sorted, so
     * the keyword query reads like something a person would type. Sorting by
     * length would produce a bag of nouns nobody writes.
     */
    const longest = new Set(
      [...words(s)]
        .sort((a, b) => b.length - a.length)
        .slice(0, KEYWORDS),
    )
    const keywords = words(s)
      .filter((w) => longest.has(w))
      .join(' ')
    out.push({ article: article.title, lang: article.lang, at, length: s.length, sentence: s, keywords })
  }
  return out
}

const byLang = new Map()
for (const a of corpus.articles) {
  if (!byLang.has(a.lang)) byLang.set(a.lang, [])
  byLang.get(a.lang).push(a)
}

const languages = []
const allChunks = {}

for (const [lang, articles] of byLang) {
  const built = {}
  for (const policy of POLICIES) {
    const chunks = []
    for (const a of articles) {
      for (const { start, end } of chunk(a.text, policy, TARGET)) {
        chunks.push({ article: a.title, start, end, text: a.text.slice(start, end) })
      }
    }
    built[policy] = { chunks, search: index(chunks) }
  }
  allChunks[lang] = Object.fromEntries(POLICIES.map((p) => [p, built[p].chunks.map(({ article, start, end }) => ({ article, start, end }))]))

  const queries = articles.flatMap(queriesFor)
  const rows = queries.map((q) => {
    const result = { article: q.article, at: q.at, length: q.length, by: {} }
    for (const policy of POLICIES) {
      const { chunks, search } = built[policy]
      result.by[policy] = {}
      for (const [family, text] of [
        ['sentence', q.sentence],
        ['keywords', q.keywords],
      ]) {
        const found = search(text, TOP)
        const top = chunks[found[0]?.i]
        const cov = coverage(top, q)
        result.by[policy][family] = { top: found[0]?.i ?? -1, ...cov }
      }
    }
    return result
  })

  const summary = {}
  for (const policy of POLICIES) {
    summary[policy] = {}
    for (const family of ['sentence', 'keywords']) {
      const covs = rows.map((r) => r.by[policy][family])
      const truncated = covs.filter((c) => c.fraction < 0.999 && c.fraction >= 0.5)
      const lost = truncated.map((c) => c.lostChars)
      summary[policy][family] = {
        whole: Number((covs.filter((c) => c.fraction >= 0.999).length / covs.length).toFixed(3)),
        majority: Number((covs.filter((c) => c.fraction >= 0.5).length / covs.length).toFixed(3)),
        missed: Number((covs.filter((c) => c.fraction < 0.5).length / covs.length).toFixed(3)),
        /*
         * The number the picture lives or dies on. A boundary that truncates
         * one query in nine but takes three characters off it is a finding
         * nobody can see, and the page would be a diagram of nothing.
         */
        lostChars: lost.length > 0 ? spread(lost) : null,
        lostShare: lost.length > 0 ? Number((lost.reduce((a, b) => a + b, 0) / truncated.reduce((a, c) => a + c.insideChars + c.lostChars, 0)).toFixed(3)) : null,
      }
    }
  }

  languages.push({
    lang,
    articles: articles.map((a) => a.title),
    queries: rows.length,
    chunkCounts: Object.fromEntries(POLICIES.map((p) => [p, built[p].chunks.length])),
    indexedChars: Object.fromEntries(POLICIES.map((p) => [p, built[p].chunks.reduce((s, c) => s + c.text.length, 0)])),
    summary,
    rows,
    queryTexts: queries.map((q) => ({ sentence: q.sentence, keywords: q.keywords })),
  })
}

const corpusText = corpus.articles.map((a) => a.text).join('')
const out = {
  built: new Date().toISOString().slice(0, 10),
  source: {
    what: "chunkline's frozen Wikipedia corpus, English and Greek, with each article's revision id",
    file: 'data/corpus.json',
    sha256: textSha(corpusBytes),
    licence: corpus.licence,
    articles: corpus.articles.length,
    characters: corpusText.length,
    gzippedBytes: gzipSync(Buffer.from(corpusText, 'utf8')).length,
  },
  settings: { targetChars: TARGET, top: TOP, perArticle: PER_ARTICLE, keywords: KEYWORDS, bm25: { k1: 1.2, b: 0.75 } },
  policies: POLICIES.map((p) => ({ id: p, note: POLICY_NOTE[p] })),
  languages,
  chunks: allChunks,
}

/*
 * The verdict, as figures a gate can hold. `truncated` is the headline: the
 * share of queries whose top result holds the answer but not all of it.
 */
const en = languages.find((l) => l.lang === 'en')
const el = languages.find((l) => l.lang === 'el')
const truncatedBy = (l, policy, family) => Number((1 - l.summary[policy][family].whole).toFixed(3))

out.verdict = {
  truncatedByFixed: { en: truncatedBy(en, 'fixed', 'sentence'), el: truncatedBy(el, 'fixed', 'sentence') },
  truncatedByFixedKeywords: { en: truncatedBy(en, 'fixed', 'keywords'), el: truncatedBy(el, 'fixed', 'keywords') },
  wholeBySentencePolicy: { en: en.summary.sentence.sentence.whole, el: el.summary.sentence.sentence.whole },
  wholeByOverlapPolicy: { en: en.summary.overlap.sentence.whole, el: el.summary.overlap.sentence.whole },
  overlapIndexCostPercent: {
    en: Number((100 * (en.indexedChars.overlap / en.indexedChars.sentence - 1)).toFixed(1)),
    el: Number((100 * (el.indexedChars.overlap / el.indexedChars.sentence - 1)).toFixed(1)),
  },
  lostCharsMedian: { en: en.summary.fixed.sentence.lostChars?.median ?? null, el: el.summary.fixed.sentence.lostChars?.median ?? null },
  lostCharsHigh: { en: en.summary.fixed.sentence.lostChars?.high ?? null, el: el.summary.fixed.sentence.lostChars?.high ?? null },
  /*
   * How often a policy fails to find the passage at all, which is the thing the
   * page says the boundary does not decide. It is not zero: one English keyword
   * query in 96 misses under the fixed policy, and the first version of this
   * recorded a boolean that said "every policy, every time" while the page
   * repeated it. The number is kept instead, so the prose has to match it.
   */
  worstMajority: Math.min(...languages.flatMap((l) => POLICIES.flatMap((p) => ['sentence', 'keywords'].map((f) => l.summary[p][f].majority)))),
  missedPairs: languages.flatMap((l) =>
    POLICIES.flatMap((p) =>
      ['sentence', 'keywords']
        .map((f) => ({ lang: l.lang, policy: p, family: f, majority: l.summary[p][f].majority, missed: l.summary[p][f].missed }))
        .filter((x) => x.majority < 1),
    ),
  ),
}

writeFileSync(resolve(root, 'src/generated/retrieval.json'), JSON.stringify(out, null, 2) + String.fromCharCode(10))

console.log(`${out.source.articles} articles, ${out.source.characters.toLocaleString('en-US')} characters, ${(out.source.gzippedBytes / 1024).toFixed(0)} KB gzipped`)
console.log(`chunks of about ${TARGET} characters, BM25 k1 ${out.settings.bm25.k1} b ${out.settings.bm25.b}, top ${TOP}`)
for (const l of languages) {
  console.log()
  console.log(`  ${l.lang}, ${l.queries} queries`)
  console.log('    policy     chunks   indexed   whole sent   whole keys   majority   lost chars med/max')
  for (const p of POLICIES) {
    const s = l.summary[p]
    const lc = s.sentence.lostChars
    console.log(
      `    ${p.padEnd(9)} ${String(l.chunkCounts[p]).padStart(6)} ${String(l.indexedChars[p].toLocaleString('en-US')).padStart(9)} ` +
        `${String(s.sentence.whole).padStart(12)} ${String(s.keywords.whole).padStart(12)} ${String(s.sentence.majority).padStart(10)} ` +
        `${String(lc ? `${lc.median}/${lc.high}` : 'none').padStart(19)}`,
    )
  }
}
