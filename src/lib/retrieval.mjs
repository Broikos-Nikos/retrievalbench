/**
 * Chunking policies, BM25, and the scoring that decides between them.
 *
 * One file, imported by the builder that writes `src/generated/retrieval.json`,
 * by the page, and by every gate. `evalkit` proved why: while its page
 * recomputed a threshold with its own rounding, the headline said 177 and the
 * library said 178, the build passed, and nine assertions stayed green.
 *
 * ## The unit, and why a hit is not what it usually is
 *
 * The task is self retrieval: a sentence is taken out of an article and used as
 * the query, so the passage that contains it is the right answer by
 * construction and no labelling is needed. It is a weak task on purpose. It
 * flatters every method, so a difference that survives it is real.
 *
 * **A hit is not "the returned chunk is the one the sentence started in".**
 * That was the first scoring rule written for this and it is unfair to any
 * policy whose chunks overlap: with a fifth of each window carried into the
 * next, a sentence is often wholly inside two chunks and exactly one of them
 * was being called correct. It scored the overlap policy at 0.823 against 0.938
 * for fixed, a difference that is entirely an artefact of the rule.
 *
 * A chunk is right when it holds the text somebody asked for. So `coverage` is
 * the fraction of the query's characters the returned chunk contains, and two
 * thresholds are reported: whole, at 100%, and majority, at 50%. The gap
 * between them is exactly the queries a boundary split.
 */

/** Words, for Greek as well as English, without a tokenizer. */
export const words = (s) => s.toLowerCase().match(/\p{Letter}[\p{Letter}\p{Mark}'’-]*|\p{Number}+/gu) ?? []

/**
 * The three policies, at one target size so the comparison is about where the
 * cut lands rather than about how much is inside it.
 *
 * `paragraph` is deliberately absent. It was the second policy tried and it
 * produced four chunks per language against 125, because this corpus is one
 * continuous string per article with no newline characters in it at all. A
 * policy that silently degenerates reports a clean null result, which is why
 * `check:policies` exists.
 */
export const POLICIES = ['fixed', 'sentence', 'overlap']

export const POLICY_NOTE = {
  fixed: 'Cut every N characters. The cut lands wherever the counter says.',
  sentence: 'Accumulate whole sentences until the next would overshoot, then cut at that sentence end.',
  overlap: 'Fixed windows with a fifth of each one carried into the next, which is what production pipelines ship.',
}

export function chunk(text, policy, target) {
  if (policy === 'fixed') {
    const out = []
    for (let i = 0; i < text.length; i += target) out.push({ start: i, end: Math.min(text.length, i + target) })
    return out
  }

  if (policy === 'overlap') {
    const step = Math.round(target * 0.8)
    const out = []
    for (let i = 0; i < text.length; i += step) {
      out.push({ start: i, end: Math.min(text.length, i + target) })
      if (i + target >= text.length) break
    }
    return out
  }

  if (policy === 'sentence') {
    const out = []
    let start = 0
    let last = 0
    for (const m of text.matchAll(/[.;!?·]\s+/gu)) {
      const end = m.index + m[0].length
      if (end - start >= target) {
        out.push({ start, end })
        start = end
      }
      last = end
    }
    if (last > start || start < text.length - 1) out.push({ start, end: text.length })
    return out
  }

  throw new Error(`unknown policy ${JSON.stringify(policy)}`)
}

/**
 * BM25, k1 = 1.2, b = 0.75, the ordinary parameters.
 *
 * Deliberately ordinary. This project is about the boundary, and a tuned
 * retriever would make every comparison a comparison of two things at once.
 */
export function index(chunks, { k1 = 1.2, b = 0.75 } = {}) {
  const docs = chunks.map((c) => words(c.text))
  const df = new Map()
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)
  const avgdl = docs.reduce((a, d) => a + d.length, 0) / docs.length
  const N = docs.length
  const tf = docs.map((d) => {
    const m = new Map()
    for (const t of d) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  })

  return function search(query, top = 5) {
    const scores = new Float64Array(N)
    for (const t of new Set(words(query))) {
      const n = df.get(t)
      if (!n) continue
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      for (let i = 0; i < N; i++) {
        const f = tf[i].get(t)
        if (!f) continue
        scores[i] += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * docs[i].length) / avgdl))
      }
    }
    return [...scores.keys()]
      .sort((a, c) => scores[c] - scores[a])
      .slice(0, top)
      .map((i) => ({ i, score: Number(scores[i].toFixed(3)) }))
  }
}

/**
 * How much of a query's span a chunk contains, 0 to 1, and what falls off.
 *
 * The page draws the second half of this: the characters of the answer that
 * are outside the returned chunk, greyed. A truncation nobody can see is not
 * worth a page, so this returns the count as well as the fraction.
 */
export function coverage(chunk, span) {
  if (!chunk || chunk.article !== span.article) return { fraction: 0, insideChars: 0, lostChars: span.length, lostBefore: span.length, lostAfter: 0 }
  const from = Math.max(chunk.start, span.at)
  const to = Math.min(chunk.end, span.at + span.length)
  const inside = Math.max(0, to - from)
  return {
    fraction: Number((inside / span.length).toFixed(4)),
    insideChars: inside,
    lostChars: span.length - inside,
    lostBefore: Math.max(0, Math.min(span.length, chunk.start - span.at)),
    lostAfter: Math.max(0, span.at + span.length - chunk.end),
  }
}

/** The quartiles of a list, with the full range beside them. */
export function spread(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const at = (f) => s[Math.min(s.length - 1, Math.floor(f * (s.length - 1)))]
  return {
    n: s.length,
    low: s[0],
    p25: at(0.25),
    median: at(0.5),
    p75: at(0.75),
    high: s[s.length - 1],
  }
}
