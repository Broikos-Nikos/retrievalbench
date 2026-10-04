/**
 * The indexes are built here and the query stays here.
 *
 *   npm run check:network      (or npm run verify, which starts the server)
 *
 * RNET-F2, swept out of `watch-it-think`'s WS-F2 and the last of three. The
 * README says this page "fetches the frozen corpus, builds all six indexes in
 * your browser, and answers whatever you type with the same library that
 * produced the leaderboard", and nothing held it. Measured at tick 192 on the
 * built page:
 *
 *     4 requests, all on load, all to this origin, the last the frozen corpus
 *     0 after a query was typed and submitted
 *     0 carrying that query
 *     0 in localStorage, sessionStorage, document.cookie, service workers
 *
 * Unlike `chunkline`, which has no text box, this page takes what a visitor
 * types and searches with it, so the second assertion here is the one that
 * matters: a page can keep every request on its own origin and still put the
 * query in a path.
 *
 * ## The policy
 *
 * The same as `chunkline`'s and stricter than `watch-it-think`'s: no
 * `'wasm-unsafe-eval'` and no `blob:`, because the indexes are built in
 * javascript with no model to compile and no worker to start. Checked for being
 * **in the head**, where a browser will take it, after `WICON-F1` showed what a
 * malformed icon does: the head ended at the favicon and the policy was refused
 * as "delivered via a <meta> element outside the document's <head>".
 *
 * And checked for what it refused, because a blocked request never reaches
 * `page.on('request')`. The first control written for the first of these three
 * gates passed for exactly that reason, with a page built to exfiltrate reading
 * as clean.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let failed = 0
const fail = (what, detail) => {
  failed++
  console.error(`FAIL  ${what}`)
  if (detail) console.error(`      ${detail}`)
}

/* 1. The claim this gate exists to keep true. */
const CLAIM = 'builds all six indexes in your browser'
const readme = readFileSync(resolve(root, 'README.md'), 'utf8').replace(/\s+/g, ' ')
if (!readme.includes(CLAIM)) {
  fail(
    `README.md no longer says ${JSON.stringify(CLAIM)}`,
    'If the promise changed, this gate changes with it rather than quietly guarding nothing.',
  )
} else {
  console.log('  ok      the README still makes the claim this gate holds')
}

const { serve, useShared } = await import('./serve.mjs')
const server = process.env.RETRIEVALBENCH_URL ? await useShared(process.env.RETRIEVALBENCH_URL) : await serve()

try {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  const origin = new URL(server.url).origin
  const requests = []
  page.on('request', (r) =>
    requests.push({ url: r.url(), method: r.method(), type: r.resourceType(), body: r.postData() ?? '' }),
  )
  const refused = []
  page.on('console', (m) => {
    const t = m.text()
    if (m.type() === 'error' && /Content Security Policy|Refused to connect|violates the following/i.test(t)) {
      refused.push(t.replace(/\s+/g, ' ').slice(0, 140))
    }
  })

  await page.goto(server.url)
  await page.waitForTimeout(4000)
  const onLoad = requests.length

  /* 2. The policy, in the head, and no looser than this page needs. */
  const policy = await page.evaluate(() => {
    const meta = document.head.querySelector('meta[http-equiv="Content-Security-Policy"]')
    return {
      inHead: Boolean(meta),
      anywhere: Boolean(document.querySelector('meta[http-equiv="Content-Security-Policy"]')),
      content: meta?.getAttribute('content') ?? '',
      bodyFirst: document.body.firstElementChild?.tagName?.toLowerCase() ?? '',
    }
  })
  if (!policy.inHead) {
    fail(
      policy.anywhere
        ? 'the Content-Security-Policy is in the document but not in the head, so the browser ignores it'
        : 'the page ships no Content-Security-Policy',
      `document.body.firstElementChild is <${policy.bodyFirst}>, which is where to look if the head ended early`,
    )
  } else if (!/connect-src 'self'/.test(policy.content)) {
    fail('the policy does not restrict connect-src to this origin', policy.content.slice(0, 120))
  } else if (/wasm-unsafe-eval|blob:/.test(policy.content)) {
    fail(
      'the policy permits wasm or blob, which this page has no use for',
      'the indexes are built in javascript: no model to compile and no worker to start.',
    )
  } else {
    console.log('  ok      the policy is in the head, holds connect-src to this origin, and permits no wasm or blob')
  }

  /* Then what a visitor does: type a query and ask for it. */
  const secret = `MYSTIKO-${Math.random().toString(36).slice(2, 10)}`
  const box = await page.$('input[type=search], input[type=text], textarea')
  if (!box) {
    fail('no text box on the page, so the claim about answering whatever you type cannot be exercised')
  } else {
    await box.fill(secret)
    await page.waitForTimeout(1500)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(2500)
  }

  /* 3. Everything it asked for, it asked of itself. */
  const foreign = requests.filter((r) => new URL(r.url).origin !== origin)
  if (foreign.length > 0) {
    fail(
      `${foreign.length} of ${requests.length} requests went to somebody else`,
      foreign.map((r) => `${r.method} ${r.type} ${r.url}`).join('\n      '),
    )
  } else {
    console.log(
      `  ok      ${requests.length} requests, every one to its own origin: ${onLoad} on load and ` +
        `${requests.length - onLoad} while the page was used`,
    )
  }

  /* 4. And none carried the query, which is the assertion this page needs most. */
  const carrying = requests.filter(
    (r) => r.url.includes(secret) || r.body.includes(secret) || decodeURIComponent(r.url).includes(secret),
  )
  if (carrying.length > 0) {
    fail(
      `${carrying.length} requests carried the query that was typed`,
      carrying.map((r) => `${r.method} ${r.url.slice(0, 120)}`).join('\n      ') +
        '\n      Same origin or not, this page promises to answer what you type without sending it anywhere.',
    )
  } else {
    console.log(`  ok      nothing carried the ${secret.length} character query`)
  }

  /* 5. And nothing was refused, which is where a blocked leak hides. */
  if (refused.length > 0) {
    fail(
      `${refused.length} request${refused.length === 1 ? ' was' : 's were'} refused by the page's own policy`,
      refused.slice(0, 3).join('\n      ') + '\n      The policy doing its job is not the same as the code not trying.',
    )
  } else {
    console.log('  ok      the policy refused nothing, because nothing asked')
  }

  /* 6. And it kept nothing. */
  const kept = await page.evaluate(async () => ({
    localStorage: Object.keys(localStorage).length,
    sessionStorage: Object.keys(sessionStorage).length,
    cookie: document.cookie.length,
    workers: (await navigator.serviceWorker?.getRegistrations?.())?.length ?? 0,
  }))
  const stored = Object.entries(kept).filter(([, n]) => n > 0)
  if (stored.length > 0) {
    fail(`the page kept something: ${stored.map(([k, n]) => `${k} ${n}`).join(', ')}`)
  } else {
    console.log('  ok      nothing in localStorage, sessionStorage, cookies or a service worker')
  }

  await browser.close()
} finally {
  server.stop()
}

if (failed > 0) {
  console.error('\nA page that answers what you type without sending it anywhere has to be held to it by something that watches the wire.')
  process.exit(1)
}

console.log('network: the corpus arrives, the query stays, and the browser is told to require both')
