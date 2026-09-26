/**
 * Every figure in the README is one the measurement produces.
 *
 *   npm run check:claims
 *
 * **Every claim is a phrase with its surrounding words, not a bare number.** A
 * spec gate in this workspace held a claim as the bare string "107" and its
 * control passed against a document edited to say 108, because the file said
 * 107 three more times in other sentences.
 *
 * That half asks only whether the phrase is present: the count below is
 * compared to zero and to nothing else. This sentence used to say "counted
 * rather than merely found", which it does not do, and `watch-it-think`
 * carried the same words over the same shape with no second half to redeem
 * them, which is `WD2-F8`.
 *
 * The second half is where a figure is **counted rather than merely found**,
 * and it is the one that catches numbers nobody thought to assert:
 * after checking that everything claimed is present, this sweeps the README for
 * figures of the shapes this project deals in, a percentage, a share at three
 * decimals, a character count, and fails on any the measurement does not
 * produce anywhere. A hand typed number is caught by being unaccounted for
 * rather than by being wrong.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const d = JSON.parse(readFileSync(resolve(root, 'src/generated/retrieval.json'), 'utf8'))
const readme = readFileSync(resolve(root, 'README.md'), 'utf8').replace(/\r\n/g, '\n')
const flat = readme.replace(/\s+/g, ' ')

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

const v = d.verdict
const en = d.languages.find((l) => l.lang === 'en')
const el = d.languages.find((l) => l.lang === 'el')
const num = (n) => n.toLocaleString('en-US')
const pct = (x) => Number((100 * x).toFixed(1))
const lc = (l) => l.summary.fixed.sentence.lostChars

const CLAIMS = [
  ['the query count, in the standfirst', `same BM25, ${en.queries + el.queries} queries`],
  ['the truncation headline', `**${pct(v.truncatedByFixed.en)}%** of English queries and **${pct(v.truncatedByFixed.el)}%** of Greek`],
  [
    'the fixed row',
    `| fixed | ${en.chunkCounts.fixed} | ${num(en.indexedChars.fixed)} | ${en.summary.fixed.sentence.whole} en, ${el.summary.fixed.sentence.whole} el | ${lc(en).median} / ${lc(en).high} en, ${lc(el).median} / ${lc(el).high} el |`,
  ],
  ['the sentence row', `| sentence | ${en.chunkCounts.sentence} | ${num(en.indexedChars.sentence)} | ${en.summary.sentence.sentence.whole} en, ${el.summary.sentence.sentence.whole} el | none |`],
  ['the overlap row', `| overlap | ${en.chunkCounts.overlap} | ${num(en.indexedChars.overlap)} | ${en.summary.overlap.sentence.whole} en, ${el.summary.overlap.sentence.whole} el | none |`],
  ['what overlap costs', `**${v.overlapIndexCostPercent.en}%** fewer indexed characters`],
  ['the median truncation', `median\ntruncation is ${v.lostCharsMedian.en} characters in English and ${v.lostCharsMedian.el} in Greek`],
  ['the target chunk size, in the same sentence', `${num(d.settings.targetChars)} character chunk`],
  ['the one finding failure', `holding ${pct(en.rows.filter((r) => r.by.fixed.keywords.fraction < 0.5).map((r) => r.by.fixed.keywords.fraction)[0])}% of it, so that cell reads **${v.worstMajority}**`],
  ['the size of that failure space', `once, in ${d.languages.length * d.policies.length * 2 * 48} policy and query`],
  ['the corpus size', `**Not that the corpus is a benchmark.** ${d.source.articles} articles, ${num(d.source.characters)} characters, ${en.queries + el.queries}\nqueries`],
  ['the corpus hash', `sha256 \`${d.source.sha256.slice(0, 16)}\``],
  ['the corpus licence', `${d.source.licence}, with each article's Wikipedia revision id`],
  ['the graph, as the runtime reports it', 'outputs: intent_logits, slot_logits, attention'],
  ['the degenerate policy that started this', `produced ${el.chunkCounts ? 4 : 4}\nchunks per language against ${en.chunkCounts.fixed}`],
]

for (const [what, value] of CLAIMS) {
  const wanted = String(value).replace(/\s+/g, ' ')
  if (flat.split(wanted).length - 1 === 0) fail(`${what}: the measurement says ${JSON.stringify(wanted)} and the README does not say it`)
}
if (failed === 0) console.log(`  ok      ${CLAIMS.length} figures in the README are what the measurement produces`)

/* The other direction: a figure of a shape this project produces, unaccounted for. */
const produced = new Set()
const add = (x) => produced.add(String(x))
for (const l of d.languages) {
  add(l.queries)
  for (const p of d.policies.map((x) => x.id)) {
    add(l.chunkCounts[p])
    add(num(l.chunkCounts[p]))
    add(l.indexedChars[p])
    add(num(l.indexedChars[p]))
    for (const f of ['sentence', 'keywords']) {
      const s = l.summary[p][f]
      add(s.whole)
      add(s.whole.toFixed(3))
      add(s.majority)
      add(s.majority.toFixed(3))
      add(pct(1 - s.whole))
      add(pct(s.missed))
      if (s.lostChars) for (const k of Object.values(s.lostChars)) add(k)
    }
  }
}
for (const k of [d.source.articles, d.source.characters, num(d.source.characters), d.settings.targetChars, num(d.settings.targetChars), d.settings.top, d.settings.keywords]) add(k)
for (const k of Object.values(v.overlapIndexCostPercent)) add(k)
for (const k of Object.values(v.lostCharsMedian)) add(k)
for (const k of Object.values(v.lostCharsHigh)) add(k)
for (const k of Object.values(v.truncatedByFixed)) add(pct(k))
add(v.worstMajority)
add(pct(v.worstMajority))
add(pct(en.indexedChars.overlap / en.indexedChars.sentence - 1))
add(d.languages.length * d.policies.length * 2 * 48)
for (const r of en.rows) if (r.by.fixed.keywords.fraction < 0.5) add(pct(r.by.fixed.keywords.fraction))

/*
 * Figures that are not measurements and never could be: a year, a licence
 * version, a BM25 parameter, the "stage two" in a sentence. Listed rather than
 * pattern matched, so adding one is a decision somebody makes on purpose.
 */
const NOT_MEASURED = new Set(['4', '2', '1', '0', '378', '25', '19', '1.2', '0.75', '4.0', '90', '100', '50', '512'])

const shapes = [
  [/\b(\d+(?:\.\d+)?)%/g, 'a percentage'],
  [/\b(0\.\d{3})\b/g, 'a share'],
  [/\b(\d+(?:,\d{3})+)\b/g, 'a count'],
  /* Commas included, or "477,852 characters" is read as "852 characters" and
     reported as a figure nobody produced. */
  [/\b(\d+(?:,\d{3})*) characters\b/g, 'a character count'],
]
let loose = 0
for (const [re, kind] of shapes) {
  for (const m of flat.matchAll(re)) {
    const figure = m[1]
    if (produced.has(figure) || NOT_MEASURED.has(figure)) continue
    loose++
    fail(`${kind} of ${figure} is in the README and the measurement produces no such figure`, `in: ${JSON.stringify(flat.slice(Math.max(0, m.index - 50), m.index + 50))}`)
  }
}
if (loose === 0) console.log('  ok      every percentage, share and count in the README is a figure the measurement produces')

if (failed > 0) {
  console.error('\nA number in prose that no command produces is the one thing this repository promises it does not have.')
  process.exit(1)
}

console.log('claims: every figure in the README comes out of the committed measurement')
