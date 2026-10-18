/**
 * The paper the page is built on begins on the first screen.
 *
 *   npm run check:fold
 *
 * `RFOLD-F1`, swept from `chunkline` CME2-F4 on 4 October, measured again at
 * tick 188 and again at tick 230, and open the whole time. On the built page
 * before anything moved:
 *
 *     1280x800   the paper starts at 1108   fold 800    0 pixels showing
 *     390x844    the paper starts at 1459   fold 844    0 pixels showing
 *
 * The masthead was 797 pixels of an 800 pixel screen: an eyebrow, a headline
 * over five and a third lines, a standfirst and three figures. A reader arrived
 * at an instrument, could not see it, and was told what it would say if they
 * scrolled to it.
 *
 * ## What it asks, and why it is a quantity rather than a yes
 *
 * At both widths the paper's top is above the fold **and at least 120 pixels of
 * it are on the first screen**. A gate that asked only for the top to be above
 * the fold passes on one pixel of a 271 pixel picture, which is the same defect
 * with a better number. 120 is the heading row of the document plus its first
 * two lines of text, measured: it is what makes the thing recognisable as a cut
 * document rather than as a border.
 *
 * `promptcost` settled on the same 120 at tick 230 for a 496 pixel heatmap, and
 * the number is worth re-deriving rather than inheriting. Here the paper is 271
 * at 1280 and 453 at 390, so 120 is 44% of it on a laptop: a different fraction
 * of a different picture, and the same answer to the same question, which is
 * what a reader needs to see to know there is a document there at all.
 *
 * ## What it cost
 *
 * No text, and nothing that was visible. The masthead's own air first: its
 * padding from `clamp(2.5rem, 7vh, 5rem) 0 2.5rem` to
 * `clamp(1.5rem, 4vh, 3rem) 0 1.5rem`, the headline cap from 3.6rem to 2.6rem
 * over a 30ch measure rather than 21ch, and the gap above the first section
 * from 8vh to 3vh. Then the standfirst and the three figures moved below the
 * instrument, which is where a summary belongs once there is something to
 * summarise. On a phone the two control groups went onto one row, 84 pixels,
 * which is the difference between 56 pixels of the paper showing and 144.
 *
 * ## This gate reads differently on the two machines, and the runner is the one
 * that counts
 *
 * The first version of this fix passed here and failed the deploy. On Windows
 * the paper landed at 700 of 844 with 144 pixels showing; on the Ubuntu runner
 * the same commit put it at 797 with 47, because the fonts are not the same
 * fonts. The headline took another line and the two control groups went back
 * onto two rows, and 97 pixels went with them. At 1280 the runner is 48 pixels
 * *shorter* than this machine, so it is not a scale factor, it is text.
 *
 * `tools/preflight-runner.mjs` cannot catch that. It builds a fresh clone with
 * the project's own toolchain, which is the part of the deploy it can be, and
 * it runs on this machine's fonts, which is the part it cannot. A layout gate
 * is the one kind of gate the preflight can pass and the deploy still fail, and
 * the answer is slack rather than a tighter preflight: the headline is smaller
 * at phone width, and the control row now fits with 64 pixels to spare instead
 * of 22, so a wider font has somewhere to go.
 *
 *     1280x800   the paper starts at 578 of 800   222 of its 271 pixels showing
 *     390x844    the paper starts at 643 of 844   201 of its 453 pixels showing
 *
 * Those are this machine's numbers. The runner's are in the deploy log and are
 * the ones that decide.
 */

import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'

/* The desktop window the audits use and a phone that is still common. */
const SIZES = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]

/* Of the picture, on the first screen. See the header. */
const WANT_VISIBLE = 120

/*
 * The paper itself, not `section.lab` that contains it. The section is a
 * heading, two control groups, a query box, a preset list and a verdict line
 * before the document starts, 247 pixels of them on a laptop and 374 on a
 * phone. promptcost's first attempt at this gate measured the section and
 * passed while its picture was 86 pixels below the fold.
 */
const PICTURE = '#paper'

const server = process.env.RETRIEVALBENCH_URL ? await useShared(process.env.RETRIEVALBENCH_URL) : await serve()
const browser = await chromium.launch()

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

try {
  for (const viewport of SIZES) {
    const page = await browser.newPage({ viewport })
    await page.goto(server.url, { waitUntil: 'networkidle' })

    /* The paper is filled from the corpus after the indexes are built, and a
       measurement taken before it has filled is a measurement of an empty box. */
    await page.waitForFunction((selector) => (document.querySelector(selector)?.children.length ?? 0) > 0, PICTURE, {
      timeout: 60_000,
    })
    await page.waitForTimeout(600)

    const seen = await page.evaluate((selector) => {
      const picture = document.querySelector(selector)
      if (!picture) return null
      const r = picture.getBoundingClientRect()
      return {
        fold: window.innerHeight,
        top: Math.round(r.top + window.scrollY),
        height: Math.round(r.height),
      }
    }, PICTURE)

    if (!seen) {
      fail(
        `at ${viewport.width}x${viewport.height} there is no ${PICTURE} on the page`,
        'This gate is reading the wrong element, which is how promptcost’s first version passed.',
      )
      await page.close()
      continue
    }

    const visible = Math.max(0, seen.fold - seen.top)
    if (visible < WANT_VISIBLE) {
      fail(
        `at ${viewport.width}x${viewport.height} the paper starts at ${seen.top} against a fold of ${seen.fold}`,
        `${visible} pixels of it are on the first screen and the rule is ${WANT_VISIBLE}. The page is an instrument for cutting a document three ways, and a reader who cannot see the document has been handed the result instead.`,
      )
    } else {
      console.log(
        `  ok      ${viewport.width}x${viewport.height}  the paper starts at ${seen.top} of ${seen.fold}, ${visible} of its ${seen.height} pixels on the first screen`,
      )
    }
    await page.close()
  }
} finally {
  await browser.close()
  server.stop()
}

if (failed > 0) {
  console.error('\nA picture nobody scrolls to is a picture the argument is missing.')
  process.exit(1)
}

console.log(`fold: the paper begins on the first screen at ${SIZES.length} widths, with at least ${WANT_VISIBLE} pixels of it showing`)
