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
yarn build
```

## Running tests

```
yarn test
```

Testing a specific browser:

```
yarn test --browsers FirefoxNightly
```

In test watch mode:

```
npx karma start --browsers FirefoxNightly
```

The version of `karma-firefox-launcher` used here _should_ work under WSL but for
Chrome you'll want to use something like:

```
CHROME_BIN=/mnt/c/Program\ Files\ \(x86\)/Google/Chrome/Application/chrome.exe npx karma start --browsers Chrome
```

That will complain about not being able to write to the temp directory but
otherwise should be fine.

## Publishing

```
yarn release
git push --follow-tags origin main
yarn publish
```
