/**
 * Every gate that needs a browser, against one server.
 *
 *   npm run verify
 *
 * One `vite preview` on a port the operating system hands out, proved byte for
 * byte against `dist/index.html` before anything measures it, and handed to each
 * gate through `RETRIEVALBENCH_URL`. `watch-it-think` learned this the expensive way:
 * eleven gates each starting their own server leaked ten of them on the
 * development machine and let one report green against a page it had never
 * started.
 *
 * Two gates here, sharing one browser start and one preview server, because the
 * reason a gate ends up outside the build is that nothing collects it, and a
 * gate outside the build is a gate somebody has to remember.
 */

import { spawn } from 'node:child_process'
import { browserReady } from './preflight.mjs'
import { serve } from './serve.mjs'

/*
 * Both of these exist. The note worth carrying from `gatewaylab` is why that
 * sentence is here: this file was copied into it from `evalkit` naming a
 * `check:capture` that did not exist, so `npm run verify` reported "1 of 2
 * browser gates failed" against a project that simply had no capture yet, and
 * that failure was committed once before anybody read the line under the build.
 */
const GATES = ['check:page', 'check:network', 'check:capture']

/* Before the server, because a server nobody can drive is not worth starting. */
await browserReady()

const server = await serve()
let failed = 0
const started = Date.now()

try {
  for (const gate of GATES) {
    const t0 = Date.now()
    const code = await new Promise((done) => {
      const child = spawn('npm', ['run', gate], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, RETRIEVALBENCH_URL: server.url },
      })
      child.on('exit', done)
    })
    console.log(`  (${gate}, ${((Date.now() - t0) / 1000).toFixed(1)}s)\n`)
    if (code !== 0) failed++
  }
} finally {
  server.stop()
}

const total = ((Date.now() - started) / 1000).toFixed(1)
if (failed > 0) {
  console.error(`${failed} of ${GATES.length} browser gates failed, in ${total}s.`)
  process.exit(1)
}
console.log(`${GATES.length} browser gate${GATES.length === 1 ? '' : 's'}, one server, ${total}s.`)
