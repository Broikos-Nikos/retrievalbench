/**
 * Every figure in the committed measurement recomputes from the hashed corpus.
 *
 *   npm run check:index
 *
 * The page reads `src/generated/retrieval.json` for its leaderboard and
 * rebuilds the indexes in the browser for everything else, so this holds the
 * committed file to the corpus it claims to come from, query by query rather
 * than in aggregate. Two different evaluations can average to the same score
 * while no two of their rows agree, and an earlier gate in this workspace
 * compared two rounded aggregates and called them identical.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLICIES, chunk, coverage, index, words } from '../src/lib/retrieval.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const corpusBytes = readFileSync(resolve(root, 'data/corpus.json'))
const corpus = JSON.parse(corpusBytes.toString('utf8'))
const d = JSON.parse(readFileSync(resolve(root, 'src/generated/retrieval.json'), 'utf8'))

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

/*
 * The hash of the text, not of the bytes on this disk. Git stores text with LF
 * and checks it out with CRLF wherever `core.autocrlf` is on, so a raw hash
 * names a checkout rather than a document. Three projects in this workspace
 * recorded raw hashes and every one of their builds passed locally and would
 * have failed in CI on the first push.
 */
const textSha = (buf) => createHash('sha256').update(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8').digest('hex')
const now = textSha(corpusBytes)
if (now !== d.source.sha256) {
  fail(
    'data/corpus.json is not the file these figures were computed from',
    `recorded ${d.source.sha256.slice(0, 16)}, on disk ${now.slice(0, 16)}\n      Re-run npm run build:index and update every number that moved.`,
  )
} else {
  console.log(`  ok      the corpus is the file measured, sha256 ${now.slice(0, 16)}, ${d.source.articles} articles`)
}

/*
 * The public copy, which is what the page actually fetches. A page that reads a
 * different corpus from the one the leaderboard was measured on would agree
 * with itself perfectly and be wrong about everything.
 */
const served = textSha(readFileSync(resolve(root, 'public/corpus.json')))
if (served !== d.source.sha256) {
  fail('public/corpus.json is not the corpus that was measured', `served ${served.slice(0, 16)}, measured ${d.source.sha256.slice(0, 16)}`)
} else {
  console.log('  ok      the corpus the page fetches is the corpus that was measured')
}

const TARGET = d.settings.targetChars
const TOP = d.settings.top

let rowsChecked = 0
for (const l of d.languages) {
  const theirs = corpus.articles.filter((a) => a.lang === l.lang)
  const built = {}
  for (const policy of POLICIES) {
    const chunks = []
    for (const a of theirs) for (const { start, end } of chunk(a.text, policy, TARGET)) chunks.push({ article: a.title, start, end, text: a.text.slice(start, end) })
    built[policy] = { chunks, search: index(chunks) }
    if (chunks.length !== l.chunkCounts[policy]) {
      fail(`${l.lang} ${policy}: committed ${l.chunkCounts[policy]} chunks, recomputed ${chunks.length}`)
    }
    const chars = chunks.reduce((s, c) => s + c.text.length, 0)
    if (chars !== l.indexedChars[policy]) fail(`${l.lang} ${policy}: committed ${l.indexedChars[policy]} indexed characters, recomputed ${chars}`)
  }

  for (const [i, row] of l.rows.entries()) {
    const q = l.queryTexts[i]
    for (const policy of POLICIES) {
      for (const [family, text] of [
        ['sentence', q.sentence],
        ['keywords', q.keywords],
      ]) {
        const { chunks, search } = built[policy]
        const found = search(text, TOP)
        const top = chunks[found[0]?.i]
        const cov = coverage(top, { article: row.article, at: row.at, length: row.length })
        const committed = row.by[policy][family]
        for (const k of ['fraction', 'insideChars', 'lostChars', 'lostBefore', 'lostAfter']) {
          if (cov[k] !== committed[k]) {
            fail(
              `${l.lang} query ${i} under ${policy}, ${family}: ${k} is ${committed[k]} and recomputes to ${cov[k]}`,
              'The page draws the committed span, so this is a marked passage in the wrong place.',
            )
            /* One is enough. 1,152 of the same message is not more evidence. */
            finish()
          }
        }
        rowsChecked++
      }
    }
  }

  /* And the summary, which is what the leaderboard prints. */
  for (const policy of POLICIES) {
    for (const family of ['sentence', 'keywords']) {
      const covs = l.rows.map((r) => r.by[policy][family])
      const whole = Number((covs.filter((c) => c.fraction >= 0.999).length / covs.length).toFixed(3))
      const majority = Number((covs.filter((c) => c.fraction >= 0.5).length / covs.length).toFixed(3))
      const s = l.summary[policy][family]
      if (whole !== s.whole) fail(`${l.lang} ${policy} ${family}: committed whole ${s.whole}, recomputed ${whole}`)
      if (majority !== s.majority) fail(`${l.lang} ${policy} ${family}: committed majority ${s.majority}, recomputed ${majority}`)
    }
  }
}

if (failed === 0) console.log(`  ok      ${rowsChecked} query results across ${POLICIES.length} policies and two query families recompute exactly`)

/*
 * And the keyword family is really a different query. It scores identically to
 * the sentence family to three decimals, which is the shape of a copy and paste
 * mistake, so it is checked rather than assumed: the two must retrieve a
 * different chunk somewhere, or one of them is not being asked.
 */
let differ = 0
for (const l of d.languages) for (const r of l.rows) for (const p of POLICIES) if (r.by[p].sentence.top !== r.by[p].keywords.top) differ++
if (differ === 0) {
  fail(
    'the keyword family retrieves exactly the same chunk as the sentence family for every query',
    'Identical scores are expected; identical results everywhere means one query is being asked twice.',
  )
} else {
  console.log(`  ok      the keyword family is a different query, retrieving a different chunk in ${differ} cases`)
}

/* A keyword query is meant to be short. If it is the sentence, nothing is tested. */
for (const l of d.languages) {
  const same = l.queryTexts.filter((q) => q.keywords.trim() === q.sentence.trim()).length
  if (same > 0) fail(`${l.lang}: ${same} keyword queries are identical to their sentence`)
  else {
    const ratio = l.queryTexts.reduce((a, q) => a + words(q.keywords).length / words(q.sentence).length, 0) / l.queryTexts.length
    console.log(`  ok      ${l.lang}: a keyword query is ${(100 * ratio).toFixed(0)}% of its sentence by word count`)
  }
}

finish()

function finish() {
  if (failed > 0) {
    console.error('\nThe leaderboard is a committed file. A committed file nothing recomputes is a number typed by hand with extra steps.')
    process.exit(1)
  }
  console.log('index: every chunk, ranking and score recomputes from the hashed corpus')
}
