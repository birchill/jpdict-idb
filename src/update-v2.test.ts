import chai, { assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import fetchMock from 'fetch-mock';
import { DataVersion } from './data-version';

import { JpdictStore } from './store-v2';
import { UpdateEvent } from './update-events';
import { update } from './update-v2';

mocha.setup('bdd');
chai.use(chaiAsPromised);

const KANJI_VERSION_1_0_0 = {
  kanji: {
    '1': {
      major: 1,
      minor: 0,
      patch: 0,
      databaseVersion: '175',
      dateOfCreation: '2019-07-09',
    },
  },
};

const DATA_VERSION_1_0_0_EN: DataVersion = {
  major: 1,
  minor: 0,
  patch: 0,
  databaseVersion: '175',
  dateOfCreation: '2019-07-09',
  lang: 'en',
};

describe('update', function () {
  let controller: AbortController;
  let events: Array<UpdateEvent> = [];
  let store: JpdictStore;

  const callback = (event: UpdateEvent) => {
    events.push(event);
  };

  beforeEach(() => {
    controller = new AbortController();
    events = [];
    store = new JpdictStore();
  });

  afterEach(() => {
    fetchMock.restore();
    return store.destroy();
  });

  it('should produce updatestart/updateend events after reading the version', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );

    await update({
      callback,
      lang: 'en',
      majorVersion: 1,
      series: 'kanji',
      signal: controller.signal,
      store,
    });

    assert.deepEqual(events, [
      { type: 'updatestart', series: 'kanji' },
      { type: 'progress', series: 'kanji', fileProgress: 0, totalProgress: 0 },
      { type: 'filestart', series: 'kanji', version: DATA_VERSION_1_0_0_EN },
      { type: 'progress', series: 'kanji', fileProgress: 1, totalProgress: 1 },
      { type: 'fileend', series: 'kanji' },
      { type: 'updateend', series: 'kanji' },
    ]);
  });
});
