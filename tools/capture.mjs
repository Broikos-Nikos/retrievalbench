/**
 * The moving picture at the top of the README.
 *
 *   npm run capture
 *
 * The recording is the finding. A still of this page is a paragraph of
 * Wikipedia with a line through it, and the argument only appears when the line
 * moves: same query, same retriever, and the clause that answers it crosses
 * from outside the returned chunk to inside it.
 *
 * So the choreography is fixed and its end state is asserted. If the page
 * cannot be driven into that state, this exits non-zero rather than writing a
 * GIF of whatever it did instead. `watch-it-think` shipped a recording of a
 * page in the wrong state once, captioned for the page it was supposed to be.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { serve } from './serve.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(root, 'docs/cut.gif')
const WORK = resolve(root, '.capture')

const SIZE = { width: 1280, height: 1100 }
const FPS = 8
const WIDTH = 880

rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })

const server = await serve()
let looked
let seconds
let crop

try {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1, recordVideo: { dir: WORK, size: SIZE } })
  const videoStart = Date.now()
  const page = await context.newPage()
  await page.goto(server.url, { waitUntil: 'networkidle' })

  // Wait for the corpus, not for a timeout. The recording should not open on
  // the word "loading".
  await page.waitForFunction(() => document.querySelectorAll('#paper .chunk').length > 0, null, { timeout: 120_000 })
  await page.waitForTimeout(400)

  /*
   * The crop is measured from the page rather than typed, because the masthead
   * is clamped against the viewport and a hardcoded band moves the first time
   * the headline grows a word.
   */
  await page.evaluate(() => document.querySelector('.lab-head')?.scrollIntoView({ block: 'start', behavior: 'instant' }))
  await page.waitForTimeout(300)
  const box = await page.evaluate(() => {
    const head = document.querySelector('.query')
    const paper = document.getElementById('paper')
    if (!head || !paper) return null
    return { top: Math.max(0, Math.floor(head.getBoundingClientRect().top) - 16), bottom: Math.ceil(paper.getBoundingClientRect().bottom) + 14 }
  })
  if (!box) {
    console.error('FAIL  the instrument is not on the page, so there is nothing to record')
    process.exit(1)
  }
  const height = Math.min(SIZE.height - box.top, box.bottom - box.top) & ~1
  crop = `crop=${SIZE.width}:${height}:0:${box.top}`

  const startedAt = Date.now()
  const policy = (v) => page.click(`#policy .seg-btn[data-value="${v}"]`)

  /*
   * Open on the fixed cut and hold, because the truncation is the claim. A
   * viewer who arrives after the cut has moved has been shown a search box.
   */
  await policy('fixed')
  await page.waitForTimeout(2200)
  await policy('sentence')
  await page.waitForTimeout(1800)
  await policy('overlap')
  await page.waitForTimeout(1500)
  await policy('fixed')
  await page.waitForTimeout(2000)

  seconds = (Date.now() - startedAt) / 1000

  looked = await page.evaluate(() => ({
    policy: document.querySelector('#policy .seg-btn.is-on')?.dataset.value ?? null,
    lang: document.querySelector('#lang .seg-btn.is-on')?.dataset.value ?? null,
    marked: document.querySelector('#paper mark')?.textContent?.length ?? 0,
    greyed: [...document.querySelectorAll('#paper .chunk--lost')].reduce((a, n) => a + (n.textContent?.length ?? 0), 0),
    verdict: document.getElementById('verdict')?.textContent?.trim() ?? '',
  }))

  const wanted = { policy: 'fixed', lang: 'en' }
  const wrong = Object.entries(wanted).filter(([k, val]) => looked[k] !== val)
  if (wrong.length > 0 || looked.greyed === 0) {
    console.error('FAIL  the page did not reach the state this recording is choreographed for')
    for (const [k, val] of wrong) console.error(`      ${k}: wanted ${JSON.stringify(val)}, page is ${JSON.stringify(looked[k])}`)
    if (looked.greyed === 0) console.error('      nothing is greyed, so the recording ends on a frame that makes no argument')
    process.exit(1)
  }

  await context.close()
  await browser.close()

  const video = readdirSync(WORK).find((f) => f.endsWith('.webm'))
  if (!video) {
    console.error('FAIL  playwright wrote no video')
    process.exit(1)
  }
  const webm = resolve(WORK, video)
  mkdirSync(resolve(root, 'docs'), { recursive: true })

  const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
  const palette = resolve(WORK, 'palette.png')
  const filters = `${crop},fps=${FPS},scale=${WIDTH}:-1:flags=lanczos`
  const offset = Math.max(0, (startedAt - videoStart) / 1000 - 0.3)
  const trim = ['-ss', String(offset)]

  /*
   * Sixteen colours, undithered, eight frames a second, which `chunkline`
   * measured and the reasoning carries here: playwright records lossy webm, so
   * two frames of a page standing still are not identical, GIF pays only for
   * what changes, and a small palette quantises that compression noise back
   * onto the same few entries. This picture is flat ink, one accent, and a
   * great deal of small monospaced text in two scripts, which is the case that
   * measurement was taken on.
   */
  ff([...trim, '-i', webm, '-vf', `${filters},palettegen=max_colors=16:stats_mode=diff`, palette])
  ff([...trim, '-i', webm, '-i', palette, '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=none`, '-loop', '0', OUT])

  renameSync(webm, resolve(root, 'docs/cut.webm'))
  rmSync(WORK, { recursive: true, force: true })

  /*
   * The size goes in the manifest so `check:capture` can hold the committed GIF
   * to the byte it was written at. A round ceiling permits silent growth right
   * up to it, which is an open finding against `tokenlab`: its cap is 4 MB over
   * a picture of 2.77 MB.
   */
  writeFileSync(
    resolve(root, 'docs/capture.json'),
    JSON.stringify(
      { recorded: new Date().toISOString().slice(0, 10), fps: FPS, width: WIDTH, crop, seconds: Number(seconds.toFixed(1)), bytes: statSync(OUT).size, looked },
      null,
      2,
    ) + '\n',
  )
} finally {
  server.stop()
}

const { size } = statSync(OUT)
console.log(`docs/cut.gif   ${(size / 1e6).toFixed(2)} MB at ${FPS} fps, ${WIDTH}px wide, ${crop}`)
console.log(`docs/cut.webm  kept alongside it, for anywhere that takes video`)
console.log(`ends on ${looked.policy}, ${looked.lang}: ${looked.marked} characters marked, ${looked.greyed} greyed, ${seconds.toFixed(1)}s of action`)
