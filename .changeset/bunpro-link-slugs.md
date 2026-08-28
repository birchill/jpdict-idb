---
'@birchill/jpdict-idb': minor
---

Record the Bunpro slug for terms whose page URL is not simply the term

The words data now carries `bvl` / `bgl` on kanji and reading metadata for the
Bunpro terms whose page lives at a disambiguated slug — 額 is at
`/vocabs/額-ひたい`, 如く at `/grammar_points/如く-如き-如し`. These surface on word
results as `slug` on the existing `bv` / `bg` objects, so a client can build the
link as slug, else the fuzzy match source text in `src`, else the headword.
