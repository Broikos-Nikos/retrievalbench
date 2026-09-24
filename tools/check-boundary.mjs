/**
 * The claim on the front of this page is still true of the corpus.
 *
 *   npm run check:boundary
 *
 * Unusual, on purpose: this does not fail when the code stops matching the
 * data. It fails when **the data stops supporting the headline**, which is a
 * statement about eight Wikipedia articles rather than about anything in this
 * repository.
 *
 * Four claims, and they fail for different reasons.
 *
 * 1. **A fixed cut truncates.** If it stops, there is no project: the whole
 *    page is the difference between the policies.
 * 2. **Sentence alignment does not.** If it starts truncating, the
 *    recommendation on the front is wrong.
 * 3. **Every policy finds the neighbourhood.** The claim is that the boundary
 *    decides wholeness and not finding. If finding comes into play, the claim
 *    is a different one and the page has to say something else.
 * 4. **The truncation is visible.** A boundary that truncates one query in nine
 *    but takes three characters off it is a finding nobody can see, and the
 *    picture would be a diagram of nothing. The median loss is the number the
 *    page's whole design rests on.
 *
 * Every threshold sits clear of the measured value, because a gate tuned to
 * today's number fails on noise and gets deleted. Measured 2026-09-25: 11.5%
 * and 5.2% truncation, 1.000 whole for sentence alignment, a median loss of 10
 * characters in English and 26 in Greek.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const d = JSON.parse(readFileSync(resolve(root, 'src/generated/retrieval.json'), 'utf8'))
const v = d.verdict

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

const pct = (x) => `${(100 * x).toFixed(1)}%`

const TRUNCATION_FLOOR = 0.03
const VISIBLE_CHARS = 5

const worst = Math.min(...Object.values(v.truncatedByFixed))
if (worst < TRUNCATION_FLOOR) {
  fail(
    `a fixed cut now truncates only ${pct(worst)} of queries in its weaker language`,
    `Floor ${pct(TRUNCATION_FLOOR)}. The page leads on this difference. Without it there is nothing to show.`,
  )
} else {
  console.log(`  ok      a fixed cut still truncates ${pct(v.truncatedByFixed.en)} of English and ${pct(v.truncatedByFixed.el)} of Greek queries`)
}

for (const [lang, whole] of Object.entries(v.wholeBySentencePolicy)) {
  if (whole < 1) {
    fail(
      `sentence alignment now truncates ${pct(1 - whole)} of ${lang} queries`,
      'The page recommends it precisely because it does not. Change the recommendation rather than keep making it.',
    )
  }
}
if (failed === 0) console.log('  ok      sentence alignment still returns every answer whole, in both languages')

/*
 * Finding, as a number rather than as "every time".
 *
 * The first version of this asserted a boolean, "every policy finds the
 * neighbourhood, every time", and the page said so too. It is not true: one
 * English keyword query in 96 misses entirely under the fixed policy, which is
 * 0.990 rather than 1.000. The gate caught the page repeating a figure the
 * measurement did not support, which is exactly the shape this workspace keeps
 * finding, so the threshold is a floor and the exception is printed.
 */
const FINDING_FLOOR = 0.97
if (v.worstMajority < FINDING_FLOOR) {
  fail(
    `a policy now returns a passage holding most of the query for only ${v.worstMajority} of queries`,
    `Floor ${FINDING_FLOOR}. The claim is that the boundary decides wholeness, not finding. Below this it decides both,\n` +
      '      and the page has to argue something else.',
  )
} else if (v.missedPairs.length === 0) {
  console.log('  ok      every policy returns a passage holding most of the query, in both languages and both query families')
} else {
  console.log(
    `  ok      finding holds at ${v.worstMajority} or better, with ${v.missedPairs.length} exception: ` +
      v.missedPairs.map((m) => `${m.lang} ${m.policy} ${m.family} ${m.majority}`).join(', '),
  )
}

/*
 * And the one the picture depends on. This was measured before the page was
 * designed, and it changed the design: the spec proposed greying the lost tail
 * inside the returned chunk, and at a median of 10 characters inside 2,084
 * that would have been invisible. The page draws the query instead, where 10
 * characters is a tenth of it.
 */
for (const [lang, median] of Object.entries(v.lostCharsMedian)) {
  if (median === null) {
    fail(`${lang}: no query is truncated at all, so there is nothing for the picture to draw`)
  } else if (median < VISIBLE_CHARS) {
    fail(
      `${lang}: a truncated query now loses a median of ${median} characters`,
      `Floor ${VISIBLE_CHARS}. Below this the picture shows a difference nobody can see, whatever the percentage says.`,
    )
  } else {
    console.log(`  ok      ${lang}: a truncated query loses a median of ${median} characters, worst ${v.lostCharsHigh[lang]}`)
  }
}

if (failed > 0) {
  console.error('\nThis gate fails when the corpus changes, not when the code does. That is what it is for.')
  process.exit(1)
}

console.log('boundary: the claim on the front of the page is still true of the corpus it is about')
