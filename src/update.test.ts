import { assert } from 'chai';

import { DataVersion } from './data-version';
import {
  DeletionEvent,
  DownloadEvent,
  EntryEvent,
  ProgressEvent,
  VersionEvent,
  VersionEndEvent,
} from './download';
import { KanjiEntryLine, KanjiDeletionLine } from './kanji';
import { JpdictStore } from './store';
import { UpdateAction } from './update-actions';
import { updateKanji } from './update';

mocha.setup('bdd');

const VERSION_1_0_0: DataVersion = {
  major: 1,
  minor: 0,
  patch: 0,
  databaseVersion: 'yer',
  dateOfCreation: '2019-07-23',
  lang: 'en',
};

type KanjiEntryEvent = EntryEvent<KanjiEntryLine>;
type KanjiDeletionEvent = DeletionEvent<KanjiDeletionLine>;
type KanjiDownloadEvent = DownloadEvent<KanjiEntryLine, KanjiDeletionLine>;

describe('updateKanji', function () {
  let store: JpdictStore;
  let actions: Array<UpdateAction> = [];
  const callback = (action: UpdateAction) => {
    actions.push(action);
  };

  // We time out some of these tests occasionally.
  this.timeout(10000);

  beforeEach(() => {
    actions = [];
    store = new JpdictStore();
  });

  afterEach(() => {
    return store.destroy();
  });

  it('should produce startdownload/finishdownload actions after reading the version', async () => {
    const versionEvent: VersionEvent = {
      ...VERSION_1_0_0,
      type: 'version',
    };
    const versionEndEvent: VersionEndEvent = { type: 'versionend' };
    const downloadIterator = mockStream(versionEvent, versionEndEvent);

    await updateKanji({ downloadIterator, lang: 'en', store, callback });

    assert.deepEqual(actions, [
      { type: 'startdownload', series: 'kanji', version: VERSION_1_0_0 },
      { type: 'finishdownload', version: VERSION_1_0_0 },
      { type: 'finishpatch', version: VERSION_1_0_0 },
    ]);
  });

  it('should update the dbversion table', async () => {
    const versionEvent: VersionEvent = {
      ...VERSION_1_0_0,
      type: 'version',
    };
    const versionEndEvent: VersionEndEvent = { type: 'versionend' };
    const downloadIterator = mockStream(versionEvent, versionEndEvent);

    await updateKanji({ downloadIterator, lang: 'en', store, callback });

    const dataVersion = await store.getDataVersion('kanji');
    assert.deepEqual(dataVersion, VERSION_1_0_0);
  });

  it('should add entries to the kanji table', async () => {
    const versionEvent: VersionEvent = {
      ...VERSION_1_0_0,
      type: 'version',
    };
    const entryEvents: Array<KanjiEntryEvent> = [
      {
        type: 'entry',
        c: '㐂',
        r: {},
        m: [],
        rad: { x: 1 },
        refs: { nelson_c: 265, halpern_njecd: 2028 },
        misc: { sc: 6 },
      },
      {
        type: 'entry',
        c: '㐆',
        r: {},
        m: [
          'to follow',
          'to trust to',
          'to put confidence in',
          'to depend on',
          'to turn around',
          'to turn the body',
        ],
        rad: { x: 4 },
        refs: {},
        misc: { sc: 6 },
      },
    ];
    const versionEndEvent: VersionEndEvent = { type: 'versionend' };
    const downloadIterator = mockStream(
      versionEvent,
      ...entryEvents,
      versionEndEvent
    );

    await updateKanji({ downloadIterator, lang: 'en', store, callback });

    const chars = await store._getKanji([13314, 13318]);
    assert.deepEqual(chars[0], {
      c: 13314,
      r: {},
      m: [],
      rad: { x: 1 },
      refs: { nelson_c: 265, halpern_njecd: 2028 },
      misc: { sc: 6 },
    });

    assert.deepEqual(chars[1], {
      c: 13318,
      r: {},
      m: [
        'to follow',
        'to trust to',
        'to put confidence in',
        'to depend on',
        'to turn around',
        'to turn the body',
      ],
      rad: { x: 4 },
      refs: {},
      misc: { sc: 6 },
    });
  });

  it('should delete entries from the kanji table', async () => {
    await store.bulkUpdateTable({
      table: 'kanji',
      put: [
        {
          c: 13314,
          r: {},
          m: [],
          rad: { x: 1 },
          refs: { nelson_c: 265, halpern_njecd: 2028 },
          misc: { sc: 6 },
        },
        // Put an extra record just to ensure we don't delete EVERYTHING
        {
          c: 13318,
          r: {},
          m: ['to follow'],
          rad: { x: 4 },
          refs: {},
          misc: { sc: 6 },
        },
      ],
      drop: [],
      version: VERSION_1_0_0,
    });

    const versionEvent: VersionEvent = {
      ...VERSION_1_0_0,
      patch: 1,
      type: 'version',
    };
    const deletionEvent: KanjiDeletionEvent = {
      type: 'deletion',
      c: '㐂',
      deleted: true,
    };
    const versionEndEvent: VersionEndEvent = { type: 'versionend' };
    const downloadIterator = mockStream(
      versionEvent,
      deletionEvent,
      versionEndEvent
    );

    await updateKanji({ downloadIterator, lang: 'en', store, callback });

    const result = await store._getKanji([13314, 13318]);
    assert.lengthOf(result, 1);
    assert.equal(result[0].c, 13318);
  });

  it('should echo progress events', async () => {
    const versionEvent: VersionEvent = {
      ...VERSION_1_0_0,
      type: 'version',
    };
    const progressEventA: ProgressEvent = {
      type: 'progress',
      loaded: 0,
      total: 1,
    };
    const entryEvent: KanjiEntryEvent = {
      type: 'entry',
      c: '㐂',
      r: {},
      m: [],
      rad: { x: 1 },
      refs: { nelson_c: 265, halpern_njecd: 2028 },
      misc: { sc: 6 },
    };
    const progressEventB: ProgressEvent = {
      type: 'progress',
      loaded: 1,
      total: 1,
    };
    const versionEndEvent: VersionEndEvent = { type: 'versionend' };

    const downloadIterator = mockStream(
      versionEvent,
      progressEventA,
      entryEvent,
      progressEventB,
      versionEndEvent
    );

    await updateKanji({ downloadIterator, lang: 'en', store, callback });

    assert.deepEqual(actions, [
      { type: 'startdownload', series: 'kanji', version: VERSION_1_0_0 },
      { type: 'progress', loaded: 0, total: 1 },
      { type: 'progress', loaded: 1, total: 1 },
      { type: 'finishdownload', version: VERSION_1_0_0 },
      { type: 'progress', loaded: 1, total: 1 },
      { type: 'finishpatch', version: VERSION_1_0_0 },
    ]);
  });

  it('should apply a series of versions in succession', async () => {
    const events: Array<KanjiDownloadEvent> = [
      // Base version has two records
      {
        ...VERSION_1_0_0,
        type: 'version',
      },
      {
        type: 'entry',
        c: '㐂',
        r: {},
        m: [],
        rad: { x: 1 },
        refs: { nelson_c: 265, halpern_njecd: 2028 },
        misc: { sc: 6 },
      },
      {
        type: 'entry',
        c: '㐆',
        r: {},
        m: ['to follow'],
        rad: { x: 4 },
        refs: {},
        misc: { sc: 6 },
      },
      { type: 'versionend' },

      // First patch adds one record and deletes another
      {
        ...VERSION_1_0_0,
        patch: 1,
        type: 'version',
      },
      {
        type: 'entry',
        c: '㐬',
        r: {},
        m: [
          'a cup with pendants',
          'a pennant',
          'wild',
          'barren',
          'uncultivated',
        ],
        rad: { x: 8 },
        refs: {},
        misc: { sc: 7 },
      },
      {
        type: 'deletion',
        c: '㐆',
        deleted: true,
      },
      { type: 'versionend' },

      // Second patch adds one more record
      {
        ...VERSION_1_0_0,
        patch: 2,
        type: 'version',
      },
      {
        type: 'entry',
        c: '㐮',
        r: {},
        m: ['to help', 'to assist', 'to achieve', 'to rise', 'to raise'],
        rad: { x: 8 },
        refs: {},
        misc: { sc: 13 },
      },
      { type: 'versionend' },
    ];

    const downloadIterator = mockStream(...events);

    await updateKanji({ downloadIterator, lang: 'en', store, callback });

    assert.deepEqual(await store._getKanji([13314, 13318, 13356, 13358]), [
      {
        c: 13314,
        r: {},
        m: [],
        rad: { x: 1 },
        refs: { nelson_c: 265, halpern_njecd: 2028 },
        misc: { sc: 6 },
      },
      {
        c: 13356,
        r: {},
        m: [
          'a cup with pendants',
          'a pennant',
          'wild',
          'barren',
          'uncultivated',
        ],
        rad: { x: 8 },
        refs: {},
        misc: { sc: 7 },
      },
      {
        c: 13358,
        r: {},
        m: ['to help', 'to assist', 'to achieve', 'to rise', 'to raise'],
        rad: { x: 8 },
        refs: {},
        misc: { sc: 13 },
      },
    ]);
  });

  it('should delete everything when doing a full update', async () => {
    const events: Array<KanjiDownloadEvent> = [
      // Base version has two records
      {
        ...VERSION_1_0_0,
        type: 'version',
      },
      {
        type: 'entry',
        c: '㐂',
        r: {},
        m: [],
        rad: { x: 1 },
        refs: { nelson_c: 265, halpern_njecd: 2028 },
        misc: { sc: 6 },
      },
      {
        type: 'entry',
        c: '㐆',
        r: {},
        m: ['to follow'],
        rad: { x: 4 },
        refs: {},
        misc: { sc: 6 },
      },
      { type: 'versionend' },

      // Next minor version simply re-adds one
      {
        ...VERSION_1_0_0,
        minor: 1,
        type: 'version',
      },
      {
        type: 'entry',
        c: '㐆',
        r: {},
        m: ['to follow'],
        rad: { x: 4 },
        refs: {},
        misc: { sc: 6 },
      },
      { type: 'versionend' },
    ];

    const downloadIterator = mockStream(...events);

    await updateKanji({ downloadIterator, lang: 'en', store, callback });

    assert.deepEqual(await store._getKanji([13314, 13318]), [
      {
        c: 13318,
        r: {},
        m: ['to follow'],
        rad: { x: 4 },
        refs: {},
        misc: { sc: 6 },
      },
    ]);
  });
});

async function* mockStream(
  ...events: Array<KanjiDownloadEvent>
): AsyncIterableIterator<KanjiDownloadEvent> {
  for (const event of events) {
    yield event;
  }
}
