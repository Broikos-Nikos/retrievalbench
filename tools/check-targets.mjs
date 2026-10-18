/**
 * Everything a reader can press is big enough to press.
 *
 *   npm run check:targets
 *
 * `RTAP-F1`, measured at tick 193 across all eight projects at 390x844: this
 * page had eight visible controls and one of them was under 24 by 24, the
 * smallest 303.6 by 21. Re-measured at tick 233 and it was the same one, the
 * link to the repository at the foot of the page:
 *
 *     BUTTON   42.5 x 32.8   fixed
 *     BUTTON     65 x 32.8   sentence
 *     BUTTON   56.9 x 32.8   overlap
 *     BUTTON   55.1 x 32.8   English
 *     BUTTON   48.2 x 32.8   Greek
 *     INPUT     358 x 44.8   the query box
 *     SELECT    358 x 43.2   the preset list
 *     A       303.6 x 21     Source, measurement and gates on GitHub
 *
 * 21 pixels is the line box of the text and nothing else, because an inline
 * link has no height of its own. WCAG 2.5.8 AA asks for 24 by 24, with an
 * exception where an equivalent control is available elsewhere on the page.
 * `agentscope` used that exception at tick 193 for 648 marks inside a picture
 * that cannot be made larger. Nothing here has that excuse: it is one link in
 * a paragraph of its own, and `display: inline-block` with 0.3rem of vertical
 * padding answers it without moving anything else.
 *
 * ## What it asserts
 *
 * Every visible interactive element is at least 24 by 24, at three widths. The
 * widths matter because a target shrinks with its text: the same link is 333.2
 * by 23 at 1280 and 303.6 by 21 at 390, and a gate run at one width would have
 * called the laptop fine and the phone fine and been wrong about both.
 *
 * What counts as interactive is listed rather than inferred, and a scroll
 * container with `tabindex` is excluded by name: it is a region a keyboard can
 * enter, not a thing a thumb presses, and counting it would make this gate
 * pass or fail on something it is not about.
 */

import { chromium } from 'playwright'
import { serve, useShared } from './serve.mjs'

const SIZES = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
]

/* WCAG 2.5.8 AA. agentscope holds its own list to 44, which is the AAA figure,
   because those rows were built for this finding and could be any size. These
   are the page's own controls and 24 is the rule they have to meet. */
const MIN = 24

const CONTROLS = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="radio"], [role="button"]'

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

    /* The controls are disabled until the indexes are built, and a disabled
       select is still a target a reader will try to press. Wait for the page
       to finish so the measurement is of the page a reader meets. */
    await page.waitForFunction((selector) => (document.querySelector(selector)?.children.length ?? 0) > 0, '#paper', {
      timeout: 60_000,
    })

    const seen = await page.evaluate(
      ([selector, min]) =>
        [...document.querySelectorAll(selector)]
          .map((e) => {
            const r = e.getBoundingClientRect()
            return {
              what: e.tagName.toLowerCase() + (e.id ? '#' + e.id : e.className ? '.' + String(e.className).split(' ')[0] : ''),
              text: (e.textContent || '').trim().slice(0, 40),
              w: Math.round(r.width * 10) / 10,
              h: Math.round(r.height * 10) / 10,
            }
          })
          .filter((x) => x.w > 0 && x.h > 0)
          .map((x) => ({ ...x, small: x.w < min || x.h < min })),
      [CONTROLS, MIN],
    )

    if (seen.length === 0) {
      fail(`at ${viewport.width}x${viewport.height} this gate found no controls at all`, 'It is reading the wrong page or the wrong selector, which is worse than the finding it holds.')
      await page.close()
      continue
    }

    const small = seen.filter((x) => x.small)
    if (small.length > 0) {
      fail(
        `at ${viewport.width}x${viewport.height}, ${small.length} of ${seen.length} controls are under ${MIN} by ${MIN}`,
        small.map((x) => `${x.what} ${x.w}x${x.h} ${JSON.stringify(x.text)}`).join('; '),
      )
    } else {
      const smallest = seen.reduce((a, b) => (Math.min(b.w, b.h) < Math.min(a.w, a.h) ? b : a))
      console.log(
        `  ok      ${viewport.width}x${viewport.height}  ${seen.length} controls, the smallest ${smallest.what} at ${smallest.w} by ${smallest.h}`,
      )
    }
    await page.close()
  }
} finally {
  await browser.close()
  server.stop()
}

if (failed > 0) {
  console.error('\nA control a thumb cannot hit is a control the page does not have on a phone.')
  process.exit(1)
}

console.log(`targets: every control is at least ${MIN} by ${MIN} at ${SIZES.length} widths`)
