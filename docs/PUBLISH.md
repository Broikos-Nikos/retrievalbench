# Publishing retrievalbench

Everything the repository needs to exist on GitHub, written down before the
repository is created so that creating it is a transcription rather than a
series of small decisions taken at the API.

Written at tick 217, one day after the date `D15` gave this project, because no
file said what the About box should contain. The workflow was already in the
tree.

## The About box

**Description**, 350 characters or fewer, and it has to carry the number:

> Three chunking policies, the same eight Wikipedia articles in English and
> Greek, the same BM25, 192 queries. All three find the answer for at least 99%
> of them. What changes is whether it arrives whole: a fixed cut hands back a
> truncated answer for 11.5% of English queries and a sentence aligned cut for
> none.

**Homepage**: `https://broikos-nikos.github.io/retrievalbench/`

**Topics**, ten, the maximum GitHub shows without a fold:

```
rag  retrieval  chunking  bm25  information-retrieval  greek
reproducible-research  typescript  data-visualization  nlp
```

`rag` and `chunking` are the two that matter. Somebody choosing a chunk size for
a retrieval pipeline is searching one of them, and what they will find
everywhere else is a recall number. The thing nobody else has published is the
distinction this measures: recall barely moves between the three policies, and
wholeness moves a lot, so the metric the field reports is not the one that
decides whether an answer is usable.

`greek` is there because half the corpus is Greek, and a chunker that was only
ever measured on English is the common case.

## Settings

- **Public**, no wiki, no projects, no discussions. Issues on: a repository
  arguing that the standard metric is the wrong one should be reachable by
  somebody who disagrees.
- **Pages**: source GitHub Actions, not a branch. The workflow builds, gates
  and deploys, and a branch source would publish whatever was committed
  regardless of whether the gates passed. `check:index` holds the corpus to
  `source.sha256` and rebuilds the indexes, so a branch source would let a page
  measured on a corpus nobody has reach a reader.
- **No default community files.** The MIT LICENSE is committed already, and
  `check:licence` fails if the README claims a licence the tree does not carry.

## The order, and why this order

1. **Create the repository** with the description, homepage and topics above, so
   the About box is never empty. `watch-it-think` shipped with an empty one and
   a recruiter audit filed it as a high finding: the ten second screen had no
   sentence on it.
2. **Push `main` with the whole history**, every commit authored
   `Nikos Broikos <broikos.nikolaos@gmail.com>`, none co-authored. The root
   commit was split into four at tick 214, because eight of the fourteen rows in
   the file list carried one subject and that column is the whole first screen
   on a phone. The tree hash was identical afterwards.
3. **Turn Pages on** and let the workflow run. Nothing is deployed by hand.
4. **Wait for the deploy, then open the live URL in a browser and look at it.**
   A green deploy is not a working page.
5. **Put the live link in the first screen of the README**, above the picture.

## The number that is easy to misread

99% is recall and it is not the headline. Three policies agreeing at 99% is the
premise of the argument, not its result: it is what makes the 11.5% worth
reporting, because it rules out "the fixed cut just finds less". The README
states them in that order for the same reason, and `check:claims` holds both to
the measurement.
