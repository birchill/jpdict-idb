import { assert } from 'chai';

import { JpdictStore } from './store';

describe('store', () => {
  it('should handle multiple simultaneous opens', async () => {
    const store = new JpdictStore();
    const promise1 = store.open();
    const promise2 = store.open();
    const promise3 = store.open();

    await Promise.all([promise1, promise2, promise3]);

    await store.open();

    await store.destroy();
  });

  it('should handle multiple simultaneous deletes', async () => {
    const store = new JpdictStore();
    await store.open();

    const promise1 = store.destroy();
    const promise2 = store.destroy();
    const promise3 = store.destroy();

    await Promise.all([promise1, promise2, promise3]);

    // And again just for good measure
    await store.destroy();
  });

  it('should handle destroying while opening', async () => {
    const store = new JpdictStore();

    // First add something to the database
    await store.open();
    await store.updateSeries({
      series: 'kanji',
      updates: [
        {
          mode: 'add',
          record: {
            c: '㐂',
            r: {},
            m: [],
            rad: { x: 1 },
            refs: { nelson_c: 265, halpern_njecd: 2028 },
            misc: { sc: 6 },
          },
        },
      ],
    });
    await store.updateDataVersion({
      series: 'kanji',
      version: {
        major: 1,
        minor: 0,
        patch: 0,
        databaseVersion: 'yer',
        dateOfCreation: '2019-07-23',
        lang: 'en',
      },
    });
    await store.close();

    // Now try deleting while opening
    const openPromise = store.open();
    const deletePromise = store.destroy();
    await Promise.all([openPromise, deletePromise]);

    // Re-open and check that the data is deleted
    await store.open();
    const result = await store._getKanji([13314]);
    assert.lengthOf(result, 0);

    // Tidy up
    await store.destroy();
  });
});
