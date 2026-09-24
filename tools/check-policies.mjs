/**
 * Each policy actually produces the chunking it is named for.
 *
 *   npm run check:policies
 *
 * **This is the gate this project exists to have.** Every number on the page is
 * a comparison between policies, so a policy that silently stops doing what it
 * is named for makes all of them meaningless while every one of them still
 * looks plausible.
 *
 * That is not hypothetical. The second policy written for this measurement cut
 * at paragraphs, and on this corpus it produced **4 chunks per language against
 * 125**, a recall of exactly 1.000 and a top five overlap of exactly 1.000. It
 * reads as a clean null result, "the boundary does not matter", and it was an
 * artefact: the committed corpus is one continuous string per article with no
 * newline characters in it at all, so every article collapsed into one chunk
 * and every query trivially found the article it came from.
 *
 * Nothing in the figures could have shown that. Only the shape of the chunking
 * could, so this checks the shape:
 *
 * 1. **Coverage.** Every policy's chunks cover the whole article, with no gap.
 *    A policy that drops text scores well by having less to be wrong about.
 * 2. **Tiling.** `fixed` and `sentence` must not overlap at all, and `overlap`
 *    must overlap by the fifth it claims. That is the only difference between
 *    the first and third, so if it stops holding they are the same policy under
 *    two names.
 * 3. **The cut itself.** Every `sentence` boundary lands immediately after a
 *    sentence terminator, and `fixed` boundaries land on the multiple of the
 *    target they claim to. This is what a degenerate policy fails.
 * 4. **Comparable sizes.** At one target size the three counts must be within a
 *    factor of two. 4 against 125 is not a comparison of boundary policies, it
 *    is a comparison of chunk sizes.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLICIES, chunk } from '../src/lib/retrieval.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const corpus = JSON.parse(readFileSync(resolve(root, 'data/corpus.json'), 'utf8'))
const d = JSON.parse(readFileSync(resolve(root, 'src/generated/retrieval.json'), 'utf8'))
const TARGET = d.settings.targetChars

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

const SENTENCE_END = /[.;!?·]\s+$/u

for (const article of corpus.articles) {
  for (const policy of POLICIES) {
    const chunks = chunk(article.text, policy, TARGET)
    const where = `${article.lang} ${article.title}, ${policy}`

    if (chunks.length === 0) {
      fail(`${where}: produced no chunks at all`)
      continue
    }

    /* 1. Coverage: the union reaches both ends and leaves no hole. */
    if (chunks[0].start !== 0) fail(`${where}: the first chunk starts at ${chunks[0].start}, not 0`)
    if (chunks[chunks.length - 1].end !== article.text.length) {
      fail(`${where}: the last chunk ends at ${chunks[chunks.length - 1].end} and the article is ${article.text.length} characters`)
    }
    for (let i = 1; i < chunks.length; i++) {
      if (chunks[i].start > chunks[i - 1].end) {
        fail(`${where}: a hole between ${chunks[i - 1].end} and ${chunks[i].start}`, 'Text nobody indexed is text nobody can be wrong about.')
        break
      }
    }

    /* 2. Tiling, which is the only structural difference between fixed and overlap. */
    const overlaps = []
    for (let i = 1; i < chunks.length; i++) overlaps.push(chunks[i - 1].end - chunks[i].start)
    const maxOverlap = overlaps.length > 0 ? Math.max(...overlaps) : 0
    if (policy === 'overlap') {
      const wanted = TARGET - Math.round(TARGET * 0.8)
      const wrong = overlaps.slice(0, -1).filter((o) => o !== wanted)
      if (overlaps.length > 0 && wrong.length > 0) {
        fail(`${where}: ${wrong.length} of ${overlaps.length} joins overlap by something other than ${wanted}`, `saw ${[...new Set(wrong)].join(', ')}`)
      }
    } else if (maxOverlap !== 0) {
      fail(`${where}: chunks overlap by up to ${maxOverlap} characters and this policy does not overlap`)
    }

    /* 3. The cut itself. */
    if (policy === 'sentence') {
      const bad = chunks.slice(0, -1).filter((c) => !SENTENCE_END.test(article.text.slice(Math.max(0, c.end - 12), c.end)))
      if (bad.length > 0) {
        fail(
          `${where}: ${bad.length} of ${chunks.length - 1} cuts do not land after a sentence end`,
          `first at ${bad[0].end}: ${JSON.stringify(article.text.slice(bad[0].end - 30, bad[0].end + 10))}`,
        )
      }
    }
    if (policy === 'fixed') {
      const bad = chunks.slice(0, -1).filter((c) => c.end % TARGET !== 0)
      if (bad.length > 0) fail(`${where}: ${bad.length} fixed cuts are not on a multiple of ${TARGET}`)
    }
  }
}

if (failed === 0) console.log(`  ok      ${POLICIES.length} policies cover every article, tile as they claim, and cut where they say`)

/*
 * 4. And comparable sizes, per language, from the committed measurement rather
 * than recomputed, so this also catches a committed file that disagrees.
 */
for (const l of d.languages) {
  const counts = Object.entries(l.chunkCounts)
  const lo = Math.min(...counts.map(([, n]) => n))
  const hi = Math.max(...counts.map(([, n]) => n))
  if (hi / lo > 2) {
    fail(
      `${l.lang}: the policies produce wildly different chunk counts, ${counts.map(([n, c]) => `${n} ${c}`).join(', ')}`,
      'At one target size they should be close. A factor of two means one is not doing what it is named for,\n' +
        '      which is exactly how the paragraph policy produced 4 chunks against 125 and a null result that was an artefact.',
    )
  } else if (new Set(counts.map(([, n]) => n)).size === 1) {
    fail(`${l.lang}: all three policies produce exactly ${lo} chunks`, 'Three names for one chunking is not a leaderboard.')
  } else {
    console.log(`  ok      ${l.lang}: three distinct chunkings at one target, ${counts.map(([n, c]) => `${n} ${c}`).join(', ')}`)
  }
}

if (failed > 0) {
  console.error('\nA policy that silently degenerates reports a clean null result, and every figure around it still looks right.')
  process.exit(1)
}

console.log('policies: every policy produces the chunking it is named for')
