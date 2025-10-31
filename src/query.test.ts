import { assert } from 'chai';
import fetchMock from 'fetch-mock';

import { JpdictFullTextDatabase } from './database-fulltext.js';
import { clearCachedVersionInfo } from './download-version-info.js';
import {
  getKanji,
  getNames,
  getWords,
  getWordsByCrossReference,
  getWordsWithGloss,
  getWordsWithKanji,
} from './query.js';
import type { NameResult, WordResult } from './result-types.js';

const VERSION_INFO = {
  kanji: {
    '5': {
      major: 5,
      minor: 0,
      patch: 0,
      databaseVersion: '175',
      dateOfCreation: '2019-07-09',
    },
  },
  radicals: {
    '4': {
      major: 4,
      minor: 0,
      patch: 0,
      dateOfCreation: '2019-09-06',
    },
  },
  names: {
    '3': {
      major: 3,
      minor: 0,
      patch: 0,
      dateOfCreation: '2020-08-22',
    },
  },
  words: {
    '2': {
      major: 2,
      minor: 0,
      patch: 0,
      dateOfCreation: '2020-10-12',
    },
  },
};

describe('query', function () {
  let db: JpdictFullTextDatabase;

  this.timeout(15000);

  before(() => {
    fetchMock.mockGlobal();
  });

  after(() => {
    fetchMock.unmockGlobal();
  });

  beforeEach(() => {
    db = new JpdictFullTextDatabase();
    clearCachedVersionInfo();
  });

  afterEach(async () => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
    if (db) {
      await db.destroy();
    }
  });

  it('should fetch nothing when there is no database', async () => {
    const result = await getKanji({ kanji: ['引'], lang: 'en' });
    assert.deepEqual(result, []);
  });

  it('should fetch kanji', async () => {
    await db.ready;

    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:kanji/en/5.0.0.jsonl',
      `{"type":"header","version":{"major":5,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":1,"format":"full","format":"full"}
{"c":"引","r":{"py":["yin3"],"on":["イン"],"kun":["ひ.く","ひ.ける"],"na":["いな","ひき","ひけ","びき"]},"m":["pull","tug","jerk","admit","install","quote","refer to"],"rad":{"x":57},"refs":{"nelson_c":1562,"nelson_n":1681,"halpern_njecd":181,"halpern_kkld_2ed":160,"heisig6":1318,"henshall":77,"sh_kk2":216,"kanji_in_context":257,"busy_people":"3.2","kodansha_compact":605,"skip":"1-3-1","sh_desc":"3h1.1","conning":422},"misc":{"sc":4,"gr":2,"freq":218,"jlpt":3,"kk":9,"wk":3,"jlptn":4},"comp":"⼸{057-hen}⼁"}
`
    );
    fetchMock.route(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":3,"format":"full","format":"full"}
{"id":"002","r":2,"b":"⼁","k":"｜","s":1,"na":["たてぼう","ぼう"],"m":["stick"]}
{"id":"057","r":57,"b":"⼸","k":"弓","s":3,"na":["ゆみ"],"m":["bow","bow (archery, violin)"]}
{"id":"057-hen","r":57,"b":"⼸","k":"弓","pua":59218,"s":3,"na":["ゆみへん"],"m":["bow","bow (archery, violin)"],"posn":"hen"}
`
    );

    await db.update({ series: 'kanji', lang: 'en' });

    const result = await getKanji({ kanji: ['引'], lang: 'en' });
    const expected = [
      {
        c: '引',
        r: {
          on: ['イン'],
          py: ['yin3'],
          kun: ['ひ.く', 'ひ.ける'],
          na: ['いな', 'ひき', 'ひけ', 'びき'],
        },
        m: ['pull', 'tug', 'jerk', 'admit', 'install', 'quote', 'refer to'],
        rad: {
          x: {
            r: 57,
            c: '⼸',
            na: ['ゆみ'],
            m: ['bow', 'bow (archery, violin)'],
            m_lang: 'en',
          },
        },
        refs: {
          nelson_c: 1562,
          nelson_n: 1681,
          halpern_njecd: 181,
          halpern_kkld_2ed: 160,
          heisig6: 1318,
          henshall: 77,
          sh_kk2: 216,
          kanji_in_context: 257,
          busy_people: '3.2',
          kodansha_compact: 605,
          skip: '1-3-1',
          sh_desc: '3h1.1',
          conning: 422,
        },
        misc: { sc: 4, gr: 2, freq: 218, jlpt: 3, jlptn: 4, kk: 9, wk: 3 },
        comp: [
          {
            c: '⼸',
            k: '弓',
            na: ['ゆみへん'],
            m: ['bow', 'bow (archery, violin)'],
            m_lang: 'en',
            base: {
              c: '⼸',
              k: '弓',
              na: ['ゆみ'],
              m: ['bow', 'bow (archery, violin)'],
              m_lang: 'en',
            },
            is_rad: true,
          },
          {
            c: '⼁',
            k: '｜',
            na: ['たてぼう', 'ぼう'],
            m: ['stick'],
            m_lang: 'en',
          },
        ],
        m_lang: 'en',
        cf: [],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should fill in katakana component descriptions', async () => {
    await db.ready;

    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:kanji/en/5.0.0.jsonl',
      `{"type":"header","version":{"major":5,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":1,"format":"full"}
{"c":"通","r":{"on":["ツウ","ツ"],"kun":["とお.る","とお.り","-とお.り","-どお.り","とお.す","とお.し","-どお.し","かよ.う"],"na":["とん","どうし","どおり","みち"]},"m":["traffic","pass through","avenue","commute","counter for letters, notes, documents, etc."],"rad":{"x":162},"refs":{"nelson_c":4703,"nelson_n":6063,"halpern_njecd":3109,"halpern_kkld":1982,"halpern_kkld_2ed":2678,"heisig":1408,"heisig6":1511,"henshall":176,"sh_kk":150,"sh_kk2":150,"kanji_in_context":204,"busy_people":"3.11","kodansha_compact":695,"skip":"3-3-7","sh_desc":"2q7.18","conning":159},"misc":{"sc":9,"gr":2,"freq":80,"jlpt":3,"kk":9},"comp":"マ⽤⻌"}
`
    );
    fetchMock.route(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":4,"format":"full"}
{"id":"101","r":101,"b":"⽤","k":"用","s":5,"na":["もちいる"],"m":["utilize","business","service","use","employ"]}
{"id":"162","r":162,"b":"⾡","k":"辵","s":3,"na":["しんにょう","しんにゅう"],"m":["road","walk","to advance","move ahead"]}
{"id":"162-nyou","r":162,"b":"⻌","k":"辶","s":3,"na":["しんにょう","しんにゅう"],"m":["road","walk","to advance","move ahead"],"posn":"nyou"}
{"id":"162-nyou-2","r":162,"b":"⻍","k":"辶","s":4,"na":["しんにょう","しんにゅう"],"m":["road","walk","to advance","move ahead"],"posn":"nyou"}
`
    );

    await db.update({ series: 'kanji', lang: 'en' });

    const result = await getKanji({ kanji: ['通'], lang: 'en' });
    assert.deepEqual(result[0]?.comp, [
      {
        c: 'マ',
        na: ['マ'],
        m: ['katakana ma'],
        m_lang: 'en',
      },
      {
        c: '⽤',
        k: '用',
        na: ['もちいる'],
        m: ['utilize', 'business', 'service', 'use', 'employ'],
        m_lang: 'en',
      },
      {
        c: '⻌',
        k: '辵',
        na: ['しんにょう', 'しんにゅう'],
        m: ['road', 'walk', 'to advance', 'move ahead'],
        m_lang: 'en',
        base: {
          c: '⾡',
          k: '辵',
          na: ['しんにょう', 'しんにゅう'],
          m: ['road', 'walk', 'to advance', 'move ahead'],
          m_lang: 'en',
        },
        is_rad: true,
      },
    ]);
  });

  it('should match radical variants', async () => {
    await db.ready;

    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:kanji/en/5.0.0.jsonl',
      `{"type":"header","version":{"major":5,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":2,"format":"full"}
{"c":"凶","r":{"on":["キョウ"]},"m":["villain","evil","bad luck","disaster"],"rad":{"x":17},"refs":{"nelson_c":663,"nelson_n":442,"halpern_njecd":2961,"halpern_kkld":1877,"halpern_kkld_2ed":2557,"heisig":1490,"heisig6":1603,"henshall":1159,"sh_kk":1280,"sh_kk2":1354,"kanji_in_context":1812,"kodansha_compact":172,"skip":"3-2-2","sh_desc":"0a4.19","conning":296},"misc":{"sc":4,"gr":8,"freq":1673,"jlpt":1,"kk":4},"comp":"⼂⼃⼐"}
{"c":"胸","r":{"on":["キョウ"],"kun":["むね","むな-"]},"m":["bosom","breast","chest","heart","feelings"],"rad":{"x":130},"refs":{"nelson_c":3768,"nelson_n":4811,"halpern_njecd":951,"halpern_kkld":647,"halpern_kkld_2ed":858,"heisig":1491,"heisig6":1604,"henshall":840,"sh_kk":1283,"sh_kk2":1357,"kanji_in_context":1086,"kodansha_compact":1030,"skip":"1-4-6","sh_desc":"4b6.9","conning":1971},"misc":{"sc":10,"gr":6,"freq":1144,"jlpt":2,"kk":5},"comp":"⽉{130-2}⼓凶"}
`
    );
    fetchMock.route(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":5,"format":"full"}
{"id":"020","r":20,"b":"⼓","k":"勹","s":2,"na":["つつみがまえ","くがまえ"],"m":["wrapping"],"posn":"kamae"}
{"id":"074","r":74,"b":"⽉","k":"月","s":4,"na":["つき"],"m":["month","moon"]}
{"id":"074-hen","r":74,"b":"⺝","s":4,"na":["つきへん"],"m":["month","moon"],"posn":"hen"}
{"id":"130","r":130,"b":"⾁","k":"肉","s":6,"na":["にく"],"m":["meat"]}
{"id":"130-2","r":130,"b":"⽉","k":"月","pua":59224,"s":4,"na":["にくづき"],"m":["meat"]}
`
    );

    await db.update({ series: 'kanji', lang: 'en' });

    const result = await getKanji({ kanji: ['胸'], lang: 'en' });
    const expected = [
      {
        c: '胸',
        r: { on: ['キョウ'], kun: ['むね', 'むな-'] },
        m: ['bosom', 'breast', 'chest', 'heart', 'feelings'],
        rad: {
          x: {
            r: 130,
            c: '⾁',
            na: ['にく'],
            m: ['meat'],
            m_lang: 'en',
          },
        },
        refs: {
          nelson_c: 3768,
          nelson_n: 4811,
          halpern_njecd: 951,
          halpern_kkld: 647,
          halpern_kkld_2ed: 858,
          heisig: 1491,
          heisig6: 1604,
          henshall: 840,
          sh_kk: 1283,
          sh_kk2: 1357,
          kanji_in_context: 1086,
          kodansha_compact: 1030,
          skip: '1-4-6',
          sh_desc: '4b6.9',
          conning: 1971,
        },
        misc: { sc: 10, gr: 6, freq: 1144, jlpt: 2, kk: 5 },
        comp: [
          {
            c: '⽉',
            k: '肉',
            na: ['にくづき'],
            m: ['meat'],
            m_lang: 'en',
            base: {
              c: '⾁',
              k: '肉',
              na: ['にく'],
              m: ['meat'],
              m_lang: 'en',
            },
            is_rad: true,
          },
          {
            c: '⼓',
            k: '勹',
            na: ['つつみがまえ', 'くがまえ'],
            m: ['wrapping'],
            m_lang: 'en',
          },
          {
            c: '凶',
            na: ['キョウ'],
            m: ['villain', 'evil', 'bad luck', 'disaster'],
            m_lang: 'en',
          },
        ],
        m_lang: 'en',
        cf: [],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should match component variants', async () => {
    await db.ready;

    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:kanji/en/5.0.0.jsonl',
      `{"type":"header","version":{"major":5,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":1,"format":"full"}
{"c":"筋","r":{"on":["キン"],"kun":["すじ"]},"m":["muscle","sinew","tendon","fiber","plot","plan","descent"],"rad":{"x":118},"refs":{"nelson_c":3395,"nelson_n":4286,"halpern_njecd":2678,"halpern_kkld":1719,"halpern_kkld_2ed":2337,"heisig":941,"heisig6":1012,"henshall":843,"sh_kk":1090,"sh_kk2":1141,"kanji_in_context":1059,"kodansha_compact":1476,"skip":"2-6-6","sh_desc":"6f6.4","conning":392},"misc":{"sc":12,"gr":6,"freq":744,"jlpt":1,"kk":5},"comp":"⺮{118-kanmuri}⽉{130-2}⼒"}
`
    );
    fetchMock.route(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":7,"format":"full"}
{"id":"019","r":19,"b":"⼒","k":"力","s":2,"na":["ちから"],"m":["power","strength","strong","strain","bear up","exert"]}
{"id":"074","r":74,"b":"⽉","k":"月","s":4,"na":["つき"],"m":["month","moon"]}
{"id":"074-hen","r":74,"b":"⺝","s":4,"na":["つきへん"],"m":["month","moon"],"posn":"hen"}
{"id":"118","r":118,"b":"⽵","k":"竹","s":6,"na":["たけ"],"m":["bamboo"]}
{"id":"118-kanmuri","r":118,"b":"⺮","s":6,"na":["たけかんむり"],"m":["bamboo"],"posn":"kanmuri"}
{"id":"130","r":130,"b":"⾁","k":"肉","s":6,"na":["にく"],"m":["meat"]}
{"id":"130-2","r":130,"b":"⽉","k":"月","pua":59224,"s":4,"na":["にくづき"],"m":["meat"]}
`
    );

    await db.update({ series: 'kanji', lang: 'en' });

    const result = await getKanji({ kanji: ['筋'], lang: 'en' });
    const expected = [
      {
        c: '筋',
        r: { on: ['キン'], kun: ['すじ'] },
        m: ['muscle', 'sinew', 'tendon', 'fiber', 'plot', 'plan', 'descent'],
        rad: {
          x: {
            r: 118,
            c: '⽵',
            na: ['たけ'],
            m: ['bamboo'],
            m_lang: 'en',
          },
        },
        refs: {
          nelson_c: 3395,
          nelson_n: 4286,
          halpern_njecd: 2678,
          halpern_kkld: 1719,
          halpern_kkld_2ed: 2337,
          heisig: 941,
          heisig6: 1012,
          henshall: 843,
          sh_kk: 1090,
          sh_kk2: 1141,
          kanji_in_context: 1059,
          kodansha_compact: 1476,
          skip: '2-6-6',
          sh_desc: '6f6.4',
          conning: 392,
        },
        misc: { sc: 12, gr: 6, freq: 744, jlpt: 1, kk: 5 },
        comp: [
          {
            c: '⺮',
            k: '竹',
            na: ['たけかんむり'],
            m: ['bamboo'],
            m_lang: 'en',
            base: {
              c: '⽵',
              k: '竹',
              na: ['たけ'],
              m: ['bamboo'],
              m_lang: 'en',
            },
            is_rad: true,
          },
          {
            c: '⽉',
            k: '肉',
            na: ['にくづき'],
            m: ['meat'],
            m_lang: 'en',
            base: {
              c: '⾁',
              k: '肉',
              na: ['にく'],
              m: ['meat'],
              m_lang: 'en',
            },
          },
          {
            c: '⼒',
            k: '力',
            na: ['ちから'],
            m: ['power', 'strength', 'strong', 'strain', 'bear up', 'exert'],
            m_lang: 'en',
          },
        ],
        m_lang: 'en',
        cf: [],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should fetch related kanji', async () => {
    await db.ready;

    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:kanji/en/5.0.0.jsonl',
      `{"type":"header","version":{"major":5,"minor":0,"patch":0,"databaseVersion":"175","dateOfCreation":"2019-07-09"},"records":6,"format":"full"}
{"c":"構","r":{"py":["gou4"],"on":["コウ"],"kun":["かま.える","かま.う"],"na":["とち"]},"m":["posture","build","pretend"],"rad":{"x":75},"refs":{"nelson_c":2343,"nelson_n":2823,"halpern_njecd":1049,"halpern_kkld_2ed":962,"heisig6":1959,"henshall":675,"sh_kk2":1048,"kanji_in_context":991,"kodansha_compact":1108,"skip":"1-4-10","sh_desc":"4a10.10","conning":917},"misc":{"sc":14,"gr":5,"freq":316,"jlpt":2,"kk":6},"comp":"⽊{075-hen}冓","cf":"講"}
{"c":"留","r":{"py":["liu2"],"on":["リュウ","ル"],"kun":["と.める","と.まる","とど.める","とど.まる","るうぶる"],"na":["とめ"]},"m":["detain","fasten","halt","stop"],"rad":{"x":102},"refs":{"nelson_c":3003,"nelson_n":3750,"halpern_njecd":2580,"halpern_kkld_2ed":2235,"heisig6":1527,"henshall":805,"sh_kk2":774,"kanji_in_context":432,"kodansha_compact":1341,"skip":"2-5-5","sh_desc":"5f5.4","conning":1170},"misc":{"sc":10,"gr":5,"freq":731,"jlpt":2,"kk":6},"comp":"⼛⼑⽥","cf":"貿溜"}
{"c":"冓","r":{"py":["gou4"],"on":["コウ"],"kun":["かま.える"]},"m":["put together","inner palace"],"rad":{"x":13},"refs":{"nelson_n":396,"skip":"2-5-5","sh_desc":"0a10.14"},"misc":{"sc":10,"kk":1},"comp":"井再⼌"}
{"c":"講","r":{"py":["jiang3"],"on":["コウ"]},"m":["lecture","club","association"],"rad":{"x":149},"refs":{"nelson_c":4425,"nelson_n":5689,"halpern_njecd":1619,"halpern_kkld_2ed":1463,"heisig6":1957,"henshall":676,"sh_kk2":797,"kanji_in_context":495,"kodansha_compact":1707,"skip":"1-7-10","sh_desc":"7a10.3","conning":918},"misc":{"sc":17,"gr":5,"freq":653,"jlpt":2,"kk":6},"comp":"訁冓井再⼌","cf":"構"}
{"c":"貿","r":{"py":["mao4"],"on":["ボウ"]},"m":["trade","exchange"],"rad":{"x":154},"refs":{"nelson_c":4499,"nelson_n":5788,"halpern_njecd":2601,"halpern_kkld_2ed":2255,"heisig6":1529,"henshall":792,"sh_kk2":773,"kanji_in_context":433,"kodansha_compact":1733,"skip":"2-5-7","sh_desc":"7b5.8","conning":1169},"misc":{"sc":12,"gr":5,"freq":652,"jlpt":2,"kk":6},"comp":"⼛⼑⾙","cf":"留"}
{"c":"溜","r":{"py":["liu1","liu4"],"on":["リュウ"],"kun":["た.まる","たま.る","た.める","したた.る","たまり","ため"]},"m":["collect","gather","be in arrears"],"rad":{"x":85},"refs":{"nelson_c":2658,"nelson_n":3276,"halpern_njecd":662,"halpern_kkld_2ed":608,"heisig6":2415,"skip":"1-3-10","sh_desc":"3a10.11","conning":1171},"misc":{"sc":13,"gr":9,"freq":2451,"kk":15},"comp":"⺡留⼛⼑⽥"}
`
    );
    fetchMock.route(
      'end:radicals/en/4.0.0.jsonl',
      `{"type":"header","version":{"major":4,"minor":0,"patch":0,"dateOfCreation":"2019-09-06"},"records":6,"format":"full"}
{"id":"018","r":18,"b":"⼑","k":"刀","s":2,"na":["かたな"],"m":["sword","saber","knife"]}
{"id":"028","r":28,"b":"⼛","k":"厶","s":2,"na":["む"],"m":["myself"]}
{"id":"075","r":75,"b":"⽊","k":"木","s":4,"na":["き"],"m":["tree","wood"]}
{"id":"075-2","r":75,"k":"朩","s":4,"na":["き"],"m":["tree","wood"]}
{"id":"075-hen","r":75,"b":"⽊","k":"木","pua":59168,"s":4,"na":["きへん"],"m":["tree","wood"],"posn":"hen"}
{"id":"102","r":102,"b":"⽥","k":"田","s":5,"na":["た"],"m":["rice field","rice paddy"]}
`
    );

    await db.update({ series: 'kanji', lang: 'en' });

    const result = await getKanji({ kanji: ['構', '留'], lang: 'en' });

    assert.deepEqual(result[0]?.cf, [
      {
        c: '講',
        r: { py: ['jiang3'], on: ['コウ'] },
        m: ['lecture', 'club', 'association'],
        m_lang: 'en',
        misc: { sc: 17, gr: 5, freq: 653, jlpt: 2, kk: 6 },
      },
    ]);
    assert.deepEqual(result[1]?.cf, [
      {
        c: '貿',
        r: { py: ['mao4'], on: ['ボウ'] },
        m: ['trade', 'exchange'],
        m_lang: 'en',
        misc: { sc: 12, gr: 5, freq: 652, jlpt: 2, kk: 6 },
      },
      {
        c: '溜',
        r: {
          py: ['liu1', 'liu4'],
          on: ['リュウ'],
          kun: ['た.まる', 'たま.る', 'た.める', 'したた.る', 'たまり', 'ため'],
        },
        m: ['collect', 'gather', 'be in arrears'],
        m_lang: 'en',
        misc: { sc: 13, gr: 9, freq: 2451, kk: 15 },
      },
    ]);
  });

  it('should fetch names by kanji', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:names/en/3.0.0.jsonl',
      `{"type":"header","version":{"major":3,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":1,"format":"full"}
{"r":["こくろう"],"k":["国労"],"id":1657560,"tr":[{"type":["org"],"det":["National Railway Workers' Union"]}]}
`
    );

    await db.update({ series: 'names', lang: 'en' });

    const result = await getNames('国労');
    const expected: Array<NameResult> = [
      {
        r: ['こくろう'],
        k: ['国労'],
        id: 1657560,
        tr: [{ type: ['org'], det: ["National Railway Workers' Union"] }],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should fetch names by reading', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:names/en/3.0.0.jsonl',
      `{"type":"header","version":{"major":3,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":1,"format":"full"}
{"r":["こくろう"],"k":["国労"],"id":1657560,"tr":[{"type":["org"],"det":["National Railway Workers' Union"]}]}
`
    );

    await db.update({ series: 'names', lang: 'en' });

    const result = await getNames('こくろう');
    const expected: Array<NameResult> = [
      {
        r: ['こくろう'],
        k: ['国労'],
        id: 1657560,
        tr: [{ type: ['org'], det: ["National Railway Workers' Union"] }],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should fetch names by kana-equivalence', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:names/en/3.0.0.jsonl',
      `{"type":"header","version":{"major":3,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":3,"format":"full"}
{"r":["マルタ"],"id":5082405,"tr":[{"type":["place"],"det":["Malta"]},{"type":["fem"],"det":["Marta","Martha"]}]}
{"r":["まるた"],"k":["円田"],"id":5143227,"tr":[{"type":["surname"],"det":["Maruta"]}]}
{"r":["まるた"],"k":["丸太"],"id":5193528,"tr":[{"type":["place","surname"],"det":["Maruta"]}]}
`
    );

    await db.update({ series: 'names', lang: 'en' });

    // The katakana result should come last
    let result = await getNames('まるた');
    let expectedIds: Array<number> = [5143227, 5193528, 5082405];

    assert.deepEqual(
      result.map((result) => result.id),
      expectedIds
    );

    // If we repeat the search using katakana, however, it should come first
    result = await getNames('マルタ');
    expectedIds = [5082405, 5143227, 5193528];

    assert.deepEqual(
      result.map((result) => result.id),
      expectedIds
    );
  });

  it('should fetch words by kanji', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:words/en/2.0.0.jsonl',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":1,"format":"full"}
{"r":["このあいだ","このかん"],"s":[{"pos":["n-t","n-adv"],"g":["the other day","lately","recently","during this period"]},{"rapp":2,"g":["meanwhile","in the meantime"]}],"k":["この間","此の間"],"id":1004690,"km":[{"p":["i1"]}],"rm":[{"p":["i1"],"a":0},{"a":3}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    const result = await getWords('この間');
    const expected: Array<WordResult> = [
      {
        id: 1004690,
        k: [
          { ent: 'この間', match: true, matchRange: [0, 3], p: ['i1'] },
          { ent: '此の間', match: false },
        ],
        r: [
          { ent: 'このあいだ', match: true, p: ['i1'], a: 0 },
          { ent: 'このかん', match: true, a: 3 },
        ],
        s: [
          {
            pos: ['n-t', 'n-adv'],
            g: [
              { str: 'the other day' },
              { str: 'lately' },
              { str: 'recently' },
              { str: 'during this period' },
            ],
            match: true,
          },
          {
            g: [{ str: 'meanwhile' }, { str: 'in the meantime' }],
            rapp: 2,
            match: true,
          },
        ],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should fetch words by kana', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:words/en/2.0.0.jsonl',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":1,"format":"full"}
{"r":["このあいだ","このかん"],"s":[{"pos":["n-t","n-adv"],"g":["the other day","lately","recently","during this period"]},{"rapp":2,"g":["meanwhile","in the meantime"]}],"k":["この間","此の間"],"id":1004690,"km":[{"p":["i1"]}],"rm":[{"p":["i1"],"a":0},{"a":3}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    const result = await getWords('このあいだ');
    const expected: Array<WordResult> = [
      {
        id: 1004690,
        k: [
          { ent: 'この間', match: true, p: ['i1'] },
          { ent: '此の間', match: true },
        ],
        r: [
          {
            ent: 'このあいだ',
            match: true,
            matchRange: [0, 5],
            p: ['i1'],
            a: 0,
          },
          { ent: 'このかん', match: false, a: 3 },
        ],
        s: [
          {
            pos: ['n-t', 'n-adv'],
            g: [
              { str: 'the other day' },
              { str: 'lately' },
              { str: 'recently' },
              { str: 'during this period' },
            ],
            match: true,
          },
          {
            g: [{ str: 'meanwhile' }, { str: 'in the meantime' }],
            rapp: 2,
            match: false,
          },
        ],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should fetch words by kana by looking at both kanji and reading indices', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:words/en/2.0.0.jsonl',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":35,"format":"full"}
{"id":1,"r":["かきまわす"],"s":[{"pos":["v5s","vt"],"g":["to stir","to churn","to poke (a fire)","to disturb (water)"]},{"pos":["v5s","vt"],"g":["to rummage around"]},{"pos":["v5s","vt"],"g":["to throw into confusion","to throw into chaos","to disturb"]}],"k":["かき回す","掻き回す"],"km":[0,{"p":["i2"]}],"rm":[{"p":["i2"],"a":[{"i":0},{"i":4}]}]}
{"id":2,"r":["かきこむ"],"s":[{"pos":["v5m","vt"],"g":["to bolt down one's food","to gulp down","to eat quickly"]},{"pos":["v5m","vt"],"g":["to carry under the arm","to rake in","to scoop up"]}],"k":["かき込む","掻き込む","掻きこむ"],"rm":[{"a":[{"i":3},{"i":0}]}]}
{"id":3,"r":["かきあつめる"],"s":[{"pos":["v1","vt"],"g":["to gather up","to scrape up together","to rake"]}],"k":["かき集める","掻き集める"],"rm":[{"a":[{"i":5},{"i":0}]}]}
{"id":4,"r":["かきごおり","カキごおり"],"s":[{"pos":["n"],"g":["shaved ice (usually served with flavored simple syrup)","Italian ice","snow cone","sno-cone"]}],"k":["かき氷","カキ氷","掻き氷","欠き氷","欠氷"],"km":[{"p":["s1"]},0,{"i":["oK"]}],"rm":[{"app":29,"p":["s1"],"a":3},{"app":2,"a":3}]}
{"id":5,"r":["かきならす"],"s":[{"pos":["v5s","vt"],"g":["to thrum","to strum"]}],"k":["かき鳴らす","掻き鳴らす"],"rm":[{"a":[{"i":0},{"i":4}]}]}
{"id":6,"r":["かきまぜる"],"s":[{"pos":["v1"],"g":["to mix","to stir","to scramble","to churn"]}],"k":["かき交ぜる","掻き混ぜる","掻き交ぜる","かき混ぜる"],"rm":[{"a":[{"i":4},{"i":0}]}]}
{"id":7,"r":["かきあげ"],"s":[{"kapp":23,"pos":["n"],"g":["mixed vegetable and seafood tempura"]},{"pos":["n"],"g":["something pulled upwards"]},{"kapp":131,"pos":["n"],"g":["small castle with a simple earthen-walled moat"],"misc":["abbr"]},{"pos":["n"],"g":["turning up a lamp wick"]}],"k":["かき揚げ","掻き揚げ","掻揚げ","掻き上げ","掻揚","掻上","掻上げ","搔き揚げ"],"km":[0,0,0,0,{"i":["io"]},{"i":["io"]},0,{"i":["oK"]}],"rm":[{"a":0}]}
{"id":8,"r":["かきだす"],"s":[{"pos":["v5s","vt"],"g":["to scrape out","to rake out (e.g. ashes)","to bail out (e.g. water)"]}],"k":["かき出す","掻き出す","掻きだす"],"rm":[{"a":[{"i":3},{"i":0}]}]}
{"id":9,"r":["かきけす"],"s":[{"pos":["v5s","vt"],"g":["to erase","to drown out (e.g. noise, sound)"]}],"k":["かき消す","掻き消す"],"rm":[{"a":[{"i":3},{"i":0}]}]}
{"id":10,"r":["かきまぜきそく"],"s":[{"pos":["n"],"g":["scrambling"]}],"k":["かき混ぜ規則"]}
{"id":11,"r":["かきな","カキナ"],"s":[{"pos":["n"],"g":["kakina (green leafy vegetable of the genus Brassica)"],"misc":["uk"]}],"k":["かき菜"],"rm":[0,{"app":0}]}
{"id":12,"r":["かきあげじろ"],"s":[{"pos":["n"],"g":["small castle with a simple earthen-walled moat"],"misc":["obsc","arch"]}],"k":["かき揚げ城","掻き揚げ城","搔き揚げ城"],"km":[0,0,{"i":["oK"]}]}
{"id":13,"r":["かきあわせる"],"s":[{"pos":["v1","vt"],"g":["to adjust","to arrange"]}],"k":["掻き合せる","かき合せる","掻き合わせる"],"rm":[{"a":[{"i":5},{"i":0}]}]}
{"id":14,"r":["かきみだす"],"s":[{"pos":["v5s","vt"],"g":["to stir up","to disturb"]}],"k":["掻き乱す","かき乱す"],"rm":[{"a":[{"i":4},{"i":0}]}]}
{"id":15,"r":["かきたてる"],"s":[{"pos":["v1","vt"],"g":["to stir up","to arouse"]}],"k":["掻き立てる","かき立てる"],"rm":[{"a":[{"i":4},{"i":0}]}]}
{"id":16,"r":["かきいれどき"],"s":[{"pos":["n"],"g":["busiest and most profitable business period","peak season"]}],"k":["書き入れ時","かきいれ時","書入れ時","掻き入れ時"],"km":[0,0,0,{"i":["iK"]}],"rm":[{"a":0}]}
{"id":17,"r":["かきつらねる"],"s":[{"pos":["v1","vt"],"g":["to make a list","to enumerate"]}],"k":["書き連ねる","書連ねる","かき連ねる"],"rm":[{"a":[{"i":5},{"i":0}]}]}
{"id":18,"r":["かきあげる"],"s":[{"pos":["v1","vt"],"g":["to comb upwards","to brush up (a loose strand of hair)"]}],"k":["掻き上げる","かき上げる"],"rm":[{"a":[{"i":4},{"i":0}]}]}
{"id":19,"r":["かきくどく"],"s":[{"pos":["v5k","vi"],"g":["to complain","to pester","to plead","to beg"]}],"k":["掻き口説く","かき口説く"],"rm":[{"a":4}]}
{"id":20,"r":["かききる"],"s":[{"pos":["v5r","vt"],"g":["to cut","to slit"]}],"k":["掻き切る","かき切る"],"rm":[{"a":0}]}
{"id":21,"r":["かきわける"],"s":[{"pos":["v1","vt"],"g":["to push aside","to push one's way through"]}],"k":["掻き分ける","かき分ける"],"rm":[{"a":[{"i":4},{"i":0}]}]}
{"id":22,"r":["かきのける"],"s":[{"pos":["v1","vt"],"g":["to push aside","to shove aside","to rake away (leaves)"],"misc":["uk"]}],"k":["掻きのける","掻き退ける"],"rm":[{"a":0}]}
{"id":23,"r":["かきよせる"],"s":[{"pos":["v1","vt"],"g":["to sweep together","to rake up","to gather up"]},{"pos":["v1","vt"],"g":["to drag towards oneself","to pull nearer"]}],"k":["掻き寄せる","かき寄せる"],"rm":[{"a":[{"i":0},{"i":4}]}]}
{"id":24,"r":["かきまぜきそく"],"s":[{"pos":["n"],"g":["scrambling"]}],"k":["かき混ぜ規則"]}
{"id":25,"r":["かききず"],"s":[{"pos":["n"],"g":["scratch","scrape","abrasion"]}],"k":["掻き傷","かき傷"],"rm":[{"a":2}]}
{"id":26,"r":["かき"],"s":[{"pos":["n"],"g":["firearms","guns"]}],"k":["火器"],"km":[{"p":["n1","nf12"]}],"rm":[{"p":["n1","nf12"],"a":1}]}
{"id":27,"r":["かき"],"s":[{"pos":["n"],"g":["flower vase"]}],"k":["花器"],"km":[{"p":["n2","nf38"]}],"rm":[{"p":["n2","nf38"],"a":1}]}
{"id":28,"r":["かき"],"s":[{"pos":["n"],"g":["fence","hedge","barrier","wall","railing"]}],"k":["垣","牆"],"km":[{"p":["n1","nf17"]}],"rm":[{"p":["n1","nf17"],"a":2}]}
{"id":29,"r":["かき","カキ"],"s":[{"pos":["n"],"g":["kaki","Japanese persimmon (Diospyros kaki)"]}],"k":["柿","柹"],"km":[{"p":["i1","n1","nf16"]}],"rm":[{"p":["i1","n1","nf16"],"a":0},{"app":0,"a":0}]}
{"id":30,"r":["かき","なつき"],"s":[{"pos":["n","adj-no"],"g":["summer season"]}],"k":["夏季"],"km":[{"p":["i1","n1","nf13"]}],"rm":[{"p":["i1","n1","nf13"],"a":1},{"a":0}]}
{"id":31,"r":["かき"],"s":[{"pos":["n"],"g":["flowering plant","flower"]},{"pos":["n"],"g":["ornamental plant"]}],"k":["花き","花卉"],"rm":[{"a":1}]}
{"id":32,"r":["かき"],"s":[{"pos":["n","adj-no"],"g":["summer term (e.g. school)","summer period"]}],"k":["夏期"],"km":[{"p":["i1"]}],"rm":[{"p":["i1"],"a":1}]}
{"id":33,"r":["かき"],"s":[{"pos":["n"],"g":["stroke (swimming)","arm stroke"]},{"pos":["pref"],"gt":1,"g":["adds strength or emphasis to verbs"]}],"k":["掻き","搔き"],"km":[0,{"i":["oK"]}]}
{"id":34,"r":["かき","ぼれい","カキ"],"s":[{"pos":["n"],"g":["oyster","oyster shell"],"misc":["uk"]}],"k":["牡蠣","牡蛎","蠣","硴"],"km":[{"p":["s1"]}],"rm":[{"p":["s1"],"a":1},{"app":3,"a":0},{"app":0,"p":["s1"],"a":1}]}
{"id":35,"r":["かき"],"s":[{"pos":["n","adj-no"],"g":["the following"]}],"k":["下記"],"km":[{"p":["n2","nf32","s1"]}],"rm":[{"p":["n2","nf32","s1"],"a":1}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    // If we fail to look at both indices we will find at least 5 records
    // beginning with かき in the kanji index and content ourselves with that,
    // despite there being better matches in the kana index.
    const result = await getWords('かき', {
      limit: 5,
      matchType: 'startsWith',
    });

    // The first record should be something with the reading 'かき', NOT some
    // thing that matched on a kanji entry beginning with かき.
    const firstRecord = result[0];
    assert.isTrue(firstRecord?.r.some((r) => r.ent === 'かき'));
  });

  it('should fetch words by kana-equivalence', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:words/en/2.0.0.jsonl',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":2,"format":"full"}
{"r":["はんぺん","はんぺい"],"s":[{"pos":["n"],"g":["pounded fish cake"],"misc":["uk"]},{"kapp":1,"g":["half a slice","half a ticket","ticket stub"]}],"k":["半片","半平"],"id":1010230,"rm":[{"a":[{"i":0},{"i":3}]},{"app":2,"a":[{"i":0},{"i":1}]}]}
{"r":["わいシャツ"],"s":[{"pos":["n"],"g":["obscene shirt (pun)"],"xref":[{"k":"Ｙシャツ"}]}],"k":["猥シャツ"],"id":1569320}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    let result = await getWords('ハンペイ');
    const expected: Array<WordResult> = [
      {
        id: 1010230,
        k: [
          { ent: '半片', match: false },
          { ent: '半平', match: true },
        ],
        r: [
          { ent: 'はんぺん', a: [{ i: 0 }, { i: 3 }], match: false },
          {
            ent: 'はんぺい',
            app: 2,
            a: [{ i: 0 }, { i: 1 }],
            match: true,
            matchRange: [0, 4],
          },
        ],
        s: [
          {
            pos: ['n'],
            g: [{ str: 'pounded fish cake' }],
            misc: ['uk'],
            match: true,
          },
          {
            kapp: 1,
            g: [
              { str: 'half a slice' },
              { str: 'half a ticket' },
              { str: 'ticket stub' },
            ],
            match: false,
          },
        ],
      },
    ];

    assert.deepEqual(result, expected);

    result = await getWords('ワイシャツ');
    assert.lengthOf(result, 1);
    assert.nestedInclude(result[0], {
      'k.length': 1,
      'k[0].match': true,
      'r.length': 1,
      'r[0].match': true,
      'r[0].matchRange[0]': 0,
      'r[0].matchRange[1]': 5,
    });
  });

  it('should ignore sense restrictions when matching on search-only headwords', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:words/en/2.0.0.jsonl',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":1,"format":"full"}
{"id":1419550,"k":["断ち切る","裁ち切る","截ち切る","断切る","断ちきる","絶ち切る","絶ちきる","たち切る"],"km":[{"p":["n2","nf26"]},{"i":["rK"]},{"i":["rK"]},{"i":["sK"]},{"i":["sK"]},{"i":["sK"]},{"i":["sK"]},{"i":["sK"]}],"r":["たちきる"],"rm":[{"p":["n2","nf26"],"a":[{"i":3},{"i":0}]}],"s":[{"g":["to cut (cloth, paper, etc.)","to cut off"],"pos":["v5r","vt"],"yref":[{"id":2191780,"k":"断ち切り"}]},{"g":["to sever (ties)","to break off (relations)","to give up (an attachment, habit, etc.)","to stop (e.g. a vicious cycle)"],"kapp":1,"pos":["v5r","vt"]},{"g":["to cut off (a supply route, enemy's retreat, etc.)","to block","to break up (e.g. an intelligence network)"],"kapp":1,"pos":["v5r","vt"]}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    // First search on a restricted sense
    let result = await getWords('裁ち切る');
    assert.nestedInclude(result[0], {
      's.length': 3,
      's[0].match': true,
      's[1].match': false,
      's[2].match': false,
    });

    // Then search on a search-only sense
    result = await getWords('断切る');
    assert.nestedInclude(result[0], {
      's.length': 3,
      's[0].match': true,
      's[1].match': true,
      's[2].match': true,
    });
  });

  it('should expand gloss type information', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:words/en/2.0.0.jsonl',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":1,"format":"full"}
{"r":["ばついち","バツいち","バツイチ"],"s":[{"xref":[{"sense":1,"k":"戸籍"}],"pos":["n"],"gt":128,"g":["being once divorced","one-time divorcee","one x mark (i.e. one name struck from the family register)"],"misc":["uk","joc"]}],"k":["罰一","ばつ一","バツ１"],"id":1010290,"rm":[{"app":3},{"app":4},{"app":0}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    const result = await getWords('バツイチ');
    const expected: Array<WordResult> = [
      {
        id: 1010290,
        k: [
          { ent: '罰一', match: false },
          { ent: 'ばつ一', match: false },
          { ent: 'バツ１', match: false },
        ],
        r: [
          { ent: 'ばついち', app: 3, match: false },
          { ent: 'バツいち', app: 4, match: false },
          { ent: 'バツイチ', app: 0, match: true, matchRange: [0, 4] },
        ],
        s: [
          {
            xref: [{ sense: 1, k: '戸籍' }],
            pos: ['n'],
            g: [
              { str: 'being once divorced' },
              { str: 'one-time divorcee' },
              {
                str: 'one x mark (i.e. one name struck from the family register)',
                type: 'lit',
              },
            ],
            misc: ['uk', 'joc'],
            match: true,
          },
        ],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should expand WaniKani level information', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:words/en/2.0.0.jsonl',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":1,"format":"full"}
{"id":1562870,"k":["腕時計"],"km":[{"p":["i1","n1","nf14","wk24"]}],"r":["うでどけい"],"rm":[{"p":["i1","n1","nf14"],"a":3}],"s":[{"g":["wristwatch","watch"],"pos":["n"]}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    const result = await getWords('腕時計');
    const expected: Array<WordResult> = [
      {
        id: 1562870,
        k: [
          {
            ent: '腕時計',
            p: ['i1', 'n1', 'nf14'],
            wk: 24,
            match: true,
            matchRange: [0, 3],
          },
        ],
        r: [{ ent: 'うでどけい', p: ['i1', 'n1', 'nf14'], a: 3, match: true }],
        s: [
          {
            g: [{ str: 'wristwatch' }, { str: 'watch' }],
            pos: ['n'],
            match: true,
          },
        ],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should expand Bunpro level information', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:words/en/2.0.0.jsonl',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":1,"format":"full"}
{"id":1610740,"k":["違いない","違い無い"],"km":[{"p":["i1","bv4","bg3"],"bg":"に違いない"}],"r":["ちがいない"],"rm":[{"p":["i1"],"a":4}],"s":[{"g":["sure","no mistaking it","for certain","without doubt"],"pos":["exp","adj-i"],"inf":"oft. as に違いない"}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    const result = await getWords('違いない');
    const expected: Array<WordResult> = [
      {
        id: 1610740,
        k: [
          {
            ent: '違いない',
            p: ['i1'],
            match: true,
            bv: { l: 4 },
            bg: { l: 3, src: 'に違いない' },
            matchRange: [0, 4],
          },
          { ent: '違い無い', match: false },
        ],
        r: [{ ent: 'ちがいない', p: ['i1'], a: 4, match: true }],
        s: [
          {
            g: [
              { str: 'sure' },
              { str: 'no mistaking it' },
              { str: 'for certain' },
              { str: 'without doubt' },
            ],
            pos: ['exp', 'adj-i'],
            inf: 'oft. as に違いない',
            match: true,
          },
        ],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should sort more common entries first', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:words/en/2.0.0.jsonl',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":2,"format":"full"}
{"r":["ひとびと"],"s":[{"pos":["n"],"g":["people","men and women"]},{"g":["each person","everybody"]}],"k":["人々","人びと","人人"],"id":1500001,"km":[{"p":["i1","n1","nf01"]}],"rm":[{"p":["i1","n1","nf01"],"a":2}]}
{"r":["にんにん"],"s":[{"xref":[{"r":"ひとびと","sense":2,"k":"人々"}],"pos":["n"],"g":["each person","everybody"],"misc":["dated"]}],"k":["人々","人人"],"id":1500000,"rm":[{"a":1}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    const result = await getWords('人々');
    const expected: Array<WordResult> = [
      {
        id: 1500001,
        k: [
          {
            ent: '人々',
            p: ['i1', 'n1', 'nf01'],
            match: true,
            matchRange: [0, 2],
          },
          { ent: '人びと', match: false },
          { ent: '人人', match: false },
        ],
        r: [{ ent: 'ひとびと', p: ['i1', 'n1', 'nf01'], a: 2, match: true }],
        s: [
          {
            g: [{ str: 'people' }, { str: 'men and women' }],
            pos: ['n'],
            match: true,
          },
          { g: [{ str: 'each person' }, { str: 'everybody' }], match: true },
        ],
      },
      {
        id: 1500000,
        k: [
          { ent: '人々', match: true, matchRange: [0, 2] },
          { ent: '人人', match: false },
        ],
        r: [{ ent: 'にんにん', a: 1, match: true }],
        s: [
          {
            g: [{ str: 'each person' }, { str: 'everybody' }],
            xref: [{ r: 'ひとびと', sense: 2, k: '人々' }],
            pos: ['n'],
            misc: ['dated'],
            match: true,
          },
        ],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should sort kana matches first when searching on kana', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:words/en/2.0.0.jsonl',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":3,"format":"full"}
{"id":1308090,"k":["市"],"km":[{"p":["i1","wk3","wi39","bv4"]}],"r":["し"],"rm":[{"p":["i1"],"a":1}],"s":[{"g":["city"],"pos":["n","n-suf"]},{"g":["stad {i.h.b. Japanse gemeente","municipaliteit met een bevolking van 50.000 inwoners of meer}"],"lang":"nl"},{"g":["ville"],"lang":"fr"},{"g":["Stadt (als öffentliche Verwaltungseinheit)"],"lang":"de"},{"g":["város"],"lang":"hu"},{"g":["город ((ср.) まち【町】)","{～[の]} городской; муниципальный"],"lang":"ru"},{"g":["ciudad"],"lang":"es"},{"g":["stad"],"lang":"sv"}]}
{"id":1579470,"k":["四","４","肆"],"km":[{"p":["i1","n1","nf01","wk2"]}],"r":["し","よん","よ"],"rm":[{"p":["i1"],"a":1},{"app":1,"p":["i1","n1","nf01","wi12518"],"a":1},{"app":1,"a":1}],"s":[{"g":["four","4"],"pos":["num"],"inf":"肆 is used in legal documents"},{"g":["vier"],"lang":"nl"},{"g":["quatre"],"lang":"fr"},{"g":["Ruine","Überrest","eine Spur von etw","Druckstock","Holzschnitt (das Kanji steht eigentlich für den Trompetenbaum oder Katalpa; aus dessen Holz wurden die Druckstöcke angefertigt)","…wind","Wind…","Nahrung","Essen","die Pferde eines Vierspänners"],"lang":"de"},{"g":["Vierspänner","vier","4"],"lang":"de"},{"g":["négy"],"lang":"hu"},{"g":["четыре","четыре ((при отвлечённом счёте, ср.) ひ【一】, ふ【二】, み【三】)"],"lang":"ru"},{"g":["štiri"],"lang":"sl"},{"g":["cuatro (usado en documentos legales)","cuatro"],"lang":"es"}]}
{"id":2086640,"r":["し"],"rm":[{"p":["s1"],"a":1}],"s":[{"g":["and","besides","moreover","what's more","not only ... but also"],"pos":["prt","conj"]},{"g":["because","since"],"pos":["prt","conj"],"inf":"usu. indicates one of several reasons"},{"g":["the thing is","for one thing"],"pos":["prt","conj"],"inf":"at sentence end; gives reason for an unstated but deducible conclusion"},{"g":["(à la fin d'une phrase) indique l'une (de plusieurs) raisons"],"lang":"fr"}]}
`
    );
    await db.update({ series: 'words', lang: 'en' });

    const result = await getWords('し');

    assert.deepEqual(
      result.map((record) => record.id),
      [2086640, 1308090, 1579470]
    );
  });

  it('should sort only using matched headwords', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:words/en/2.0.0.jsonl',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":3,"format":"full"}
{"id":1,"r":["うま","いま","おま","ウマ"],"s":[{"pos":["n"],"g":["horse"]},{"rapp":1,"pos":["n"],"g":["horse racing"]},{"rapp":1,"field":["shogi"],"pos":["n"],"g":["promoted bishop"],"misc":["abbr"]}],"k":["馬"],"km":[{"p":["i1","n1","nf02"]}],"rm":[{"p":["i1","n1","nf02"],"a":2},{"i":["ok"]},{"i":["ok"]},{"app":0,"a":2}]}
{"id":2,"r":["いま"],"s":[{"pos":["n-adv","adj-no"],"g":["now","the present time","just now","soon","immediately"]},{"pos":["adv"],"g":["another","more"]}],"k":["今"],"km":[{"p":["i1","n1","nf07"]}],"rm":[{"p":["i1","n1","nf07"],"a":1}]}
{"id":3,"r":["いま"],"s":[{"pos":["n"],"g":["living room (Western style)","sitting room"]}],"k":["居間"],"km":[{"p":["i1","n1","nf12"]}],"rm":[{"p":["i1","n1","nf12"],"a":2}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    const result = await getWords('いま');
    const nowRanking = result.findIndex((record) => record.id === 2);

    // 馬 is more common than 今 (apparently), but only for the うま reading,
    // not the いま reading so we should rank 今 first.
    assert.equal(nowRanking, 0);
  });

  it('should search by starting string', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:words/en/2.0.0.jsonl',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":3,"format":"full"}
{"r":["せんにん"],"s":[{"pos":["n"],"g":["immortal mountain wizard (in Taoism)","mountain man (esp. a hermit)"]},{"g":["one not bound by earthly desires or the thoughts of normal men"]}],"k":["仙人","僊人"],"id":1387170,"km":[{"p":["n2","nf34","s2"]}],"rm":[{"p":["n2","nf34","s2"],"a":3}]}
{"r":["せんだい"],"s":[{"pos":["n"],"g":["Sendai (city in Miyagi)"]}],"k":["仙台"],"id":2164680,"km":[{"p":["s1"]}],"rm":[{"p":["s1"],"a":1}]}
{"r":["セント"],"s":[{"pos":["n"],"g":["cent (monetary unit)"],"misc":["uk"]}],"k":["仙"],"id":1075090,"km":[{"i":["ateji"]}],"rm":[{"p":["g1"],"a":1}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    const result = await getWords('仙', { matchType: 'startsWith', limit: 2 });
    const expected: Array<WordResult> = [
      {
        id: 1075090,
        k: [{ ent: '仙', i: ['ateji'], match: true, matchRange: [0, 1] }],
        r: [{ ent: 'セント', p: ['g1'], a: 1, match: true }],
        s: [
          {
            g: [{ str: 'cent (monetary unit)' }],
            pos: ['n'],
            misc: ['uk'],
            match: true,
          },
        ],
      },
      {
        id: 1387170,
        k: [
          {
            ent: '仙人',
            p: ['n2', 'nf34', 's2'],
            match: true,
            matchRange: [0, 1],
          },
          {
            ent: '僊人',
            match: false,
          },
        ],
        r: [
          {
            ent: 'せんにん',
            p: ['n2', 'nf34', 's2'],
            a: 3,
            match: true,
          },
        ],
        s: [
          {
            g: [
              { str: 'immortal mountain wizard (in Taoism)' },
              { str: 'mountain man (esp. a hermit)' },
            ],
            pos: ['n'],
            match: true,
          },
          {
            g: [
              {
                str: 'one not bound by earthly desires or the thoughts of normal men',
              },
            ],
            match: true,
          },
        ],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should search by individual kanji', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:words/en/2.0.0.jsonl',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":2,"format":"full"}
{"r":["せんにん"],"s":[{"pos":["n"],"g":["immortal mountain wizard (in Taoism)","mountain man (esp. a hermit)"]},{"g":["one not bound by earthly desires or the thoughts of normal men"]}],"k":["仙人","僊人"],"id":1387170,"km":[{"p":["n2","nf34","s2"]}],"rm":[{"p":["n2","nf34","s2"],"a":3}]}
{"r":["せんだい"],"s":[{"pos":["n"],"g":["Sendai (city in Miyagi)"]}],"k":["仙台"],"id":2164680,"km":[{"p":["s1"]}],"rm":[{"p":["s1"],"a":1}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    const result = await getWordsWithKanji('仙');
    const expected: Array<WordResult> = [
      {
        id: 1387170,
        k: [
          {
            ent: '仙人',
            p: ['n2', 'nf34', 's2'],
            match: true,
            matchRange: [0, 1],
          },
          { ent: '僊人', match: false },
        ],
        r: [{ ent: 'せんにん', p: ['n2', 'nf34', 's2'], a: 3, match: true }],
        s: [
          {
            g: [
              { str: 'immortal mountain wizard (in Taoism)' },
              { str: 'mountain man (esp. a hermit)' },
            ],
            pos: ['n'],
            match: true,
          },
          {
            g: [
              {
                str: 'one not bound by earthly desires or the thoughts of normal men',
              },
            ],
            match: true,
          },
        ],
      },
      {
        id: 2164680,
        k: [{ ent: '仙台', p: ['s1'], match: true, matchRange: [0, 1] }],
        r: [{ ent: 'せんだい', p: ['s1'], a: 1, match: true }],
        s: [
          { g: [{ str: 'Sendai (city in Miyagi)' }], pos: ['n'], match: true },
        ],
      },
    ];

    assert.deepEqual(result, expected);
  });

  it('should search by gloss', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:words/en/2.0.0.jsonl',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":2,"format":"full"}
{"r":["あっというまに","あっとゆうまに","アッというまに","アッとゆうまに"],"s":[{"pos":["exp","adv"],"gt":1024,"g":["just like that","in the twinkling of an eye","in the blink of an eye","in the time it takes to say \\"ah!\\""]}],"k":["あっという間に","あっと言う間に","あっとゆう間に","アッという間に","アッと言う間に","アッとゆう間に"],"id":1000390,"km":[{"p":["s1"]}],"rm":[{"app":3,"p":["s1"]},{"app":6,"a":[{"i":1},{"i":0}]},{"app":24},{"app":48,"a":[{"i":1},{"i":0}]}]}
{"r":["またたくまに"],"s":[{"pos":["adv"],"g":["in the twinkling of an eye","in a flash"]}],"k":["瞬く間に","またたく間に"],"id":1909530,"rm":[{"a":3}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    let result = await getWordsWithGloss('Twinkl', 'en');
    const expected: Array<WordResult> = [
      {
        id: 1000390,
        k: [
          { ent: 'あっという間に', p: ['s1'], match: true },
          { ent: 'あっと言う間に', match: true },
          { ent: 'あっとゆう間に', match: true },
          { ent: 'アッという間に', match: true },
          { ent: 'アッと言う間に', match: true },
          { ent: 'アッとゆう間に', match: true },
        ],
        r: [
          { ent: 'あっというまに', app: 3, p: ['s1'], match: true },
          {
            ent: 'あっとゆうまに',
            app: 6,
            a: [{ i: 1 }, { i: 0 }],
            match: true,
          },
          { ent: 'アッというまに', app: 24, match: true },
          {
            ent: 'アッとゆうまに',
            app: 48,
            a: [{ i: 1 }, { i: 0 }],
            match: true,
          },
        ],
        s: [
          {
            g: [
              { str: 'just like that' },
              { str: 'in the twinkling of an eye', matchRange: [7, 13] },
              { str: 'in the blink of an eye' },
              { str: 'in the time it takes to say "ah!"', type: 'lit' },
            ],
            pos: ['exp', 'adv'],
            match: true,
          },
        ],
      },
      {
        id: 1909530,
        k: [
          { ent: '瞬く間に', match: true },
          { ent: 'またたく間に', match: true },
        ],
        r: [{ ent: 'またたくまに', a: 3, match: true }],
        s: [
          {
            g: [
              { str: 'in the twinkling of an eye', matchRange: [7, 13] },
              { str: 'in a flash' },
            ],
            pos: ['adv'],
            match: true,
          },
        ],
      },
    ];

    assert.deepEqual(result, expected);

    // Try something random that tokenizes to nothing
    result = await getWordsWithGloss('○', 'en');
    assert.deepEqual(result, []);
  });

  it('should rank common words first', async () => {
    // Set up a bunch of sleep-related words
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:words/en/2.0.0.jsonl',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":21,"format":"full"}
{"id":1,"r":["すいみん"],"s":[{"pos":["n","adj-no"],"g":["sleep"]}],"k":["睡眠"],"km":[{"p":["i1","n1","nf07"]}],"rm":[{"p":["i1","n1","nf07"],"a":0}]}
{"id":2,"r":["すいみんざい"],"s":[{"pos":["n"],"g":["sleeping tablet"]}],"k":["睡眠剤"],"rm":[{"a":[{"i":3},{"i":0}]}]}
{"id":3,"r":["すいみんぶそく"],"s":[{"pos":["n","adj-no"],"g":["lack of sleep"]}],"k":["睡眠不足"],"rm":[{"a":5}]}
{"id":4,"r":["すいみんやく"],"s":[{"pos":["n"],"g":["sleeping pill","sleep medication"]}],"k":["睡眠薬"],"rm":[{"a":3}]}
{"id":5,"r":["ねむり","ねぶり"],"s":[{"pos":["n"],"g":["sleep","sleeping"]},{"pos":["n"],"g":["inactivity"]},{"pos":["n"],"g":["death"]}],"k":["眠り","睡り","睡"],"km":[{"p":["i1","n1","nf16"]},0,{"i":["io"]}],"rm":[{"p":["i1","n1","nf16"],"a":0},{"i":["ok"]}]}
{"id":6,"r":["ねむりぐすり"],"s":[{"pos":["n"],"g":["sleeping powder","sleeping drug","narcotic","anaesthetic","anesthetic"]}],"k":["眠り薬"],"rm":[{"a":4}]}
{"id":7,"r":["おやすみ"],"s":[{"pos":["n"],"g":["holiday","day off","absence"],"misc":["pol"]},{"pos":["n"],"g":["sleep","rest"],"misc":["hon"]},{"pos":["exp"],"g":["Good night"],"misc":["abbr","uk"]}],"k":["お休み","御休み"],"km":[{"p":["i1"]}],"rm":[{"p":["i1"],"a":0}]}
{"id":8,"r":["ね","しん","い"],"s":[{"pos":["n"],"g":["sleep"]}],"k":["寝"],"km":[{"p":["n1","nf15"]}],"rm":[{"p":["n1","nf15"],"a":0},{"a":1},{"i":["ok"],"a":1}]}
{"id":9,"r":["スリープ"],"s":[{"pos":["n"],"g":["sleep"]}]}
{"id":10,"r":["ねまき"],"s":[{"pos":["n"],"g":["sleep-wear","nightclothes","pyjamas","pajamas","nightgown","nightdress"]}],"k":["寝巻き","寝巻","寝間着","寝衣"],"km":[{"p":["i1"]},{"p":["i1"]},{"p":["i1","n2","nf42"]}],"rm":[{"p":["i1","n2","nf42"],"a":0}]}
{"id":11,"r":["めやに","めヤニ","がんし"],"s":[{"pos":["n"],"g":["eye mucus","eye discharge","sleep"]}],"k":["目やに","目ヤニ","目脂","眼脂"],"rm":[{"app":13,"a":3},{"app":2,"a":3},{"app":12}]}
{"id":12,"r":["とうじんのねごと"],"s":[{"pos":["exp","n"],"g":["gibberish"]}],"k":["唐人の寝言"]}
{"id":13,"r":["とうみん"],"s":[{"pos":["n","vs"],"g":["hibernation","winter sleep","torpor"]}],"k":["冬眠"],"km":[{"p":["i1","n2","nf34"]}],"rm":[{"p":["i1","n2","nf34"],"a":0}]}
{"id":14,"r":["ねつく"],"s":[{"pos":["v5k","vi"],"g":["to go to bed","to go to sleep","to fall asleep"]},{"pos":["v5k","vi"],"g":["to be laid up (with a cold)","to be ill in bed"]}],"k":["寝付く","寝つく"],"km":[{"p":["i1"]}],"rm":[{"p":["i1"],"a":2}]}
{"id":15,"r":["ねこむ"],"s":[{"pos":["v5m","vi"],"g":["to stay in bed","to sleep","to be laid up for a long time"]}],"k":["寝込む","寝こむ"],"km":[{"p":["n2","nf27"]}],"rm":[{"p":["n2","nf27"],"a":2}]}
{"id":16,"r":["さます"],"s":[{"pos":["v5s","vt"],"g":["to awaken","to arouse from sleep"]},{"pos":["v5s","vt"],"g":["to bring to one's senses","to disabuse (someone of)"]},{"pos":["v5s","vt"],"g":["to sober up"]},{"kapp":2,"pos":["v5s","vt"],"g":["to dampen","to throw a damper on","to spoil"]}],"k":["覚ます","醒ます"],"km":[{"p":["i1","n2","nf43"]}],"rm":[{"p":["i1","n2","nf43"],"a":2}]}
{"id":17,"r":["ねる"],"s":[{"pos":["v1","vi"],"g":["to sleep (lying down)"]},{"pos":["v1","vi"],"g":["to go to bed","to lie in bed"]},{"pos":["v1","vi"],"g":["to lie down"]},{"pos":["v1","vi"],"g":["to sleep (with someone, i.e. have intercourse)"]},{"pos":["v1","vi"],"g":["to lie flat (e.g. of hair)"]},{"pos":["v1","vi"],"g":["to lie idle (of funds, stock, etc.)"]},{"pos":["v1","vi"],"g":["to ferment (of soy sauce, miso, etc.)"]}],"k":["寝る","寐る"],"km":[{"p":["i1","n1","nf15"]},{"i":["oK"]}],"rm":[{"p":["i1","n1","nf15"],"a":0}]}
{"id":18,"r":["ねかす"],"s":[{"pos":["v5s"],"g":["to put to sleep","to lay (something) on its side"]}],"k":["寝かす"],"km":[{"p":["i1","n2","nf47"]}],"rm":[{"p":["i1","n2","nf47"],"a":0}]}
{"id":19,"r":["ねむる","ねぶる"],"s":[{"pos":["v5r","vi"],"g":["to sleep"]},{"pos":["v5r","vi"],"g":["to die","to rest (in peace)","to lie (buried)","to sleep (in the grave)"]},{"pos":["v5r","vi"],"rapp":1,"g":["to lie idle (e.g. of resources)","to lie unused","to lie untapped","to lie untouched"]},{"pos":["v5r","vi"],"g":["to close one's eyes"],"misc":["arch"]}],"k":["眠る","睡る"],"km":[{"p":["i1","n2","nf39"]}],"rm":[{"p":["i1","n2","nf39"],"a":0},{"i":["ok"]}]}
{"id":20,"r":["やすむ"],"s":[{"pos":["v5m","vi"],"g":["to be absent","to take a day off"]},{"pos":["v5m","vi"],"g":["to rest","to have a break"]},{"pos":["v5m","vi"],"g":["to go to bed","to (lie down to) sleep","to turn in","to retire"]},{"pos":["v5m","vi"],"g":["to stop doing some ongoing activity for a time","to suspend business"]}],"k":["休む"],"km":[{"p":["i1","n1","nf20"]}],"rm":[{"p":["i1","n1","nf20"],"a":2}]}
{"id":21,"r":["しびれる"],"s":[{"pos":["v1","vi"],"g":["to become numb","to go to sleep (e.g. a limb)"],"misc":["uk"]},{"pos":["v1","vi"],"g":["to get an electric shock","to tingle (from an electric shock)"],"misc":["uk"]},{"pos":["v1","vi"],"g":["to be excited","to be titillated","to be mesmerized","to be enthralled"],"misc":["uk"]}],"k":["痺れる"],"km":[{"p":["i1"]}],"rm":[{"p":["i1"],"a":3}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    // 1. Search on 'sleep' and check that 寝る (id: 17) comes up within the
    //    top 3
    let result = await getWordsWithGloss('sleep', 'en');
    let neruRanking = result.findIndex((record) => record.id === 17);
    assert.isBelow(neruRanking, 2, '寝る should be in the first 2 results');

    // 2. Search on 'to sleep' and check that 寝る (id: 17) comes up within the
    //    top 3
    result = await getWordsWithGloss('to sleep', 'en');
    neruRanking = result.findIndex((record) => record.id === 17);
    assert.equal(neruRanking, 0, '寝る should be the first result');
  });

  it('should rank 食べる before 食う', async () => {
    // Set up a bunch of eating-related words
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:words/en/2.0.0.jsonl',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":10,"format":"full"}
{"id":1,"r":["たべる"],"s":[{"pos":["v1","vt"],"g":["to eat"]},{"pos":["v1","vt"],"g":["to live on (e.g. a salary)","to live off","to subsist on"]}],"k":["食べる","喰べる"],"km":[{"p":["i1","n2","nf25"]},{"i":["iK"]}],"rm":[{"p":["i1","n2","nf25"],"a":2}]}
{"id":2,"r":["くう"],"s":[{"pos":["v5u","vt"],"g":["to eat"],"misc":["male"]},{"pos":["v5u","vt"],"g":["to live","to make a living","to survive"]},{"pos":["v5u","vt"],"g":["to bite","to sting (as insects do)"]},{"pos":["v5u","vt"],"g":["to tease","to torment","to taunt","to make light of","to make fun of"]},{"pos":["v5u","vt"],"g":["to encroach on","to eat into","to consume"]},{"pos":["v5u","vt"],"g":["to defeat a superior","to threaten a position"]},{"pos":["v5u","vt"],"g":["to consume time and-or resources"]},{"pos":["v5u","vt"],"g":["to receive something (usu. an unfavourable event)"],"misc":["col"]},{"pos":["v5u","vt"],"g":["to have sexual relations with a woman, esp. for the first time"],"misc":["male","vulg"]}],"k":["食う","喰う","啖う"],"km":[{"p":["i1","n2","nf33"]},{"p":["s1"]},{"i":["oK"]}],"rm":[{"p":["i1","n2","nf33","s1"],"a":1}]}
{"id":3,"r":["めしあがる"],"s":[{"pos":["v5r","vt"],"g":["to eat","to drink"],"misc":["hon"]}],"k":["召し上がる","召しあがる","召上がる","召し上る"],"km":[{"p":["i1","n2","nf45"]}],"rm":[{"p":["i1","n2","nf45"],"a":[{"i":0},{"i":4}]}]}
{"id":4,"r":["いただく"],"s":[{"pos":["v5k","vt"],"g":["to receive","to get","to accept","to take","to buy"],"misc":["hum","uk"]},{"pos":["v5k","vt"],"g":["to eat","to drink"],"misc":["hum","pol","uk"]},{"inf":"orig. meaning","pos":["v5k","vt"],"g":["to be crowned with","to wear (on one's head)","to have (on top)"],"misc":["uk"]},{"pos":["v5k","vt"],"g":["to have (as one's leader)","to live under (a ruler)","to install (a president)"],"misc":["uk"]},{"inf":"follows a verb in \\"-te\\" form","pos":["aux-v","v5k"],"g":["to get somebody to do something"],"misc":["hum","uk"]}],"k":["頂く","戴く"],"km":[{"p":["i1"]},{"p":["i1"]}],"rm":[{"p":["i1"],"a":0}]}
{"id":5,"r":["きっする"],"s":[{"pos":["vs-s","vt"],"g":["to eat","to drink","to smoke","to take"]},{"pos":["vs-s","vt"],"g":["to suffer (e.g. defeat)","to receive a blow"]}],"k":["喫する"],"km":[{"p":["n1","nf18"]}],"rm":[{"p":["n1","nf18"],"a":[{"i":0},{"i":3}]}]}
{"id":6,"r":["くらう"],"s":[{"pos":["v5u","vt"],"g":["to eat","to drink","to wolf","to knock back"],"misc":["vulg"]},{"pos":["v5u","vt"],"g":["to receive (e.g. a blow)"]},{"pos":["v5u","vt"],"g":["to be on the receiving end (of something undesirable)","to undergo (trouble)"]}],"k":["食らう","喰らう"],"km":[{"p":["n2","nf30","s2"]}],"rm":[{"p":["n2","nf30","s2"],"a":[{"i":0},{"i":2}]}]}
{"id":7,"r":["めす"],"s":[{"pos":["v5s","vt"],"g":["to call","to invite","to send for","to summon"],"misc":["hon"]},{"pos":["v5s","vt"],"g":["to eat","to drink"]},{"pos":["v5s","vt"],"g":["to put on","to wear"]},{"pos":["v5s","vt"],"g":["to ride"]},{"pos":["v5s","vt"],"g":["to catch (a cold)","to take (a bath)","to tickle (one's fancy)","to put on (years)","to commit (seppuku)"]},{"pos":["v5s","vt"],"g":["to do"]},{"inf":"used after the -masu stem of a verb","pos":["v5s","vt"],"gt":1,"g":["used to show respect"],"misc":["hon","arch"]}],"k":["召す"],"km":[{"p":["n2","nf47","s2"]}],"rm":[{"p":["n2","nf47","s2"],"a":1}]}
{"id":8,"r":["やる"],"s":[{"pos":["v5r","vt"],"g":["to do","to undertake","to perform","to play (a game)","to study"],"misc":["uk","col"]},{"pos":["v5r","vt"],"g":["to send","to dispatch","to despatch"],"misc":["uk"]},{"pos":["v5r","vt"],"g":["to put","to move","to turn (one's head, glance, etc.)"],"misc":["uk"]},{"pos":["v5r","vt"],"g":["to give (esp. to someone of equal or lower status)","to let have","to present","to bestow","to confer"],"misc":["uk"]},{"pos":["v5r","vt"],"g":["to make (a vehicle) go faster"],"misc":["uk"]},{"pos":["v5r","vt"],"g":["to run (a business)","to keep","to be engaged in","to practice (law, medicine, etc.)","to practise"],"misc":["uk"]},{"pos":["v5r","vt"],"g":["to have (food, drink, etc.)","to eat","to drink","to smoke"],"misc":["uk"]},{"pos":["v5r","vt"],"g":["to hold (a performance)","to perform","to show"],"misc":["uk"]},{"pos":["v5r","vt"],"g":["to ease (one's mind)"],"misc":["uk"]},{"pos":["v5r","vt"],"g":["to harm","to injure","to kill"],"misc":["col","uk"]},{"pos":["v5r","vt"],"g":["to have sex with"],"misc":["uk","sl"]},{"pos":["v5r","vi"],"g":["to live","to get by","to get along"],"misc":["uk"]},{"inf":"after the -masu stem of a verb, often in the negative","pos":["suf","v5r"],"g":["to do ... completely"],"misc":["uk"]},{"inf":"after the -masu stem of a verb","pos":["suf","v5r"],"g":["to do ... broadly","to do ... to a great distance"],"misc":["uk"]},{"inf":"after the -te form of a verb","pos":["aux-v","v5r"],"g":["to do ... for (someone of equal or lower status)","to do ... to (sometimes with negative nuance)"],"misc":["uk"]},{"inf":"after the -te form of a verb","pos":["aux-v","v5r"],"g":["to make active efforts to ..."],"misc":["uk"]}],"k":["遣る","行る"],"km":[{"p":["i1"]}],"rm":[{"p":["i1"],"a":0}]}
{"id":9,"r":["あがる"],"s":[{"pos":["v5r","vi"],"g":["to rise","to go up","to come up","to ascend","to be raised"]},{"pos":["v5r","vi"],"g":["to enter (esp. from outdoors)","to come in","to go in"]},{"pos":["v5r","vi"],"g":["to enter (a school)","to advance to the next grade"]},{"pos":["v5r","vi"],"g":["to get out (of water)","to come ashore"]},{"inf":"also written as 騰る in ref. to price","pos":["v5r","vi"],"g":["to increase"]},{"pos":["v5r","vi"],"g":["to improve","to make progress"]},{"pos":["v5r","vi"],"g":["to be promoted","to advance"]},{"pos":["v5r","vi"],"g":["to be made (of profit, etc.)"]},{"pos":["v5r","vi"],"g":["to occur (esp. of a favourable result)"]},{"inf":"often as 〜で上がる","pos":["v5r","vi"],"g":["to be adequate (to cover expenses, etc.)"]},{"pos":["v5r","vi"],"g":["to be finished","to be done","to be over"]},{"pos":["v5r","vi"],"g":["(of rain) to stop","to lift"]},{"pos":["v5r","vi"],"g":["to stop (working properly)","to cut out","to give out","to die"]},{"pos":["v5r","vi"],"g":["to win (in a card game, etc.)"]},{"kapp":4,"pos":["v5r","vi"],"g":["to be arrested"]},{"kapp":4,"pos":["v5r","vi"],"g":["to turn up (of evidence, etc.)"]},{"kapp":2,"pos":["v5r","vi"],"g":["to be deep fried"]},{"pos":["v5r","vi"],"g":["to be spoken loudly"]},{"pos":["v5r","vi"],"g":["to get nervous","to get stage fright"]},{"pos":["v5r","vi"],"g":["to be offered (to the gods, etc.)"]},{"pos":["v5r","vi"],"g":["to go","to visit"],"misc":["hum"]},{"pos":["v5r","vi"],"g":["to eat","to drink"],"misc":["hon"]},{"inf":"esp. 挙がる","pos":["v5r","vi"],"g":["to be listed (as a candidate)"]},{"pos":["v5r","vi"],"g":["to serve (in one's master's home)"]},{"inf":"in Kyoto","pos":["v5r","vi"],"g":["to go north"]},{"inf":"after the -masu stem of a verb","pos":["aux-v","v5r"],"g":["to be complete","to finish"]}],"k":["上がる","揚がる","挙がる","上る"],"km":[{"p":["i1","n1","nf13"]},{"p":["n2","nf39","s2"]},{"p":["n1","nf13"]},{"i":["io"]}],"rm":[{"p":["i1","n1","n2","nf13","nf39","s2"],"a":0}]}
{"id":10,"r":["とる"],"s":[{"pos":["v5r","vt"],"g":["to take","to pick up","to grab","to catch"]},{"pos":["v5r","vt"],"g":["to pass","to hand","to give"]},{"pos":["v5r","vt"],"g":["to get","to obtain","to acquire","to win","to receive","to earn","to take (e.g. a vacation)"]},{"pos":["v5r","vt"],"g":["to adopt (a method, proposal, etc.)","to take (a measure, attitude, etc.)","to choose"]},{"pos":["v5r","vt"],"g":["to remove","to get rid of","to take off"]},{"pos":["v5r","vt"],"g":["to take away","to steal","to rob"]},{"pos":["v5r","vt"],"g":["to eat","to have (e.g. lunch)","to take (e.g. vitamins)"]},{"pos":["v5r","vt"],"g":["to pick (e.g. flowers)","to gather","to extract (e.g. juice)","to catch (e.g. fish)"]},{"pos":["v5r","vt"],"g":["to take up (time, space)","to occupy","to spare","to set aside"]},{"pos":["v5r","vt"],"g":["to secure","to reserve","to save","to put aside","to keep"]},{"pos":["v5r","vt"],"g":["to take (e.g. a joke)","to interpret","to understand","to make out","to grasp"]},{"pos":["v5r","vt"],"g":["to record","to take down"]},{"pos":["v5r","vt"],"g":["to subscribe to (e.g. a newspaper)","to take","to buy","to get"]},{"pos":["v5r","vt"],"g":["to order","to have delivered"]},{"pos":["v5r","vt"],"g":["to charge","to fine","to take (tax)"]},{"pos":["v5r","vt"],"g":["to take (e.g. a wife)","to take on (e.g. an apprentice)","to adopt","to accept"]},{"pos":["v5r","vt"],"g":["to compete (in sumo, cards, etc.)","to play"]}],"k":["取る"],"km":[{"p":["i1","n1","nf06"]}],"rm":[{"p":["i1","n1","nf06"],"a":1}]}
`
    );

    // Check that 食べる comes first
    await db.update({ series: 'words', lang: 'en' });
    const result = await getWordsWithGloss('eat', 'en');
    const taberuRanking = result.findIndex((record) => record.id === 1);
    assert.equal(taberuRanking, 0, '食べる should appear first');
  });

  it('should search by cross-reference', async () => {
    fetchMock.route('end:version-en.json', VERSION_INFO);
    fetchMock.route(
      'end:words/en/2.0.0.jsonl',
      `{"type":"header","version":{"major":2,"minor":0,"patch":0,"databaseVersion":"n/a","dateOfCreation":"2020-08-22"},"records":8,"format":"full"}
{"r":["せいしょ"],"s":[{"field":["Christn"],"pos":["n"],"g":["Bible","Holy Writ","scriptures"]}],"k":["聖書"],"id":1380340,"km":[{"p":["i1","n1","nf14"]}],"rm":[{"p":["i1","n1","nf14"],"a":1}]}
{"r":["ワイシャツ"],"s":[{"lsrc":[{"src":"white shirt","wasei":true}],"xref":[{"r":"ホワイトシャツ"}],"pos":["n"],"g":["shirt","business shirt","dress shirt"],"misc":["uk","abbr"]}],"k":["Ｙシャツ"],"id":1148640,"km":[{"p":["i1","s1"]}],"rm":[{"p":["i1","s1"]}]}
{"r":["ジャントー","ジャントウ"],"s":[{"lsrc":[{"lang":"zh"}],"xref":[{"k":"対子"}],"field":["mahj"],"pos":["n"],"g":["pair (as part of a winning hand, together with four melds)","eyes"]}],"k":["雀頭"],"id":2749740,"rm":[0,{"i":["ik"]}]}
{"r":["もとめる"],"s":[{"pos":["v1","vt"],"g":["to want","to wish for"]},{"pos":["v1","vt"],"g":["to request","to demand","to require","to ask for"]},{"pos":["v1","vt"],"g":["to seek","to search for","to look for","to pursue (pleasure)","to hunt (a job)"]},{"xref":[{"sense":1,"k":"買う"}],"pos":["v1","vt"],"g":["to purchase","to buy"],"misc":["pol"]}],"k":["求める"],"id":1229350,"km":[{"p":["i1"]}],"rm":[{"p":["i1"],"a":3}]}
{"r":["こちら","こっち","こち"],"s":[{"xref":[{"r":"そちら","sense":1},{"r":"あちら","sense":1},{"r":"どちら","sense":1}],"pos":["pn"],"g":["this way (direction close to the speaker or towards the speaker)","this direction"],"misc":["uk"]},{"pos":["pn"],"g":["here (place close to the speaker or where the speaker is)"],"misc":["uk"]},{"pos":["pn"],"g":["this one (something physically close to the speaker)"],"misc":["uk"]},{"pos":["pn"],"g":["I","me","we","us"],"misc":["uk"]},{"rapp":1,"pos":["pn"],"g":["this person (someone physically close to the speaker and of equal or higher status)"],"misc":["uk"]}],"k":["此方"],"id":1004500,"km":[{"p":["i1"]}],"rm":[{"p":["i1"],"a":0},{"p":["i1"],"a":3},{"i":["ok"],"a":1}]}
{"r":["ぶんしょ","もんじょ","ぶんじょ"],"s":[{"pos":["n"],"g":["document","writing","letter","papers","notes","records","archives"]},{"inf":"paleography term","rapp":2,"pos":["n"],"g":["document addressed to someone"]}],"k":["文書"],"id":1583840,"km":[{"p":["i1","n1","nf02"]}],"rm":[{"p":["i1","n1","nf02"],"a":1},{"a":1},{"i":["ok"]}]}
{"r":["まる"],"s":[{"pos":["n"],"g":["circle"],"xref":[{"r":"まる","sense":1,"k":"○"}]},{"pos":["n","n-pref"],"g":["entirety","whole","full","complete"]},{"pos":["n"],"g":["money","dough","moola"],"misc":["sl"]},{"inf":"esp. 丸","pos":["n"],"g":["enclosure inside a castle's walls"]},{"xref":[{"r":"スッポン","sense":1}],"pos":["n"],"g":["soft-shelled turtle"],"dial":["ks"]},{"inf":"esp. 丸","xref":[{"sense":3,"k":"麻呂"}],"pos":["suf"],"g":["suffix for ship names","suffix for names of people (esp. infants)","suffix for names of swords, armour, musical instruments, etc.","suffix for names of dogs, horses, etc."]}],"k":["丸","円"],"id":1216250,"km":[{"p":["i1"]}],"rm":[{"p":["i1"],"a":0}]}
{"r":["がん"],"s":[{"pos":["n","n-suf"],"g":["fishball","meatball"]},{"pos":["n","n-suf"],"g":["pill"],"xref":[{"k":"丸薬"}]}],"k":["丸"],"id":2252570,"rm":[{"a":1}]}
`
    );

    await db.update({ series: 'words', lang: 'en' });

    // 1. Search on k only (聖書 linked from バイブル)
    let result = await getWordsByCrossReference({ k: '聖書' });
    assert.lengthOf(result, 1);
    assert.nestedInclude(result[0], {
      'k.length': 1,
      'k[0].ent': '聖書',
      'k[0].match': true,
      'r.length': 1,
      'r[0].match': true,
      's.length': 1,
      's[0].match': true,
    });

    // 2. Search on r only (ワイシャツ linked from カッターシャツ)
    result = await getWordsByCrossReference({ r: 'ワイシャツ' });
    assert.lengthOf(result, 1);
    assert.nestedInclude(result[0], {
      'k.length': 1,
      'k[0].match': true,
      'r.length': 1,
      'r[0].match': true,
      's.length': 1,
      's[0].match': true,
    });

    // 3. Search on k and r (雀頭, ジャントー linked from 頭)
    result = await getWordsByCrossReference({ k: '雀頭', r: 'ジャントー' });
    assert.lengthOf(result, 1);
    assert.nestedInclude(result[0], {
      'k.length': 1,
      'k[0].match': true,
      'r.length': 2,
      'r[0].ent': 'ジャントー',
      'r[0].match': true,
      'r[1].ent': 'ジャントウ',
      'r[1].match': false,
      's.length': 1,
      's[0].match': true,
    });

    // 4. Search on k and sense (求める, 2  linked from 求む)
    result = await getWordsByCrossReference({ k: '求める', sense: 2 });
    assert.lengthOf(result, 1);
    assert.nestedInclude(result[0], {
      'k.length': 1,
      'k[0].match': true,
      'r.length': 1,
      'r[0].match': true,
      's.length': 4,
      's[0].match': false,
      's[1].match': true,
      's[2].match': false,
      's[3].match': false,
    });

    // 5. Search on r and sense (こちら, 1 linked from そちら)
    result = await getWordsByCrossReference({ r: 'こちら', sense: 1 });
    assert.lengthOf(result, 1);
    assert.nestedInclude(result[0], {
      'k.length': 1,
      'k[0].match': true,
      'r.length': 3,
      'r[0].match': true,
      'r[1].match': false,
      'r[2].match': false,
      's.length': 5,
      's[0].match': true,
      's[1].match': false,
      's[2].match': false,
      's[3].match': false,
      's[4].match': false,
    });

    // 6. Search on k and r and sense (文書, ぶんしょ, 2 linked from 古文書))
    result = await getWordsByCrossReference({
      k: '文書',
      r: 'ぶんしょ',
      sense: 2,
    });
    assert.lengthOf(result, 1);
    assert.nestedInclude(result[0], {
      'k.length': 1,
      'k[0].match': true,
      'r.length': 3,
      'r[0].match': true,
      'r[1].match': false,
      'r[2].match': false,
      's.length': 2,
      's[0].match': false,
      's[1].match': true,
    });

    // 7. Search on k and r and sense where there are multiple records that
    //    match on k (丸, まる, 1 linked from 〇).
    result = await getWordsByCrossReference({ k: '丸', r: 'まる', sense: 1 });
    assert.lengthOf(result, 1);
    assert.nestedInclude(result[0], {
      'k.length': 2,
      'k[0].match': true,
      'k[1].match': false,
      'r.length': 1,
      'r[0].match': true,
      's.length': 6,
      's[0].match': true,
      's[1].match': false,
      's[2].match': false,
      's[3].match': false,
      's[4].match': false,
      's[5].match': false,
    });
  });
});
