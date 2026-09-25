# retrievalbench

### Where you cut a document does not decide whether you find the answer. It decides whether you are handed all of it.

Three chunking policies over the same eight Wikipedia articles, English and
Greek, same target size, same BM25, 192 queries. All three return a passage
holding most of the query for at least 99% of them. What changes is whether the
passage arrives whole: a fixed cut hands back a **truncated** answer for
**11.5%** of English queries and **5.2%** of Greek ones, and a sentence aligned
cut for none.

![The instrument, cycling through the three chunking policies on one query. Under the fixed policy the cut passes through the middle of the sentence and 43 characters of it sit above the rule in grey, outside the chunk that was returned. Switching to sentence alignment moves the cut and the whole sentence comes back inside one chunk, marked. The overlap policy does the same for a larger index.](docs/cut.gif)

**[Open it](https://broikos-nikos.github.io/retrievalbench/)** and search it
yourself. The page runs the real retriever: it fetches the frozen corpus,
builds all six indexes in your browser, and answers whatever you type with the
same library that produced the leaderboard.

---

## The leaderboard

| policy | chunks, en | indexed characters, en | whole answer at rank 1 | characters lost, median / worst |
|---|---|---|---|---|
| fixed | 125 | 256,152 | 0.885 en, 0.948 el | 10 / 43 en, 26 / 39 el |
| sentence | 119 | 256,152 | 1 en, 1 el | none |
| overlap | 155 | 319,119 | 1 en, 1 el | none |

**The overlap trick is the standard production advice and it buys nothing here.**
Carrying a fifth of each window into the next is what pipelines ship so that an
answer is never cut in half, and it works. So does sentence alignment, for
**24.6%** fewer indexed characters, and the two never disagree on a single
query in either language.

That is the useful sentence for anybody who builds these systems: the expensive
fix and the free one produce the same answers, and the free one is the one
nobody writes down.

## What a truncation actually looks like

The second case in the page's list, after a longer one from Thessaloniki. The
query is a sentence from the Byzantine Empire article, and BM25 finds its
passage under every policy. Under the fixed policy the chunk it returns ends
here:

> The reign of the short Valentinianic dynasty, marked by wars against the Goths, ...

and the rest of the sentence, **s at the Battle of Adrianople in 378**, is on
the other side of the cut. The retriever did its job. The chunker threw away
the date, the battle and the outcome.

That is why the page draws the query rather than the chunk. **The median
truncation is 10 characters in English and 26 in Greek**, and greying ten
characters inside a 2,084 character chunk would be a diagram of nothing. Ten
characters of a 150 character query is a tenth of it, and it is usually the
clause that answers the question.

## What was expected, and did not happen

This project was specified as "in browser embeddings and a leaderboard", reusing
`watch-it-think`'s int8 ONNX pipeline. The runtime half of that reuse is real.
The model half is not, and asking the graph itself is how that was settled:

```
inputs : ids, cases
outputs: intent_logits, slot_logits, attention
```

No hidden states, so there is nothing to mean-pool into an embedding, and its
own metadata records the checkpoint as `obtainable: false`, so it cannot be
re-exported with them. The measurement behind that is in
`specs/retrievalbench-reuse.json` in the workspace this was built in.

So there is no model here at all, and the project is better for it: BM25 in a
page is honest about what it is, runs on a phone, and makes the boundary the
variable under test instead of burying it under a download.

## What this does not claim

**Not that BM25 is a good retriever.** It is a floor. Self retrieval flatters
every method, which is why it was chosen: a difference that survives a task this
easy is real, and 11.5% truncation on a task this easy is a lot.

**Not that finding never fails.** It fails once, in 576 policy and query
combinations: one English keyword query under the fixed policy returns a chunk
holding 14.1% of it, so that cell reads **0.99** and not 1.000. The page names it
under the table rather than rounding it away.

**Not that normalisation is free.** Greek with combining accents is the same
text on screen and a different string to a word splitter, so a query pasted in
NFD used to share no term with this NFC corpus: the same Greek query scored
27.25 as typed and 0.67 in NFD, and the top result changed to the wrong article,
silently. `words()` normalises to NFC now, so the two forms are one query.
`tokenlab` answers the same hazard the opposite way, by saying so rather than
normalising, because it measures what you pasted and this retrieves it.

**Not that sentence alignment always wins.** It wins on prose with sentence
punctuation. A table, a code listing or a transcript has no sentence ends to cut
at, and the policy degenerates to the fixed one.

**Not that the corpus is a benchmark.** 8 articles, 477,852 characters, 192
queries. It is `chunkline`'s corpus because this is stage two of that project
and has to be about the same text, and the sample size belongs next to every
figure.

## Reproducing it

```
npm ci
npm run build:index     # measures data/corpus.json, writes src/generated/retrieval.json
npm run build           # typecheck, six gates, then vite
npm run verify          # the two gates that need a real browser
```

The corpus is committed at `data/corpus.json`, sha256 `2dcd7ce3c51955d2`, CC
BY-SA 4.0, with each article's Wikipedia revision id. It is frozen because
`chunkline` measured two articles that were edited within a day and re-running
the same processing gave a different answer: both measurements were honest, they
were measurements of different documents.

## The gates

| gate | what it refuses |
|---|---|
| `check:policies` | a policy that has stopped producing the chunking it is named for |
| `check:index` | any chunk, ranking or score that does not recompute from the hashed corpus |
| `check:boundary` | the headline, once it stops being true of the corpus |
| `check:claims` | a figure in this README that the measurement does not produce |
| `check:page` | a passage the page marks in a place the library does not put it |
| `check:capture` | a recording of a state the live page no longer reaches |
| `check:source` | an invisible character in any source file |
| `check:licence` | a licence claimed in prose and absent from the tree |

`check:policies` is the one this project exists to have. Every number above is a
comparison between policies, so a policy that silently degenerates makes all of
them meaningless while each one still looks plausible. That is not hypothetical:
the second policy written for this measurement cut at paragraphs, produced 4
chunks per language against 125, and reported a recall of exactly 1.000, because
the committed corpus is one continuous string per article with no newline
characters in it at all. Nothing in the figures could have shown that. Only the
shape of the chunking could.

## Licence

MIT for the code. The corpus is Wikipedia text under CC BY-SA 4.0, with each
article's title, revision id and url carried in `data/corpus.json`.
