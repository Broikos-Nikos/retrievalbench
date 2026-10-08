# The audits

Commit messages cite identifiers like `RCON-F1`. This is what they refer to.

No audit pass has been run against this project yet. Every finding here was
raised by a sweep of a class found in another project in the same workspace.

**15 findings, 11 closed, 4 open**.

Held to the workspace queue this project is built from by
`tools/check-audit-status.mjs`, which fails if a row here says anything the
queue does not.

## `self`, swept from elsewhere (not an audit pass)

Not a perspective and not an agent. Findings raised against this project while
a class found somewhere else in the workspace was being swept across all eight,
kept here because commit messages cite them like any other.

15 findings, 11 closed.

| id | severity | status | finding |
|---|---|---|---|
| `RCAP-F1` | medium | fixed, tick 226 | capture.mjs hands the committed GIF to ffmpeg, and never asks whether ffmpeg is installed |
| `RTBL-F1` | medium | fixed, tick 198 | The leaderboard is 77 pixels wider than its column at 320 and nothing in this project looks below 390 |
| `RMKP-F1` | medium | fixed, tick 202 | A title out of the fetched corpus is handed to innerHTML, and creates the element it describes |
| `RCON-F1` | medium | fixed, tick 176 | The query box and the model select are bounded at 1.35:1 |
| `RFOLD-F1` | medium | open | The picture the page is built on is below the fold at both widths |
| `RGRP-F1` | medium | fixed, tick 182 | serve.mjs kills a process group the spawn never creates, so cleanup off Windows leaves the server running |
| `RPRO-F1` | medium | fixed, tick 181 | The claims header says a figure is counted and the first half compares the count to zero |
| `RNET-F2` | medium | fixed, tick 192 | The README says it builds all six indexes in your browser, and nothing holds it |
| `RCUT-F1` | low | open | A preset query is cut at seventy characters with nothing saying it was cut |
| `RGIF-F1` | low | open | The loop runs 7.63 seconds, above the five and a half tokenlab settled on |
| `RNET-F1` | low | fixed, tick 192 | The README promises the corpus and the search stay in your browser and nothing holds it: no gate watches the wire |
| `RPRE-F1` | low | fixed, tick 165 | npm run verify started a server and handed the same missing browser to every gate in turn |
| `RSEAL-F1` | low | fixed, tick 192 | The page says the work happens in your browser and nothing enforces it |
| `RTAP-F1` | low | open | Controls shorter than 24 pixels at a phone width |
| `RFF-F1` | low | fixed, tick 226 | npm run capture resolves ffmpeg off PATH and asks for it only after the browser has launched |
