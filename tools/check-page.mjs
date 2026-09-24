/**
 * What a visitor actually sees, held to the library that computed it.
 *
 *   npm run check:page          (or npm run verify, which starts the server)
 *
 * Every other gate reads files. This one reads the rendered page, because the
 * defect this project most plausibly ships with after a degenerate policy is
 * **a passage marked in the wrong place**.
 *
 * The page slices the article by character offsets to decide what is inside the
 * returned chunk and what fell outside it. An off-by-one, a stale article, or a
 * clip applied to the wrong side would highlight the wrong words while every
 * number on the page stayed exactly right, the leaderboard stayed green, and
 * the picture quietly argued for something that never happened. `tokenlab`
 * shipped the same shape once: nothing anywhere asserted that a single
 * fractured chip was ever drawn, so the entire visual payload could have
 * vanished silently.
 *
 * So this reads the marked text and the lost text out of the DOM and compares
 * them character for character against what `coverage()` says they must be, for
 * every policy, in both languages.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'
import { POLICIES, chunk, coverage, index } from '../src/lib/retrieval.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const d = JSON.parse(readFileSync(resolve(root, 'src/generated/retrieval.json'), 'utf8'))
const corpus = JSON.parse(readFileSync(resolve(root, 'data/corpus.json'), 'utf8'))

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}
const ok = (what) => console.log(`  ok      ${what}`)

const server = process.env.RETRIEVALBENCH_URL ? await useShared(process.env.RETRIEVALBENCH_URL) : await serve()
const browser = await chromium.launch()

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  await page.goto(server.url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.querySelectorAll('#paper .chunk').length > 0, null, { timeout: 60_000 })

  /* 1. The three figures a ten second reader takes away. */
  const v = d.verdict
  const pct = (x) => `${(100 * x).toFixed(1)}%`
  for (const [id, want] of [
    ['kpi-fixed', pct(v.truncatedByFixed.en)],
    ['kpi-sentence', v.wholeBySentencePolicy.en.toFixed(3)],
    ['kpi-overlap', `${v.overlapIndexCostPercent.en}%`],
  ]) {
    const got = (await page.textContent(`#${id}`))?.trim()
    if (got === want) ok(`${id}: ${got}`)
    else fail(`${id}`, `the page says ${JSON.stringify(got)}, the measurement says ${JSON.stringify(want)}`)
  }

  /*
   * 2. The mark, in both languages and under every policy.
   *
   * The query is the one the page opens on, which is the worst truncation in
   * that language, so the case with the most to get wrong is the case checked.
   */
  for (const lang of d.languages.map((l) => l.lang)) {
    await page.click(`#lang .seg-btn[data-value="${lang}"]`)
    const articles = corpus.articles.filter((a) => a.lang === lang)
    const query = await page.inputValue('#q')

    /* Where the page says it is, according to the library rather than the page. */
    const span = findSpan(articles, query)
    if (!span) {
      fail(`${lang}: the query the page opened on is not a verbatim span of any article`, JSON.stringify(query.slice(0, 80)))
      continue
    }

    for (const policy of POLICIES) {
      await page.click(`#policy .seg-btn[data-value="${policy}"]`)
      const chunks = []
      for (const a of articles) for (const { start, end } of chunk(a.text, policy, d.settings.targetChars)) chunks.push({ article: a.title, start, end, text: a.text.slice(start, end) })
      const search = index(chunks)
      const top = chunks[search(query, d.settings.top)[0].i]
      const cov = coverage(top, span)
      const article = articles.find((a) => a.title === span.article)

      const shown = await page.evaluate(() => ({
        mark: document.querySelector('#paper mark')?.textContent ?? '',
        before: document.querySelector('#paper .chunk--before')?.textContent ?? '',
        after: document.querySelector('#paper .chunk--after')?.textContent ?? '',
        rules: document.querySelectorAll('#paper .rule').length,
      }))

      const wantMark = article.text.slice(Math.max(top.start, span.at), Math.min(top.end, span.at + span.length))
      if (shown.mark !== wantMark) {
        fail(
          `${lang} ${policy}: the marked text is not the part of the query inside the returned chunk`,
          `page marked ${shown.mark.length} characters, the library says ${wantMark.length}\n` +
            `      page:    ${JSON.stringify(shown.mark.slice(0, 60))}\n` +
            `      library: ${JSON.stringify(wantMark.slice(0, 60))}`,
        )
        continue
      }

      const wantBefore = cov.lostBefore > 0 ? article.text.slice(span.at, span.at + cov.lostBefore) : ''
      const wantAfter = cov.lostAfter > 0 ? article.text.slice(span.at + span.length - cov.lostAfter, span.at + span.length) : ''
      if (shown.before !== wantBefore || shown.after !== wantAfter) {
        fail(
          `${lang} ${policy}: the greyed text is not what fell outside the chunk`,
          `before: page ${JSON.stringify(shown.before)} against ${JSON.stringify(wantBefore)}\n` +
            `      after:  page ${JSON.stringify(shown.after)} against ${JSON.stringify(wantAfter)}`,
        )
        continue
      }

      const lost = shown.before.length + shown.after.length
      if (lost !== cov.lostChars) fail(`${lang} ${policy}: the page greys ${lost} characters and the library says ${cov.lostChars}`)
      else ok(`${lang} ${policy}: ${shown.mark.length} characters marked, ${lost} greyed, both exactly what the library computes`)
    }
  }

  /*
   * 3. And the thing the mark exists for: under the fixed policy the opening
   * query must actually be truncated, and under sentence alignment it must not.
   * If both come back whole the page is showing a case that makes no argument.
   */
  await page.click(`#lang .seg-btn[data-value="en"]`)
  await page.click(`#policy .seg-btn[data-value="fixed"]`)
  const truncated = (await page.textContent('#verdict')) ?? ''
  await page.click(`#policy .seg-btn[data-value="sentence"]`)
  const whole = (await page.textContent('#verdict')) ?? ''
  if (!truncated.includes('Truncated') || !whole.includes('Whole')) {
    fail(
      'the query the page opens on does not show the difference the page is about',
      `fixed said ${JSON.stringify(truncated.slice(0, 70))}, sentence said ${JSON.stringify(whole.slice(0, 70))}`,
    )
  } else {
    ok('the opening query is truncated under the fixed policy and whole under sentence alignment')
  }

  await page.close()

  /* 4. The phone. */
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await phone.goto(server.url, { waitUntil: 'networkidle' })
  await phone.waitForFunction(() => document.querySelectorAll('#paper .chunk').length > 0, null, { timeout: 60_000 })
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (overflow > 0) fail(`the page scrolls sideways by ${overflow}px at 390`)
  else ok('no horizontal overflow at 390')
  await phone.close()
} finally {
  await browser.close()
  server.stop()
}

/** The first verbatim occurrence of `text` in any of these articles. */
function findSpan(articles, text) {
  for (const a of articles) {
    const at = a.text.indexOf(text)
    if (at >= 0) return { article: a.title, at, length: text.length }
  }
  return null
}

if (failed > 0) {
  console.error('\nThe picture is the claim. A passage marked in the wrong place argues for something that never happened.')
  process.exit(1)
}

console.log('page: every figure and every marked character a visitor sees comes from the library that measured it')
