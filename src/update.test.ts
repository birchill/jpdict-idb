import chai, { assert } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import fetchMock from 'fetch-mock';

import { DataVersion } from './data-version';
import { CurrentVersion } from './download';
import { clearCachedVersionInfo } from './download-version-info';
import { JpdictStore } from './store';
import { ProgressEvent, UpdateEvent } from './update-events';
import { update } from './update';

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

const KANJI_VERSION_1_0_1 = {
  kanji: {
    '1': {
      ...KANJI_VERSION_1_0_0['kanji']['1'],
      patch: 1,
      databaseVersion: '176',
      dateOfCreation: '2019-07-10',
    },
  },
};

const KANJI_VERSION_1_1_0 = {
  kanji: {
    '1': {
      major: 1,
      minor: 1,
      patch: 0,
      databaseVersion: '177',
      dateOfCreation: '2019-07-11',
    },
  },
};

const WORDS_VERSION_1_1_2_PARTS_3 = {
  words: {
    '1': {
      major: 1,
      minor: 1,
      patch: 2,
      parts: 3,
      dateOfCreation: '2022-04-05',
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
  let signal: AbortSignal;
  let store: JpdictStore;

  // Update function shortcuts
  const updateKanji = ({
    currentVersion,
    majorVersion,
  }: {
    currentVersion?: CurrentVersion;
    majorVersion: number;
  }) =>
    update({
      callback,
      currentVersion,
      lang: 'en',
      majorVersion,
      series: 'kanji',
      signal,
      store,
    });

  const updateWords = ({
    currentVersion,
    majorVersion,
  }: {
    currentVersion?: CurrentVersion;
    majorVersion: number;
  }) =>
    update({
      callback,
      currentVersion,
      lang: 'en',
      majorVersion,
      series: 'words',
      signal,
      store,
    });

  const callback = (event: UpdateEvent) => {
    events.push(event);
  };

  beforeEach(() => {
    clearCachedVersionInfo();
    controller = new AbortController();
    signal = controller.signal;
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

    await updateKanji({ majorVersion: 1 });

    assert.deepEqual(events, [
      { type: 'updatestart' },
      { type: 'filestart', version: DATA_VERSION_1_0_0_EN },
      { type: 'progress', fileProgress: 0, totalProgress: 0 },
      { type: 'progress', fileProgress: 1, totalProgress: 1 },
      { type: 'fileend', version: DATA_VERSION_1_0_0_EN },
      { type: 'updateend' },
    ]);
  });

  it('should update the dbversion table', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":0,"format":"full"}
`
    );

    await updateKanji({ majorVersion: 1 });

    const kanjiVersion = await store.getDataVersion('kanji');
    assert.deepEqual(kanjiVersion, DATA_VERSION_1_0_0_EN);
  });

  it('should not write part information after downloading all parts in a multi-part series', async () => {
    fetchMock.mock('end:version-en.json', WORDS_VERSION_1_1_2_PARTS_3);
    fetchMock.mock(
      'end:words/en/1.1.2-1.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":2,"dateOfCreation":"2022-04-05"},"records":1,"part":1,"format":"full"}
{"id":1000000,"r":["???"],"s":[{"g":["repetition mark in katakana"],"pos":["unc"],"xref":[{"k":"????????????"}],"gt":1}]}
`
    );
    fetchMock.mock(
      'end:words/en/1.1.2-2.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":2,"dateOfCreation":"2022-04-05"},"records":1,"part":2,"format":"full"}
{"id":1000360,"r":["????????????","????????????"],"rm":[{"p":["i1"],"a":3},{"a":3}],"s":[{"g":["easily","readily","quickly","flatly (refuse)"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]},{"g":["lightly (seasoned food, applied make-up, etc.)","plainly","simply"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
`
    );
    fetchMock.mock(
      'end:words/en/1.1.2-3.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":2,"dateOfCreation":"2022-04-05"},"records":1,"part":3,"format":"full"}
{"id":1001070,"k":["????????????"],"r":["???????????????"],"rm":[{"a":[{"i":0},{"i":4}]}],"s":[{"g":["to be flustered","to lose one's presence of mind"],"pos":["v1","vi"],"misc":["uk"]}]}
`
    );

    await updateWords({ majorVersion: 1 });

    const wordsVersion = await store.getDataVersion('words');
    assert.doesNotHaveAnyKeys(wordsVersion, ['partInfo']);
  });

  it('should add entries to the kanji table', async () => {
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":2,"format":"full"}
{"c":"???","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}
{"c":"???","r":{},"m":["to follow","to trust to","to put confidence in","to depend on","to turn around","to turn the body"],"rad":{"x":4},"refs":{},"misc":{"sc":6}}
`
    );

    await updateKanji({ majorVersion: 1 });

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
    // Initial update
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":2,"format":"full"}
{"c":"???","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}
{"c":"???","r":{},"m":["to follow","to trust to","to put confidence in","to depend on","to turn around","to turn the body"],"rad":{"x":4},"refs":{},"misc":{"sc":6}}
`
    );
    await updateKanji({ majorVersion: 1 });

    // Subsequent patch that deletes the first record
    clearCachedVersionInfo();
    fetchMock.mock(
      { url: 'end:version-en.json', overwriteRoutes: true },
      KANJI_VERSION_1_0_1
    );
    fetchMock.mock(
      'end:kanji/en/1.0.1-patch.jsonl',
      `{"type":"header","version":{"major":1,"minor":0,"patch":1,"databaseVersion":"176","dateOfCreation":"2019-07-10"},"records":1,"format":"patch"}
{"_":"-","c":"???"}
`
    );

    await updateKanji({
      currentVersion: {
        major: 1,
        minor: 0,
        patch: 0,
      },
      majorVersion: 1,
    });

    const result = await store._getKanji([13314, 13318]);
    assert.lengthOf(result, 1);
    assert.equal(result[0].c, 13318);
  });

  it('should produce progress events', async () => {
    fetchMock.mock('end:version-en.json', WORDS_VERSION_1_1_2_PARTS_3);
    fetchMock.mock(
      'end:words/en/1.1.2-1.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":2,"dateOfCreation":"2022-04-05"},"records":26,"part":1,"format":"full"}
{"id":1000000,"r":["???"],"s":[{"g":["repetition mark in katakana"],"pos":["unc"],"xref":[{"k":"????????????"}],"gt":1}]}
{"id":1000010,"r":["???"],"s":[{"g":["voiced repetition mark in katakana"],"pos":["unc"],"gt":1}]}
{"id":1000020,"r":["???"],"s":[{"g":["repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
{"id":1000030,"r":["???"],"s":[{"g":["voiced repetition mark in hiragana"],"pos":["unc"],"gt":1}]}
{"id":1000040,"k":["???"],"r":["?????????","????????????"],"s":[{"g":["ditto mark"],"pos":["n"]}]}
{"id":1000050,"k":["???"],"r":["???????????????"],"s":[{"g":["\\"as above\\" mark"],"pos":["n"]}]}
{"id":1000060,"k":["???"],"r":["??????","??????"],"rm":[0,{"app":0}],"s":[{"g":["kanji repetition mark"],"pos":["unc"],"xref":[{"k":"????????????"}],"gt":1}]}
{"id":1000090,"k":["???","???"],"r":["??????"],"s":[{"g":["circle"],"pos":["n"],"xref":[{"k":"???","r":"??????","sense":1}],"inf":"sometimes used for zero"},{"g":["\\"correct\\"","\\"good\\""],"pos":["n"],"xref":[{"k":"?????????"}],"inf":"when marking a test, homework, etc."},{"g":["*","_"],"pos":["unc"],"xref":[{"k":"??????","sense":1}],"inf":"placeholder used to censor individual characters or indicate a space to be filled in"},{"g":["period","full stop"],"pos":["n"],"xref":[{"k":"??????"}]},{"g":["maru mark","semivoiced sound","p-sound"],"pos":["n"],"xref":[{"k":"?????????"}]}]}
{"id":1000100,"k":["????????????"],"r":["???????????????????????????"],"s":[{"g":["alphabetical order"],"pos":["n"]}]}
{"id":1000110,"k":["?????????????????????","?????????????????????"],"km":[{"p":["s1"]}],"r":["??????????????????????????????","??????????????????????????????"],"rm":[{"app":1,"p":["s1"]},{"app":2}],"s":[{"g":["CD player"],"pos":["n"]}]}
{"id":1000130,"k":["??????"],"r":["???????????????"],"s":[{"g":["NHK Symphony Orchestra"],"pos":["n"],"misc":["abbr"]}]}
{"id":1000140,"k":["????????????"],"r":["???????????????"],"s":[{"g":["O-back","skirt with peek-a-boo hole in rump"],"pos":["n"]}]}
{"id":1000150,"k":["???????????????????????????"],"r":["???????????????????????????????????????"],"s":[{"g":["rs232 cable"],"pos":["n"]}]}
{"id":1000160,"k":["????????????"],"km":[{"p":["s1"]}],"r":["??????????????????"],"rm":[{"p":["s1"],"a":0}],"s":[{"g":["T-shirt","tee shirt"],"pos":["n"]}]}
{"id":1000170,"k":["????????????"],"km":[{"p":["s1"]}],"r":["??????????????????"],"rm":[{"p":["s1"]}],"s":[{"g":["T-back","bikini thong"],"pos":["n"]}]}
{"id":1000200,"k":["??????????????????","???????????????","?????????????????????"],"r":["????????????????????????"],"rm":[{"a":0}],"s":[{"g":["the harmonizing, mentally and physically, of two parties engaged in an activity","singing from the same hymn-sheet","dancing to the same beat"],"pos":["exp","n"],"misc":["id"]}]}
{"id":1000210,"r":["?????????"],"s":[{"g":["(former) regular (stops at every station) T??hoku-line Shinkansen"],"pos":["n"],"xref":[{"r":"????????????"}],"misc":["obs"]}]}
{"id":1000220,"k":["??????"],"km":[{"p":["i1","n1","nf10"]}],"r":["????????????"],"rm":[{"p":["i1","n1","nf10"],"a":0}],"s":[{"g":["obvious","clear","plain","evident","apparent","explicit","overt"],"pos":["adj-na"]}]}
{"id":1000225,"k":["??????","??????","??????"],"km":[{"i":["ateji"]},{"i":["ateji"]},{"i":["ateji"]}],"r":["???????????????"],"rm":[{"a":[{"i":0},{"i":3}]}],"s":[{"g":["plain","frank","candid","open","direct","straightforward","unabashed","blatant","flagrant"],"pos":["adj-na","adj-no"],"misc":["uk"]}]}
{"id":1000230,"k":["?????????"],"r":["?????????","?????????"],"rm":[0,{"app":0}],"s":[{"g":["useless","no good","hopeless"],"pos":["exp"],"misc":["uk"],"inf":"commonly used with adj-i inflections, e.g. ??????????????????, ??????????????????, etc.","dial":["ks"]}]}
{"id":1000260,"k":["?????????"],"r":["????????????"],"s":[{"g":["gaudy","showy","garish","loud"],"pos":["adj-i"],"xref":[{"k":"???????????????","r":"??????????????????","sense":2}],"misc":["uk"],"inf":"?????? from ??????"},{"g":["crooked","vicious","wicked","nasty","unscrupulous","dishonest"],"pos":["adj-i"],"misc":["uk"]}]}
{"id":1000280,"k":["??????"],"r":["???????????????"],"rm":[{"a":4}],"s":[{"g":["to discuss"],"pos":["v5u","vt"],"misc":["uk"]},{"g":["to find fault with","to criticize","to criticise"],"pos":["v5u","vt"]}]}
{"id":1000290,"r":["?????????"],"s":[{"g":["Jouetsu line express Shinkansen"],"pos":["n"]}]}
{"id":1000300,"k":["??????","??????"],"r":["????????????"],"s":[{"g":["to treat","to handle","to deal with"],"kapp":1,"pos":["v5u","vt"],"misc":["uk"]},{"g":["to arrange","to decorate","to dress","to garnish"],"pos":["v5u","vt"],"misc":["uk"]}]}
{"id":1000310,"k":["?????????"],"r":["?????????","?????????","?????????","?????????","?????????"],"rm":[{"a":0},{"a":0},{"a":0},0,{"app":0,"a":0}],"s":[{"g":["Japanese andromeda (Pieris japonica)","lily-of-the-valley"],"pos":["n"],"misc":["uk"]}]}
{"id":1000320,"k":["??????","??????"],"km":[{"i":["rK"]},{"i":["rK"]}],"r":["?????????","?????????","?????????","?????????","?????????","??????"],"rm":[{"p":["i1"],"a":0},{"a":0},{"a":1},{"app":0,"a":0},{"i":["ok"]},{"i":["ok"],"a":1}],"s":[{"g":["there","over there","that place","yonder","you-know-where"],"pos":["pn"],"xref":[{"r":"??????","sense":1},{"r":"??????","sense":1},{"r":"??????","sense":1}],"misc":["uk"],"inf":"place physically distant from both speaker and listener"},{"g":["genitals","private parts","nether regions"],"rapp":11,"pos":["n"],"misc":["col","uk"]},{"g":["that far","that much","that point"],"pos":["n"],"xref":[{"r":"????????????"}],"misc":["uk"],"inf":"something psychologically distant from both speaker and listener"}]}
`
    );
    fetchMock.mock(
      'end:words/en/1.1.2-2.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":2,"dateOfCreation":"2022-04-05"},"records":58,"part":2,"format":"full"}
{"id":1000360,"r":["????????????","????????????"],"rm":[{"p":["i1"],"a":3},{"a":3}],"s":[{"g":["easily","readily","quickly","flatly (refuse)"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]},{"g":["lightly (seasoned food, applied make-up, etc.)","plainly","simply"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
{"id":1000390,"k":["?????????????????????","?????????????????????","?????????????????????","?????????????????????","?????????????????????","?????????????????????"],"km":[{"p":["s1"]}],"r":["?????????????????????","?????????????????????","?????????????????????","?????????????????????"],"rm":[{"app":3,"p":["s1"]},{"app":6,"a":[{"i":1},{"i":0}]},{"app":24},{"app":48,"a":[{"i":1},{"i":0}]}],"s":[{"g":["just like that","in the twinkling of an eye","in the blink of an eye","in the time it takes to say \\"ah!\\""],"pos":["exp","adv"],"gt":1024}]}
{"id":1000400,"r":["??????????????????"],"rm":[{"a":[{"i":1},{"i":4}]}],"s":[{"g":["floundering while nearly drowning"],"pos":["adv","adv-to","vs"]},{"g":["suffering"],"pos":["adv","adv-to","vs"]}]}
{"id":1000410,"r":["???????????????"],"rm":[{"a":4}],"s":[{"g":["innocent","cherubic","childlike"],"pos":["adj-i"]}]}
{"id":1000420,"k":["??????"],"km":[{"i":["rK"]}],"r":["??????","??????"],"rm":[{"p":["s1"],"a":0},{"app":0}],"s":[{"g":["that","those","the"],"pos":["adj-pn"],"xref":[{"r":"??????"},{"r":"??????","sense":1},{"r":"??????","sense":1}],"misc":["uk"],"inf":"someone or something distant from both speaker and listener, or situation unfamiliar to both speaker and listener"}]}
{"id":1000430,"r":["??????","?????????","?????????"],"rm":[{"p":["s1"],"a":0},{"p":["s1"]},{"a":0}],"s":[{"g":["say","well","um","er"],"pos":["int"]}]}
{"id":1000440,"k":["?????????","?????????"],"km":[{"p":["s1"]}],"r":["????????????"],"rm":[{"p":["s1"],"a":[{"i":2},{"i":4}]}],"s":[{"g":["he","she","that person"],"pos":["pn"],"inf":"sometimes of one's spouse or partner"},{"g":["you"],"pos":["pn"],"misc":["arch"]}]}
{"id":1000450,"k":["?????????","?????????"],"km":[{"p":["s1"]}],"r":["????????????"],"rm":[{"p":["s1"],"a":[{"i":3},{"i":4}]}],"s":[{"g":["that gentleman","that lady","he","she"],"pos":["pn"],"misc":["hon"]}]}
{"id":1000460,"k":["?????????"],"r":["????????????"],"rm":[{"a":3}],"s":[{"g":["to fail (in getting a job)","to miss out (at fishing, hunting, etc.)"],"pos":["v1","vi"],"misc":["uk"]},{"g":["to be left out","to be crowded out"],"pos":["v1","vi"],"misc":["uk"]}]}
{"id":1000470,"r":["????????????"],"rm":[{"p":["i1"],"a":0}],"s":[{"g":["contrary","opposite","inverse","reverse","back-to-front"],"pos":["adj-no","adj-na","n"],"misc":["on-mim"]}]}
{"id":1000480,"k":["????????????"],"r":["???????????????","????????????"],"rm":[{"a":0},{"a":0}],"s":[{"g":["fool","oaf","airhead"],"pos":["n"],"misc":["uk"],"dial":["ks"]},{"g":["type of fast-paced humorous singing mimicking the chanting of a Buddhist sutra, usually with lyrics satirizing current events"],"rapp":2,"pos":["n"],"xref":[{"k":"???????????????"}],"misc":["abbr"],"gt":1}]}
{"id":1000490,"k":["??????","??????","??????"],"r":["?????????","?????????"],"rm":[{"a":0},{"app":0,"a":0}],"s":[{"g":["land-locked variety of red-spotted masu trout (Oncorhynchus masou ishikawae)","amago"],"pos":["n"],"xref":[{"k":"?????????"}],"misc":["uk"]}]}
{"id":1000500,"r":["?????????"],"rm":[{"a":2}],"s":[{"g":["to cuddle","to comfort","to rock","to soothe","to dandle","to humor","to humour","to lull"],"pos":["v5s","vt"]}]}
{"id":1000510,"r":["????????????"],"rm":[{"p":["i1"],"a":0}],"s":[{"g":["uncertain","vague","ambiguous"],"pos":["adj-na","n"],"misc":["on-mim"]}]}
{"id":1000520,"r":["??????"],"rm":[{"p":["i1"],"a":[{"i":1},{"i":0}]}],"s":[{"g":["oh","ah"],"pos":["int"],"misc":["fem"]}]}
{"id":1000525,"k":["????"],"r":["??????","??????"],"rm":[0,{"app":0}],"s":[{"g":["saw-edged perch (Niphon spinosus)"],"pos":["n"],"misc":["uk"]}]}
{"id":1000580,"k":["???","??????"],"km":[{"i":["rK"]},{"i":["rK"]}],"r":["??????","???","??????"],"rm":[{"p":["i1"],"a":0},{"app":1,"i":["ok"]},{"app":0,"a":0}],"s":[{"g":["that","that thing"],"pos":["pn"],"xref":[{"r":"??????","sense":1},{"r":"??????","sense":1},{"r":"??????","sense":1}],"misc":["uk"],"inf":"indicating something distant from both speaker and listener (in space, time or psychologically), or something understood without naming it directly"},{"g":["that person"],"pos":["pn"],"misc":["uk"],"inf":"used to refer to one's equals or inferiors"},{"g":["then","that time"],"pos":["pn"],"misc":["uk"]},{"g":["that place (over there)"],"pos":["pn"],"misc":["uk"]},{"g":["down there (i.e. one's genitals)"],"pos":["n"],"misc":["col"],"inf":"esp. ??????"},{"g":["period","menses"],"pos":["n"],"misc":["col"],"inf":"esp. ??????"}]}
{"id":1000590,"r":["?????????"],"rm":[{"p":["i1"],"a":0}],"s":[{"g":["that sort of","that kind of","like that","such","so"],"pos":["adj-pn"],"xref":[{"r":"????????????"},{"r":"?????????"},{"r":"?????????","sense":1},{"r":"?????????","sense":1}],"inf":"about something or someone distant from both speaker and listener, or about a situation unfamiliar to both speaker and listener"}]}
{"id":1000600,"k":["???????????????????????????"],"r":["??????????????????????????????"],"s":[{"g":["shape up!","act properly!"],"pos":["exp"]}]}
{"id":1000610,"k":["??????????????????"],"r":["?????????????????????"],"s":[{"g":["(in spite of) being old enough to know better"],"pos":["exp"],"xref":[{"k":"???????????????"}]}]}
{"id":1000620,"k":["??????","??????"],"km":[{"p":["i1"]}],"r":["????????????","????????????"],"rm":[{"p":["i1"],"a":0},{"a":2}],"s":[{"g":["no!","no no!","no, not at all"],"pos":["int"],"xref":[{"k":"??????","r":"????????????","sense":3}],"misc":["uk"]}]}
{"id":1000630,"k":["???????????????"],"r":["??????????????????"],"rm":[{"a":5}],"s":[{"g":["suspicious","dubious","unreliable"],"pos":["adj-i"],"misc":["uk"]},{"g":["indecent","unseemly"],"pos":["adj-i"],"misc":["uk"]}]}
{"id":1000640,"r":["?????????","?????????"],"rm":[{"a":0},{"a":0}],"s":[{"g":["to be smart","to be cool","to be sharp","to be stylish"],"pos":["v5s","vi"],"misc":["col"]}]}
{"id":1000650,"k":["????????????????????????"],"r":["???????????????????????????"],"s":[{"g":["in any case","whatever the case may be"],"pos":["exp"]}]}
{"id":1000660,"k":["????????????"],"km":[{"p":["i1"]}],"r":["????????????"],"rm":[{"p":["i1"],"a":2}],"s":[{"g":["indeed","really","truly","just (like)"],"pos":["adv"],"misc":["uk"],"inf":"indicating emotive conviction"},{"g":["very","extremely","totally","terribly"],"pos":["adv"],"misc":["uk"]},{"g":["absolutely","certainly","for sure"],"pos":["adv","int"],"misc":["uk"],"inf":"indicating agreement"}]}
{"id":1000710,"k":["?????????"],"r":["????????????"],"rm":[{"a":1}],"s":[{"g":["many","much","plenty"],"pos":["adv","adj-no"],"misc":["uk"]},{"g":["hardly"],"pos":["adv"],"misc":["uk"],"inf":"in neg. sentence"}]}
{"id":1000730,"k":["????????????"],"km":[{"p":["i1"]}],"r":["????????????"],"rm":[{"p":["i1"]}],"s":[{"g":["wrong","not good","of no use"],"pos":["exp"],"misc":["uk"]},{"g":["hopeless","past hope"],"pos":["exp"],"misc":["uk"]},{"g":["must not do"],"pos":["exp"],"misc":["uk"]}]}
{"id":1000740,"r":["???????????????"],"rm":[{"a":2}],"s":[{"g":["stubborn person","strong-minded person","obstinate person"],"pos":["n"],"dial":["ts"]}]}
{"id":1000750,"r":["??????"],"rm":[{"a":1}],"s":[{"g":["now","come (now)","well"],"pos":["adv","int"]}]}
{"id":1000760,"r":["????????????","????????????"],"rm":[{"p":["i1"],"a":0},{"a":0}],"s":[{"g":["trouble","quarrel","difficulties","complication","tangle"],"pos":["n"]}]}
{"id":1000770,"r":["????????????","????????????"],"rm":[{"a":1},{"a":1}],"s":[{"g":["hesitantly","timidly","diffidently"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
{"id":1000780,"r":["????????????"],"rm":[{"a":0}],"s":[{"g":["to grow timid","to cower","to shrink","to lose one's nerve"],"pos":["v1","vi"]},{"g":["to become perverse","to become contrary","to become warped","to become withdrawn"],"pos":["v1","vi"]},{"g":["to be cramped","to be constrained"],"pos":["v1","vi"]}]}
{"id":1000790,"r":["???????????????","???????????????"],"rm":[{"a":4}],"s":[{"g":["piddling","paltry"],"pos":["adj-i"]}]}
{"id":1000800,"r":["???????????????"],"rm":[{"a":4}],"s":[{"g":["lovable","sweet","charming"],"pos":["adj-i"]},{"g":["pitiful","pathetic","touching"],"pos":["adj-i"]}]}
{"id":1000810,"k":["???????????????","????????????","???????????????"],"r":["??????????????????"],"s":[{"g":["to tinker with","to fumble with","to twist up"],"pos":["v5s"]}]}
{"id":1000820,"r":["????????????","????????????"],"rm":[{"p":["i1"],"a":1},{"a":1}],"s":[{"g":["cheerfully","excitedly"],"pos":["adv-to","adv","vs"],"misc":["on-mim"]}]}
{"id":1000830,"r":["??????????????????","??????????????????"],"rm":[{"a":1},{"a":1}],"s":[{"g":["flirting","making out"],"pos":["adv","vs"]}]}
{"id":1000840,"r":["???????????????"],"rm":[{"a":[{"i":0},{"i":3}]}],"s":[{"g":["to flirt with","to dally"],"pos":["v5k","vi"]}]}
{"id":1000860,"k":["???????????????"],"r":["???????????????"],"s":[{"g":["more than usual"],"pos":["adv"],"misc":["uk"]}]}
{"id":1000870,"k":["??????????????????"],"r":["????????????????????????"],"s":[{"g":["very easily"],"pos":["adv"]}]}
{"id":1000880,"k":["??????"],"r":["?????????"],"rm":[{"a":0}],"s":[{"g":["gallant","dashing","smart"],"pos":["adj-na"],"misc":["uk"]}]}
{"id":1000885,"k":["??????"],"r":["????????????"],"rm":[{"a":[{"i":3},{"i":0}]}],"s":[{"g":["to neigh"],"pos":["v5k","vi"]}]}
{"id":1000890,"k":["??????"],"r":["????????????"],"rm":[{"a":0}],"s":[{"g":["neigh","whinny","bray"],"pos":["n"],"misc":["uk"]}]}
{"id":1000900,"r":["?????????"],"rm":[{"a":2}],"s":[{"g":["to pick on","to tease"],"pos":["v5r","vt"]}]}
{"id":1000910,"k":["??????","??????"],"r":["?????????"],"s":[{"g":["awfully","terribly"],"pos":["adv"],"misc":["uk"]}]}
{"id":1000920,"r":["??????????????????","???????????????"],"rm":[{"p":["s1"],"a":4},{"i":["ik"]}],"s":[{"g":["come","go","stay"],"pos":["int"],"xref":[{"r":"??????????????????","sense":1}],"misc":["hon"],"inf":"used as a polite imperative"},{"g":["welcome"],"pos":["int"],"xref":[{"r":"????????????????????????"}]}]}
{"id":1000930,"r":["????????????????????????","?????????????????????"],"rm":[{"p":["i1"],"a":6},{"i":["ik"]}],"s":[{"g":["welcome"],"pos":["exp"],"inf":"used in shops, restaurants, etc."}]}
{"id":1000940,"r":["??????????????????"],"rm":[{"p":["i1"],"a":4}],"s":[{"g":["to come","to go","to be (somewhere)"],"pos":["v5aru","vi"],"misc":["hon"],"inf":"sometimes erroneously written ??????????????????"},{"g":["to be (doing)"],"pos":["v5aru","aux-v"],"misc":["hon"],"inf":"after a -te form, or the particle \\"de\\""}]}
{"id":1000960,"r":["????????????","????????????"],"rm":[{"a":1},{"a":1}],"s":[{"g":["irresolute","hesitant"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
{"id":1000970,"r":["??????????????????","??????????????????"],"rm":[{"a":1},{"a":1}],"s":[{"g":["in swarms","in clusters"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]},{"g":["tediously","slowly"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
{"id":1000980,"r":["????????????","????????????"],"rm":[{"p":["i1"],"a":1},{"a":1}],"s":[{"g":["itching to do something","impatient","sorely tempted","eager"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
{"id":1000990,"r":["????????????"],"s":[{"g":["irrepressibly aroused (esp. sexually)","stimulated"],"pos":["adv"],"misc":["on-mim"]}]}
{"id":1001000,"r":["????????????","????????????"],"rm":[{"a":1},{"a":1}],"s":[{"g":["going on and on (about inconsequential things)","talking nonsense"],"pos":["adv","vs"],"misc":["on-mim"]},{"g":["idling away the time","dawdling"],"pos":["adv","vs"],"misc":["on-mim"]}]}
{"id":1001010,"r":["????????????","????????????"],"rm":[{"p":["i1"],"a":3},{"a":3}],"s":[{"g":["carelessly","thoughtlessly","inadvertently"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
{"id":1001030,"r":["????????????","????????????","????????????","????????????","????????????"],"rm":[{"p":["i1"],"a":1},{"a":1}],"s":[{"g":["falling into a doze","dozing off","nodding off"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
{"id":1001040,"r":["????????????","????????????"],"rm":[{"a":1},{"a":1}],"s":[{"g":["winding","meandering","zigzagging","zig-zag","in twists and turns","sinuously","tortuously"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
{"id":1001050,"k":["??????","?????????"],"km":[{"p":["i1"]},{"i":["io"]}],"r":["?????????"],"rm":[{"p":["i1"]}],"s":[{"g":["undulation","winding","meandering"],"pos":["n"],"misc":["uk"]},{"g":["swell (of waves)","surge","billow","roller"],"pos":["n"],"misc":["uk"]}]}
{"id":1001060,"r":["????????????","????????????"],"rm":[{"p":["i1"],"a":1},{"a":1}],"s":[{"g":["restlessly","aimlessly","without purpose"],"pos":["adv","adv-to"],"misc":["on-mim"]},{"g":["to loiter","to drift","to hang about doing nothing","to wander aimlessly","to be restless"],"pos":["vs"],"xref":[{"k":"?????????","sense":1}],"misc":["on-mim"]},{"g":["to be restless","to fuss","to be in a fidget"],"pos":["vs"],"misc":["on-mim"]}]}
`
    );
    fetchMock.mock(
      'end:words/en/1.1.2-3.jsonl',
      `
{"type":"header","version":{"major":1,"minor":1,"patch":2,"dateOfCreation":"2022-04-05"},"records":3,"part":3,"format":"full"}
{"id":1001070,"k":["????????????"],"r":["???????????????"],"rm":[{"a":[{"i":0},{"i":4}]}],"s":[{"g":["to be flustered","to lose one's presence of mind"],"pos":["v1","vi"],"misc":["uk"]}]}
{"id":1001090,"r":["??????","??????","?????????"],"rm":[{"p":["s1"],"a":1},{"a":1}],"s":[{"g":["yes","yeah","uh huh"],"pos":["int"]},{"g":["hum","hmmm","well","erm","huh?"],"pos":["int"]},{"g":["oof"],"rapp":1,"pos":["int"],"inf":"moan or groan (of pain)"}]}
{"id":1001110,"r":["????????????","????????????"],"rm":[{"p":["s1"],"a":3},{"a":3}],"s":[{"g":["tedious","boring","being fed up with"],"pos":["adv","adv-to","vs"],"misc":["on-mim"]}]}
`
    );

    await updateWords({ majorVersion: 1 });

    const progressEvents = events.filter(
      (event): event is ProgressEvent => event.type === 'progress'
    );

    let lastFileProgress: number | undefined;
    let lastTotalProgress: number | undefined;
    for (const [i, event] of progressEvents.entries()) {
      // File progress
      assert.isAtLeast(
        event.fileProgress,
        0,
        `Progress event #${i}: file progress should be in range [0, 1]`
      );
      assert.isAtMost(
        event.fileProgress,
        1,
        `Progress event #${i}: file progress should be in range [0, 1]`
      );
      if (lastFileProgress !== undefined) {
        assert.isAtLeast(
          event.fileProgress,
          lastFileProgress,
          `Progress event #${i}: file progress should be greater than the previous value (${lastFileProgress})`
        );
      }
      lastFileProgress =
        event.fileProgress === 1 ? undefined : event.fileProgress;

      // Total progress
      assert.isAtLeast(
        event.totalProgress,
        0,
        `Progress event #${i}: total progress should be in range [0, 1]`
      );
      assert.isAtMost(
        event.totalProgress,
        1,
        `Progress event #${i}: total progress should be in range [0, 1]`
      );
      if (lastTotalProgress !== undefined) {
        if (event.fileProgress === 1) {
          assert.isAtLeast(
            event.totalProgress,
            lastTotalProgress,
            `Progress event #${i}: total progress should be greater than the previous value (${lastTotalProgress})`
          );
        } else {
          assert.isAtLeast(
            event.totalProgress,
            lastTotalProgress + 0.01,
            `Progress event #${i}: total progress should be at least 1% greater than the previous value (${lastTotalProgress})`
          );
        }
      }
      lastTotalProgress = event.totalProgress;
    }
  });

  it('should delete everything when doing a full update', async () => {
    // Initial update
    fetchMock.mock('end:version-en.json', KANJI_VERSION_1_0_0);
    fetchMock.mock(
      'end:kanji/en/1.0.0.jsonl',
      `{"type":"header","version":{"major":1,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":2,"format":"full"}
{"c":"???","r":{},"m":[],"rad":{"x":1},"refs":{"nelson_c":265,"halpern_njecd":2028},"misc":{"sc":6}}
{"c":"???","r":{},"m":["to follow","to trust to","to put confidence in","to depend on","to turn around","to turn the body"],"rad":{"x":4},"refs":{},"misc":{"sc":6}}
`
    );
    await updateKanji({ majorVersion: 1 });

    // Subsequent minor version only includes the second record
    clearCachedVersionInfo();
    fetchMock.mock(
      { url: 'end:version-en.json', overwriteRoutes: true },
      KANJI_VERSION_1_1_0
    );
    fetchMock.mock(
      'end:kanji/en/1.1.0.jsonl',
      `{"type":"header","version":{"major":1,"minor":1,"patch":0,"databaseVersion":"177","dateOfCreation":"2019-07-11"},"records":1,"format":"full"}
{"c":"???","r":{},"m":["to follow","to trust to","to put confidence in","to depend on","to turn around","to turn the body"],"rad":{"x":4},"refs":{},"misc":{"sc":6}}
`
    );
    await updateKanji({
      currentVersion: {
        major: 1,
        minor: 0,
        patch: 0,
      },
      majorVersion: 1,
    });

    // We should only get back the second record
    assert.deepEqual(await store._getKanji([13314, 13318]), [
      {
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
      },
    ]);
  });
});
