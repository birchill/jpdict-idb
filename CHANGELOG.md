# Changelog

## [3.2.2](https://github.com/birchill/jpdict-idb/compare/v3.2.1...v3.2.2) (2025-12-18)


### Bug Fixes

* guard missing file headers ([ccd2ee6](https://github.com/birchill/jpdict-idb/commit/ccd2ee65c5508687e190e32b2fa778400a74fdd1))

## [3.2.1](https://github.com/birchill/jpdict-idb/compare/v3.2.0...v3.2.1) (2025-12-05)


### Bug Fixes

* fix ESM output filenames ([a03b9c6](https://github.com/birchill/jpdict-idb/commit/a03b9c652d62d67f8cc9296c91c6868ae42d5910))

## [3.2.0](https://github.com/birchill/jpdict-idb/compare/v3.1.0...v3.2.0) (2025-12-05)


### Features

* include the cause along with download errors ([c6c4e48](https://github.com/birchill/jpdict-idb/commit/c6c4e4825d1093d604912f97084aea4de1b92f95))
* make sure the URL is always set in `DownloadError` ([8df67ec](https://github.com/birchill/jpdict-idb/commit/8df67ec4fff3c6e16f872b1fc0514edc5892ec37))


### Bug Fixes

* make return type of isAbortError slightly more accurate ([948c681](https://github.com/birchill/jpdict-idb/commit/948c681e99452c65761dc442af65370c9596a27b))

## [3.1.0](https://github.com/birchill/jpdict-idb/compare/v3.0.0...v3.1.0) (2025-04-03)

### Features

- handle explicit radical annotations in component data ([24cc837](https://github.com/birchill/jpdict-idb/commit/24cc837c0418cd4a23f3673bb72276824e59a057))

## [3.0.0](https://github.com/birchill/jpdict-idb/compare/v2.6.1...v3.0.0) (2025-03-21)

### ⚠ BREAKING CHANGES

- The type of `KanjiResult['comp']` has been updated to
  support nested kanji components.
- The type of `KanjiResult['rad']` to simplify the
  fields. Whether or not a component is the radical is determined by the
  `is_rad` field on `KanjiResult['comp']`.

### Features

- drop `name` and `var` members from `Radical` type ([acc30a4](https://github.com/birchill/jpdict-idb/commit/acc30a4f8eb2615144fccfb54878653a2a2f97be))
- support version 5 of kanji data ([5f66838](https://github.com/birchill/jpdict-idb/commit/5f66838ca930b574971d440863fb9205b7402eda))

## [2.6.1](https://github.com/birchill/jpdict-idb/compare/v2.6.0...v2.6.1) (2024-10-05)

### Bug Fixes

- prioritize entries where most senses are "usually kana" when looking up by kana ([55892d7](https://github.com/birchill/jpdict-idb/commit/55892d7de7fad7759f8ac30924b6b13f5cc5b0aa))

## [2.6.0](https://github.com/birchill/jpdict-idb/compare/v2.5.0...v2.6.0) (2024-09-06)

### Features

- add `st` field to kanji entry type ([a58039f](https://github.com/birchill/jpdict-idb/commit/a58039fc370b8dff86eedd49a6f92f2b3512e506))

## [2.5.0](https://github.com/birchill/jpdict-idb/compare/v2.4.0...v2.5.0) (2024-04-25)

### Features

- don't restrict senses when matching on search-only forms ([f2713c5](https://github.com/birchill/jpdict-idb/commit/f2713c585bd72ba6f395581d743c6444042f04da))

### Bug Fixes

- fix search-only sense restrictions logic ([cd18cf7](https://github.com/birchill/jpdict-idb/commit/cd18cf737b497b567d324d1db81b301efd330425))

## [2.4.0](https://github.com/birchill/jpdict-idb/compare/v2.3.2...v2.4.0) (2024-04-02)

### Features

- prioritize kana matches when searching with kana ([e1bbad2](https://github.com/birchill/jpdict-idb/commit/e1bbad25918588e54eeb765fc9ff86ddae515351))

## [2.3.2](https://github.com/birchill/jpdict-idb/compare/v2.3.1...v2.3.2) (2024-01-22)

## [2.3.1](https://github.com/birchill/jpdict-idb/compare/v2.3.0...v2.3.1) (2023-12-09)

### Bug Fixes

- drop no-longer-used uK reading info type ([dd6fd9b](https://github.com/birchill/jpdict-idb/commit/dd6fd9b946d263ff4647e433750bd02d960f1025))

## [2.3.0](https://github.com/birchill/jpdict-idb/compare/v2.2.1...v2.3.0) (2023-12-08)

### Features

- add rk reading info ([6326ea2](https://github.com/birchill/jpdict-idb/commit/6326ea26fc02e7ec7721c8a735f09fb68185bf35))

## [2.2.1](https://github.com/birchill/jpdict-idb/compare/v2.2.0...v2.2.1) (2023-12-02)

### Bug Fixes

- **deps:** update dependency idb to v8 ([4671e0f](https://github.com/birchill/jpdict-idb/commit/4671e0fe1f65e85db3b960fa02038cbc8e73b54d))

## [2.2.0](https://github.com/birchill/jpdict-idb/compare/v2.1.3...v2.2.0) (2023-11-29)

### Features

- add new field types ([901b01e](https://github.com/birchill/jpdict-idb/commit/901b01e00f4a55dd037066a9a91a087a5e9f3953))
- add parsing of Bunpro data ([5f7d71c](https://github.com/birchill/jpdict-idb/commit/5f7d71cc724cfcb4b9b56258c107822fbd64dd28))

## 2.1.3 (2023-09-09)

## 2.1.2 (2023-08-28)

- update dependencies

## 2.1.1 (2023-08-17)

### Bug Fixes

- drop safari-14-idb-fix ([bba9a50](https://github.com/birchill/jpdict-idb/commit/bba9a50f45f3ec70abc509513bd6c6d3fe19d805))

## 2.1.0 (2023-08-17)

### Features

- add parsing for WaniKani levels attached to words ([9d3feed](https://github.com/birchill/jpdict-idb/commit/9d3feed840cbaa5bcc3fc58a3247b6db36489b5d))

## [2.0.2](https://github.com/birchill/jpdict-idb/compare/v2.0.1...v2.0.2) (2023-08-16)

### Bug Fixes

- fixed package export

### [2.0.1](https://github.com/birchill/jpdict-idb/compare/v2.0.0...v2.0.1) (2023-06-03)

### Bug Fixes

- fix type exports ([9bd8686](https://github.com/birchill/jpdict-idb/commit/9bd8686e1808dea1be24fffaa62bf4d1dfdb75e5))

## [2.0.0](https://github.com/birchill/jpdict-idb/compare/v1.3.0...v2.0.0) (2023-06-03)

### ⚠ BREAKING CHANGES

- `GlossType` is now a string union type.

### Features

- replace GlossType const enum with a string union ([d28cb7d](https://github.com/birchill/jpdict-idb/commit/d28cb7db525cd2d274ceb0352c95c9e1be8586dd))

## [1.3.0](https://github.com/birchill/jpdict-idb/compare/v1.2.2...v1.3.0) (2023-05-09)

### Features

- add 'ship' misc type ([278fc97](https://github.com/birchill/jpdict-idb/commit/278fc9748250c7f990298dccfbde35daeaf1cb93))

### Bug Fixes

- **deps:** update dependency superstruct to v1 ([566a8b7](https://github.com/birchill/jpdict-idb/commit/566a8b7e6da33b4752507ea633620af280f8617b))

### [1.2.2](https://github.com/birchill/jpdict-idb/compare/v1.2.1...v1.2.2) (2022-08-29)

### Bug Fixes

- handle kanji entries with multiple related kanji ([8f9085f](https://github.com/birchill/jpdict-idb/commit/8f9085f6c08e0859a0bf31ec1acaaa9088081f06))

### [1.2.1](https://github.com/birchill/jpdict-idb/compare/v1.2.0...v1.2.1) (2022-08-15)

### Bug Fixes

- add search-only forms ([af91e0c](https://github.com/birchill/jpdict-idb/commit/af91e0c3587e5316d2e0613cb7fa6a8b39533ece))

## [1.2.0](https://github.com/birchill/jpdict-idb/compare/v1.1.0...v1.2.0) (2022-07-21)

### Features

- add new field/misc types ([b94f288](https://github.com/birchill/jpdict-idb/commit/b94f2882d3d760a2dc2b08bbd5786198c96909f5))

### Bug Fixes

- **deps:** update dependency superstruct to ^0.16.0 ([05cbf3a](https://github.com/birchill/jpdict-idb/commit/05cbf3ad61782675557befd9bb8d3418cd507ab1))

## [1.1.0](https://github.com/birchill/jpdict-idb/compare/v1.0.0...v1.1.0) (2022-05-13)

### Features

- add CJS version ([733d5e0](https://github.com/birchill/jpdict-idb/commit/733d5e0dc9ff2e9c812c9e6c715add337224bbe5))
- increase database update batch size ([78d6096](https://github.com/birchill/jpdict-idb/commit/78d609674ae87c8212ea026a70b46dc8c43fc1fb))
- increase progress resolution to 1% ([2eeeca7](https://github.com/birchill/jpdict-idb/commit/2eeeca7833cb765d70db91bfcdd48e647d035006))

## [1.0.0](https://github.com/birchill/jpdict-idb/compare/v0.0.4...v1.0.0) (2022-05-12)

### [0.0.4](https://github.com/birchill/jpdict-idb/compare/v0.0.3...v0.0.4) (2022-05-12)

### Features

- export clearCachedVersionInfo function ([4945bdc](https://github.com/birchill/jpdict-idb/commit/4945bdcdf4a56beea99d2acc6307f8439b3a7bb3))

### [0.0.3](https://github.com/birchill/jpdict-idb/compare/v0.0.2...v0.0.3) (2022-05-12)

### Bug Fixes

- fix path to data files ([594ccba](https://github.com/birchill/jpdict-idb/commit/594ccba815374f3c756bc23544c6a498a4816db6))

### [0.0.2](https://github.com/birchill/jpdict-idb/compare/v0.0.1...v0.0.2) (2022-05-12)

### Bug Fixes

- fix typing of senses argument to groupSenses ([21c7c2b](https://github.com/birchill/jpdict-idb/commit/21c7c2b7d8773869fada96cd836aa9664b768be4))

### 0.0.1 (2022-05-12)

First version
