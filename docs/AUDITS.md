# The audits

Commit messages cite identifiers like `RCON-F1`. This is what they refer to.

No audit pass has been run against this project yet. Every finding here was
raised by a sweep of a class found in another project in the same workspace,
which is why the identifiers read `RCON` and `RGIF` rather than a perspective.

**7 findings, 1 closed, 6 open**, across the 0 perspectives that produced them.

Held to the workspace queue this project is built from by
`tools/check-audit-status.mjs`, which fails if a row here says anything the
queue does not. Until tick 164 this file did not exist, and an identifier in a
sibling project's commit log pointed at nothing a reader could open.

## `self`, swept from elsewhere (not an audit pass)

Not a perspective and not an agent. Findings raised against this project while
a class found somewhere else in the workspace was being swept across all eight,
kept here because commit messages cite them like any other.

7 findings, 1 closed.

| id | severity | status | finding |
|---|---|---|---|
| `RCAP-F1` | medium | open | capture.mjs hands the committed GIF to ffmpeg, and never asks whether ffmpeg is installed |
| `RCON-F1` | medium | open | The query box and the model select are bounded at 1.35:1 |
| `RCUT-F1` | low | open | A preset query is cut at seventy characters with nothing saying it was cut |
| `RGIF-F1` | low | open | The loop runs 7.63 seconds, above the five and a half tokenlab settled on |
| `RNET-F1` | low | open | The README promises the corpus and the search stay in your browser and nothing holds it: no gate watches the wire |
| `RPRE-F1` | low | fixed, tick 165 | npm run verify started a server and handed the same missing browser to every gate in turn |
| `RSEAL-F1` | low | open | The page says the work happens in your browser and nothing enforces it |
