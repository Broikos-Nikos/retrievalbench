/**
 * The recording at the top of the README is of this page, in this state.
 *
 *   npm run check:capture      (or npm run verify, which starts the server)
 *
 * A README picture is a claim, and it is the claim most likely to go quietly
 * stale: the page changes, the GIF does not, and nothing anywhere notices. That
 * has happened in this workspace already, to a headline that changed one commit
 * after its picture was taken.
 *
 * So four things, and the first is the one that matters.
 *
 * 1. **The state the recording ends on is a state the live page still reaches.**
 *    `docs/capture.json` records what `npm run capture` drove the page to, and
 *    this drives the same clicks and compares. A control that ends somewhere
 *    else fails here rather than in a reader's browser.
 * 2. **The GIF is the byte-for-byte size the capture wrote**, held to
 *    `docs/capture.json` rather than to a round ceiling. A fixed ceiling
 *    permits silent growth right up to it, which is an open finding against
 *    `tokenlab`, whose cap is 4 MB over a picture of 2.77 MB. Here any change
 *    at all appears as a diff in the manifest and has to be committed on
 *    purpose. The absolute ceiling below is a second, blunter limit for the
 *    thing the first cannot see: a re-capture that is deliberately enormous.
 * 3. The README points at the file that exists.
 * 4. The alt text says what the picture shows, with the figure in it.
 */

import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const gifPath = resolve(root, 'docs/cut.gif')
const statePath = resolve(root, 'docs/capture.json')

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

for (const [label, p] of [
  ['docs/cut.gif', gifPath],
  ['docs/capture.json', statePath],
]) {
  if (!existsSync(p)) {
    console.error(`FAIL  ${label} is missing. Run npm run capture.`)
    process.exit(1)
  }
}

const recorded = JSON.parse(readFileSync(statePath, 'utf8'))
const bytes = statSync(gifPath).size

/* A GIF, by its own header, not by its extension. */
const head = readFileSync(gifPath).subarray(0, 6).toString('latin1')
if (!head.startsWith('GIF8')) fail(`docs/cut.gif does not begin with a GIF header, it begins ${JSON.stringify(head)}`)
else console.log(`  ok      docs/cut.gif is a GIF, ${(bytes / 1e6).toFixed(2)} MB`)

/* The size the capture wrote, to the byte. */
if (recorded.bytes === undefined) {
  fail('docs/capture.json records no size', 'Re-run npm run capture. A picture with no recorded size has nothing to be held to.')
} else if (bytes !== recorded.bytes) {
  fail(
    `docs/cut.gif is ${bytes} bytes and the capture wrote ${recorded.bytes}`,
    `${bytes > recorded.bytes ? 'Grown' : 'Shrunk'} by ${Math.abs(bytes - recorded.bytes)} bytes since the recording.\n` +
      '      Re-run npm run capture so the manifest and the picture are one act rather than two.',
  )
} else {
  console.log(`  ok      docs/cut.gif is the ${bytes} bytes the capture wrote`)
}

/*
 * And a blunt absolute limit, set by hand and only ever lowered, for the thing
 * the byte check cannot see: a re-capture that is deliberately enormous. A
 * README picture nobody waits for is a README with no picture.
 */
const CEILING = 900_000
if (bytes > CEILING) {
  fail(
    `docs/cut.gif is ${(bytes / 1e6).toFixed(2)} MB, over the ${(CEILING / 1e6).toFixed(2)} MB ceiling`,
    'Re-encode or shorten the choreography.',
  )
} else {
  console.log(`  ok      docs/cut.gif is under the ${(CEILING / 1e6).toFixed(2)} MB ceiling at ${(bytes / 1e6).toFixed(2)} MB`)
}

const readme = readFileSync(resolve(root, 'README.md'), 'utf8').replace(/\r\n/g, '\n')
const img = readme.match(/!\[([^\]]*)\]\(([^)]+)\)/)
if (!img) {
  fail('the README has no image at all')
} else {
  if (!img[2].includes('docs/cut.gif')) fail(`the README points at ${img[2]} and the capture writes docs/cut.gif`)
  else console.log('  ok      the README points at docs/cut.gif')

  const alt = img[1]
  const wanted = ['cut', 'chunk']
  const missing = wanted.filter((w) => !alt.toLowerCase().includes(w))
  if (alt.length < 60) fail(`the alt text is ${alt.length} characters`, `A picture with no alt text is a picture half the readers never see: ${JSON.stringify(alt)}`)
  else if (missing.length > 0) fail(`the alt text does not mention ${missing.join(' or ')}`, JSON.stringify(alt))
  else console.log(`  ok      the alt text says what the recording shows, ${alt.length} characters`)
}

/* And the state, driven live. */
const server = process.env.RETRIEVALBENCH_URL ? await useShared(process.env.RETRIEVALBENCH_URL) : await serve()
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } })
  await page.goto(server.url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.querySelectorAll('#paper [data-chunk]').length > 0, null, { timeout: 60_000 })
  await page.click(`#lang .seg-btn[data-value="${recorded.looked.lang}"]`)
  await page.click(`#policy .seg-btn[data-value="${recorded.looked.policy}"]`)
  const now = await page.evaluate(() => ({
    marked: document.querySelector('#paper mark')?.textContent?.length ?? 0,
    greyed: [...document.querySelectorAll('#paper [data-chunk][data-lost]')].reduce((a, n) => a + (n.textContent?.length ?? 0), 0),
    verdict: document.getElementById('verdict')?.textContent?.trim() ?? '',
  }))
  for (const k of ['marked', 'greyed', 'verdict']) {
    if (now[k] !== recorded.looked[k]) {
      fail(
        `the page no longer reaches the state the recording ends on: ${k}`,
        `recorded ${JSON.stringify(recorded.looked[k])}, page now ${JSON.stringify(now[k])}.\n` +
          '      Re-run npm run capture, and check the README caption still describes what it shows.',
      )
    }
  }
  if (failed === 0) {
    console.log(
      `  ok      the page still reaches the recorded state: ${recorded.looked.lang} under ${recorded.looked.policy}, ` +
        `${now.marked} characters marked, ${now.greyed} greyed`,
    )
  }
} finally {
  await browser.close()
  server.stop()
}

if (failed > 0) {
  console.error('\nA recording of a page that no longer exists is the most convincing wrong thing a README can carry.')
  process.exit(1)
}

console.log(`capture: docs/cut.gif is this page, recorded ${recorded.recorded}, ${recorded.seconds}s at ${recorded.fps} fps`)
