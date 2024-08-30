## Usage

NOTE: There are TWO versions of the database:

- `JpdictDatabase` which does _not_ allow searching for words by their glosses
  (e.g. searching for "eat" to find 食べる) or searching for words that
  contain particular a particular kanji.

  i.e. `getWordsWithGloss` and `getWordsWithKanji` will always return an empty
  result when using this database.

- `JpdictFullTextDatabase` which _does_ allow searching for words on gloss or kanji.

Currently you need to decide once when you create the database which version you
need. There is no facility to switch between the two.

The reason is that the indices for searching for glosses / kanji are expensive to
create and take up disk space, and some applications (e.g. 10ten Japanese
Reader) simply don't need them.

Furthermore, hopefully the project is structured such that if you only use
`JpdictDatabase` then after tree-shaking your final bundle should not include all
the tokenization / stop word code for generating and querying the gloss indices.

## Building

```
pnpm build
```

## Running tests

```
pnpm test
```

Testing using Firefox / WebKit:

```
pnpm test --browser firefox
pnpm test --browser webkit
```

## Publishing

```
pnpm release-it
```
