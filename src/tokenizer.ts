export function getTokens(str: string, lang: string): Array<string> {
  // Drop any content in parentheses. These shouldn't be added to the index
  // and presumably no one types things in parentheses when searching?
  //
  // Some example strings from the database:
  //
  //   Essais {werk in drie boeken (I en II in 1580; III in 1588) van Michel Montaigne (1533-1592)}
  //   {tafeltennis} rand van de tafel
  //   Äthylen (ungesättigter Kohlenwasserstoff; C₂H₄)
  //   ((нем.) Athylen) (хим.) этилен
  //
  // Nested parentheses like the last one won't work but fixing that is _really_
  // hard.
  const lc = str.toLocaleLowerCase(lang);
  const withoutParens = lc
    .replace(/\([^)]*\)/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+\}/g, ' ')
    .trim();

  // Tokenize
  const tokens = [
    ...new Set(
      tokenize(withoutParens, lang).filter((token) => token.length > 0)
    ),
  ];

  // Stop words
  const stopWordFilter = (word: string) => isNotStopWord(word, lang);
  const withoutStopwords = tokens.filter(stopWordFilter);

  // If we have only stop words, we should return them anyway
  return withoutStopwords.length ? withoutStopwords : tokens;
}

function tokenize(str: string, lang: string): Array<string> {
  switch (lang) {
    case 'nl':
      return str.split(/[^a-záéíóúàèëïöüĳ]+/);

    case 'de':
      return str.split(/[^a-zäöüß0-9]+/);

    case 'ru':
      return str.split(/[^a-zа-яё0-9]/);

    case 'es':
      return str.split(/[^a-zá-úñü0-9]+/);

    case 'hu':
      return str.split(/[^a-záéíóúöüőű0-9]+/);

    case 'sv':
      return str.split(/[^a-z0-9åäöü0-9]+/);

    case 'fr':
      return str.split(/[^a-z0-9äâàéèëêïîöôùüûæœçÿ]+/);

    case 'sl':
      return str.split(/[^a-z0-9_čšžáéíóúŕêôàèìòù]+/);

    default:
      console.error(`Unrecognized language ${lang}`);
    /* Fall through to default tokenizer */

    case 'en':
      return str.split(/\W+/);
  }
}

function isNotStopWord(token: string, lang: string): boolean {
  const stopWords = getStopWordSet(lang);
  return token.length > 1 && !stopWords.has(token);
}

// The stop words we want are different to what you'd normally find when doing
// full-document indexing.
//
// For example, normallyyou might treat "up" as a stop word, but we want to
// be able to look up "up-to-date", "up and away" etc. so we actually want to
// keep it.
//
// The way the gloss searching works is it takes the first token in the search
// term and uses it to find a matching token in the database and then filters
// the results from there. So the real purpose of these stop words is just to
// filter out words that are not useful as the start of a match, e.g. "the",
// "an".

// prettier-ignore
const ENGLISH_STOPWORDS = [
  'a', 'am', 'an', 'and', 'are', "aren't", 'as', 'at', 'be', 'because',
  'been', 'being', 'between', 'both', 'but', 'by', "can't", 'cannot',
  "couldn't", 'did', "didn't", 'do', 'does', "doesn't", 'doing', "don't",
  'had', "hadn't", 'has', "hasn't", "haven't", 'having', 'he', "he'd",
  "he'll", "he's", 'her', 'here', "here's", 'hers', 'herself', 'him',
  'himself', 'his', "isn't", 'it', "it's", 'its', 'itself', "let's", 'me',
  'more', 'most', "mustn't", 'my', 'myself', 'no', 'nor', 'not', 'of', 'or',
  'other', 'ought', 'our', 'ours', 'ourselves', 'own', "shan't", 'she',
  "she'd", "she'll", "she's", 'should', "shouldn't", 'so', 'some', 'such',
  'than', 'that', "that's", 'the', 'their', 'theirs', 'them', 'themselves',
  'then', 'there', "there's", 'these', 'they', "they'd", "they'll",
  "they're", "they've", 'this', 'those', 'through', 'to', 'too', 'very',
  'was', "wasn't", 'we', "we'd", "we'll", "we're", "we've", 'were',
  "weren't", 'what', "what's", 'when', "when's", 'where', "where's", 'which',
  "who's", 'whom', 'why', "why's", 'with', "won't", 'would', "wouldn't",
  'you', "you'd", "you'll", "you're", "you've", 'your', 'yours', 'yourself',
  'yourselves',
];

// prettier-ignore
const DUTCH_STOPWORDS = [
  'aan', 'af', 'al', 'als', 'bij', 'dan', 'dat', 'die', 'dit', 'een', 'en',
  'er', 'had', 'heb', 'hem', 'het', 'hij', 'hoe', 'hun', 'ik', 'in', 'is',
  'je', 'kan', 'me', 'men', 'met', 'mij', 'nog', 'nu', 'of', 'ons', 'ook',
  'te', 'tot', 'uit', 'van', 'was', 'wat', 'we', 'wel', 'wij', 'zal', 'ze',
  'zei', 'zij', 'zo', 'zou',
];

// prettier-ignore
const GERMAN_STOPWORDS = [
  'aber', 'als', 'am', 'an', 'auch', 'auf', 'aus', 'bei', 'bin', 'bis', 'bist',
  'da', 'dadurch', 'daher', 'darum', 'das', 'daß', 'dass', 'dein', 'deine',
  'dem', 'den', 'der', 'des', 'dessen', 'deshalb', 'die', 'dies', 'dieser',
  'dieses', 'doch', 'dort', 'du', 'durch', 'ein', 'eine', 'einem', 'einen',
  'einer', 'eines', 'er', 'es', 'euer', 'eure', 'für', 'hatte', 'hatten',
  'hattest', 'hattet', 'hier', 'hinter', 'ich', 'ihr', 'ihre', 'im', 'in',
  'ist', 'ja', 'jede', 'jedem', 'jeden', 'jeder', 'jedes', 'jener', 'jenes',
  'jetzt', 'kann', 'kannst', 'können', 'könnt', 'machen', 'mein', 'meine',
  'mit', 'muß', 'mußt', 'musst', 'müssen', 'müßt', 'nach', 'nachdem', 'nein',
  'nicht', 'nun', 'oder', 'seid', 'sein', 'seine', 'sich', 'sie', 'sind',
  'soll', 'sollen', 'sollst', 'sollt', 'sonst', 'soweit', 'sowie', 'und',
  'unser', 'unsere', 'unter', 'vom', 'von', 'vor', 'wann', 'warum', 'was',
  'weiter', 'weitere', 'wenn', 'wer', 'werde', 'werden', 'werdet', 'weshalb',
  'wie', 'wieder', 'wieso', 'wir', 'wird', 'wirst', 'wo', 'woher', 'wohin',
  'zu', 'zum', 'zur', 'über'
];

// prettier-ignore
const RUSSIAN_STOPWORDS = [
  'а', 'е', 'и', 'ж', 'м', 'о', 'на', 'не', 'ни', 'об', 'но', 'он', 'мне',
  'мои', 'мож', 'она', 'они', 'оно', 'мной', 'много', 'многочисленное',
  'многочисленная', 'многочисленные', 'многочисленный', 'мною', 'мой', 'мог',
  'могут', 'можно', 'может', 'можхо', 'мор', 'моя', 'моё', 'мочь', 'над', 'нее',
  'оба', 'нам', 'нем', 'нами', 'ними', 'мимо', 'немного', 'одной', 'одного',
  'менее', 'однажды', 'однако', 'меня', 'нему', 'меньше', 'ней', 'наверху',
  'него', 'ниже', 'мало', 'надо', 'один', 'одиннадцать', 'одиннадцатый',
  'назад', 'наиболее', 'недавно', 'миллионов', 'недалеко', 'между', 'низко',
  'меля', 'нельзя', 'нибудь', 'непрерывно', 'наконец', 'никогда', 'никуда',
  'нас', 'наш', 'нет', 'нею', 'неё', 'них', 'мира', 'наша', 'наше', 'наши',
  'ничего', 'начала', 'нередко', 'несколько', 'обычно', 'опять', 'около', 'мы',
  'ну', 'нх', 'от', 'отовсюду', 'особенно', 'нужно', 'очень', 'отсюда', 'в',
  'во', 'вон', 'вниз', 'внизу', 'вокруг', 'вот', 'восемнадцать',
  'восемнадцатый', 'восемь', 'восьмой', 'вверх', 'вам', 'вами', 'важное',
  'важная', 'важные', 'важный', 'вдали', 'везде', 'ведь', 'вас', 'ваш', 'ваша',
  'ваше', 'ваши', 'впрочем', 'весь', 'вдруг', 'вы', 'все', 'второй', 'всем',
  'всеми', 'времени', 'время', 'всему', 'всего', 'всегда', 'всех', 'всею',
  'всю', 'вся', 'всё', 'всюду', 'г', 'год', 'говорил', 'говорит', 'года',
  'году', 'где', 'да', 'ее', 'за', 'из', 'ли', 'же', 'им', 'до', 'по', 'ими',
  'под', 'иногда', 'довольно', 'именно', 'долго', 'позже', 'более', 'должно',
  'пожалуйста', 'значит', 'иметь', 'больше', 'пока', 'ему', 'имя', 'пор',
  'пора', 'потом', 'потому', 'после', 'почему', 'почти', 'посреди', 'ей', 'два',
  'две', 'двенадцать', 'двенадцатый', 'двадцать', 'двадцатый', 'двух', 'его',
  'дел', 'или', 'без', 'день', 'занят', 'занята', 'занято', 'заняты',
  'действительно', 'давно', 'девятнадцать', 'девятнадцатый', 'девять',
  'девятый', 'даже', 'алло', 'жизнь', 'далеко', 'близко', 'здесь', 'дальше',
  'для', 'лет', 'зато', 'даром', 'первый', 'перед', 'затем', 'зачем', 'лишь',
  'десять', 'десятый', 'ею', 'её', 'их', 'бы', 'еще', 'при', 'был', 'про',
  'процентов', 'против', 'просто', 'бывает', 'бывь', 'если', 'люди', 'была',
  'были', 'было', 'будем', 'будет', 'будете', 'будешь', 'прекрасно', 'буду',
  'будь', 'будто', 'будут', 'ещё', 'пятнадцать', 'пятнадцатый', 'друго',
  'другое', 'другой', 'другие', 'другая', 'других', 'есть', 'пять', 'быть',
  'лучше', 'пятый', 'к', 'ком', 'конечно', 'кому', 'кого', 'когда', 'которой',
  'которого', 'которая', 'которые', 'который', 'которых', 'кем', 'каждое',
  'каждая', 'каждые', 'каждый', 'кажется', 'как', 'какой', 'какая', 'кто',
  'кроме', 'куда', 'кругом', 'с', 'т', 'у', 'я', 'та', 'те', 'уж', 'со', 'то',
  'том', 'снова', 'тому', 'совсем', 'того', 'тогда', 'тоже', 'собой', 'тобой',
  'собою', 'тобою', 'сначала', 'только', 'уметь', 'тот', 'тою', 'хорошо',
  'хотеть', 'хочешь', 'хоть', 'хотя', 'свое', 'свои', 'твой', 'своей', 'своего',
  'своих', 'свою', 'твоя', 'твоё', 'раз', 'уже', 'сам', 'там', 'тем', 'чем',
  'сама', 'сами', 'теми', 'само', 'рано', 'самом', 'самому', 'самой', 'самого',
  'семнадцать', 'семнадцатый', 'самим', 'самими', 'самих', 'саму', 'семь',
  'чему', 'раньше', 'сейчас', 'чего', 'сегодня', 'себе', 'тебе', 'сеаой',
  'человек', 'разве', 'теперь', 'себя', 'тебя', 'седьмой', 'спасибо', 'слишком',
  'так', 'такое', 'такой', 'такие', 'также', 'такая', 'сих', 'тех', 'чаще',
  'четвертый', 'через', 'часто', 'шестой', 'шестнадцать', 'шестнадцатый',
  'шесть', 'четыре', 'четырнадцать', 'четырнадцатый', 'сколько', 'сказал',
  'сказала', 'сказать', 'ту', 'ты', 'три', 'эта', 'эти', 'что', 'это', 'чтоб',
  'этом', 'этому', 'этой', 'этого', 'чтобы', 'этот', 'стал', 'туда', 'этим',
  'этими', 'рядом', 'тринадцать', 'тринадцатый', 'этих', 'третий', 'тут', 'эту',
  'суть', 'чуть', 'тысяч'
];

// prettier-ignore
const SPANISH_STOPWORDS = [
  'un', 'una', 'unas', 'unos', 'uno', 'sobre', 'todo', 'también', 'tras',
  'otro', 'algún', 'alguno', 'alguna', 'algunos', 'algunas', 'ser', 'es', 'soy',
  'eres', 'somos', 'sois', 'estoy', 'esta', 'estamos', 'estais', 'estan',
  'como', 'en', 'para', 'atras', 'porque', 'por qué', 'estado', 'estaba',
  'ante', 'antes', 'siendo', 'ambos', 'pero', 'por', 'poder', 'puede', 'puedo',
  'podemos', 'podeis', 'pueden', 'fui', 'fue', 'fuimos', 'fueron', 'hacer',
  'hago', 'hace', 'hacemos', 'haceis', 'hacen', 'cada', 'fin', 'incluso',
  'primero', 'desde', 'conseguir', 'consigo', 'consigue', 'consigues',
  'conseguimos', 'consiguen', 'ir', 'voy', 'va', 'vamos', 'vais', 'van', 'vaya',
  'gueno', 'ha', 'tener', 'tengo', 'tiene', 'tenemos', 'teneis', 'tienen', 'el',
  'la', 'lo', 'las', 'los', 'su', 'aqui', 'mio', 'tuyo', 'ellos', 'ellas',
  'nos', 'nosotros', 'vosotros', 'vosotras', 'si', 'dentro', 'solo',
  'solamente', 'saber', 'sabes', 'sabe', 'sabemos', 'sabeis', 'saben', 'ultimo',
  'largo', 'bastante', 'haces', 'muchos', 'aquellos', 'aquellas', 'sus',
  'entonces', 'tiempo', 'verdad', 'verdadero', 'verdadera', 'cierto', 'ciertos',
  'cierta', 'ciertas', 'intentar', 'intento', 'intenta', 'intentas',
  'intentamos', 'intentais', 'intentan', 'dos', 'bajo', 'arriba', 'encima',
  'usar', 'uso', 'usas', 'usa', 'usamos', 'usais', 'usan', 'emplear', 'empleo',
  'empleas', 'emplean', 'ampleamos', 'empleais', 'valor', 'muy', 'era', 'eras',
  'eramos', 'eran', 'modo', 'bien', 'cual', 'cuando', 'donde', 'mientras',
  'quien', 'con', 'entre', 'sin', 'trabajo', 'trabajar', 'trabajas', 'trabaja',
  'trabajamos', 'trabajais', 'trabajan', 'podria', 'podrias', 'podriamos',
  'podrian', 'podriais','yo', 'aquel',
];

// prettier-ignore
const HUNGARIAN_STOPWORDS = [
  'a', 'az', 'egy', 'be', 'ki', 'le', 'fel', 'meg', 'el', 'át', 'rá', 'ide',
  'oda', 'szét', 'össze', 'vissza', 'de', 'hát', 'és', 'vagy', 'hogy', 'van',
  'lesz', 'volt', 'csak', 'nem', 'igen', 'mint', 'én', 'te', 'õ', 'mi', 'ti',
  'õk', 'ön',
];

// prettier-ignore
const SWEDISH_STOPWORDS = [
  'aderton', 'adertonde', 'adjö', 'aldrig', 'alla', 'allas', 'allt', 'alltid',
  'alltså', 'än', 'andra', 'andras', 'annan', 'annat', 'ännu', 'artonde',
  'artonn', 'åtminstone', 'att', 'åtta', 'åttio', 'åttionde', 'åttonde', 'av',
  'även', 'båda', 'bådas', 'bakom', 'bara', 'bäst', 'bättre', 'behöva',
  'behövas', 'behövde', 'behövt', 'beslut', 'beslutat', 'beslutit', 'bland',
  'blev', 'bli', 'blir', 'blivit', 'bort', 'borta', 'bra', 'då', 'dag', 'dagar',
  'dagarna', 'dagen', 'där', 'därför', 'de', 'del', 'delen', 'dem', 'den',
  'deras', 'dess', 'det', 'detta', 'dig', 'din', 'dina', 'dit', 'ditt', 'dock',
  'du', 'efter', 'eftersom', 'elfte', 'eller', 'elva', 'en', 'enkel', 'enkelt',
  'enkla', 'enligt', 'er', 'era', 'ert', 'ett', 'ettusen', 'få', 'fanns', 'får',
  'fått', 'fem', 'femte', 'femtio', 'femtionde', 'femton', 'femtonde', 'fick',
  'fin', 'finnas', 'finns', 'fjärde', 'fjorton', 'fjortonde', 'fler', 'flera',
  'flesta', 'följande', 'för', 'före', 'förlåt', 'förra', 'första', 'fram',
  'framför', 'från', 'fyra', 'fyrtio', 'fyrtionde', 'gå', 'gälla', 'gäller',
  'gällt', 'går', 'gärna', 'gått', 'genast', 'genom', 'gick', 'gjorde', 'gjort',
  'god', 'goda', 'godare', 'godast', 'gör', 'göra', 'gott', 'ha', 'hade',
  'haft', 'han', 'hans', 'har', 'här', 'heller', 'hellre', 'helst', 'helt',
  'henne', 'hennes', 'hit', 'hög', 'höger', 'högre', 'högst', 'hon', 'honom',
  'hundra', 'hundraen', 'hundraett', 'hur', 'i', 'ibland', 'idag', 'igår',
  'igen', 'imorgon', 'in', 'inför', 'inga', 'ingen', 'ingenting', 'inget',
  'innan', 'inne', 'inom', 'inte', 'inuti', 'ja', 'jag', 'jämfört', 'kan',
  'kanske', 'knappast', 'kom', 'komma', 'kommer', 'kommit', 'kr', 'kunde',
  'kunna', 'kunnat', 'kvar', 'länge', 'längre', 'långsam', 'långsammare',
  'långsammast', 'långsamt', 'längst', 'långt', 'lätt', 'lättare', 'lättast',
  'legat', 'ligga', 'ligger', 'lika', 'likställd', 'likställda', 'lilla',
  'lite', 'liten', 'litet', 'man', 'många', 'måste', 'med', 'mellan', 'men',
  'mer', 'mera', 'mest', 'mig', 'min', 'mina', 'mindre', 'minst', 'mitt',
  'mittemot', 'möjlig', 'möjligen', 'möjligt', 'möjligtvis', 'mot', 'mycket',
  'någon', 'någonting', 'något', 'några', 'när', 'nästa', 'ned', 'nederst',
  'nedersta', 'nedre', 'nej', 'ner', 'ni', 'nio', 'nionde', 'nittio',
  'nittionde', 'nitton', 'nittonde', 'nödvändig', 'nödvändiga', 'nödvändigt',
  'nödvändigtvis', 'nog', 'noll', 'nr', 'nu', 'nummer', 'och', 'också', 'ofta',
  'oftast', 'olika', 'olikt', 'om', 'oss', 'över', 'övermorgon', 'överst',
  'övre', 'på', 'rakt', 'rätt', 'redan', 'så', 'sade', 'säga', 'säger', 'sagt',
  'samma', 'sämre', 'sämst', 'sedan', 'senare', 'senast', 'sent', 'sex',
  'sextio', 'sextionde', 'sexton', 'sextonde', 'sig', 'sin', 'sina', 'sist',
  'sista', 'siste', 'sitt', 'sjätte', 'sju', 'sjunde', 'sjuttio', 'sjuttionde',
  'sjutton', 'sjuttonde', 'ska', 'skall', 'skulle', 'slutligen', 'små', 'smått',
  'snart', 'som', 'stor', 'stora', 'större', 'störst', 'stort', 'tack', 'tidig',
  'tidigare', 'tidigast', 'tidigt', 'till', 'tills', 'tillsammans', 'tio',
  'tionde', 'tjugo', 'tjugoen', 'tjugoett', 'tjugonde', 'tjugotre', 'tjugotvå',
  'tjungo', 'tolfte', 'tolv', 'tre', 'tredje', 'trettio', 'trettionde',
  'tretton', 'trettonde', 'två', 'tvåhundra', 'under', 'upp', 'ur', 'ursäkt',
  'ut', 'utan', 'utanför', 'ute', 'vad', 'vänster', 'vänstra', 'var', 'vår',
  'vara', 'våra', 'varför', 'varifrån', 'varit', 'varken', 'värre', 'varsågod',
  'vart', 'vårt', 'vem', 'vems', 'verkligen', 'vi', 'vid', 'vidare', 'viktig',
  'viktigare', 'viktigast', 'viktigt', 'vilka', 'vilken', 'vilket', 'vill',
];

// prettier-ignore
const FRENCH_STOPWORDS = [
  'alors', 'au', 'aucuns', 'aussi', 'autre', 'avant', 'avec', 'avoir', 'bon',
  'car', 'ce', 'cela', 'ces', 'ceux', 'chaque', 'ci', 'comme', 'comment',
  'dans', 'des', 'du', 'dedans', 'dehors', 'depuis', 'devrait', 'doit', 'donc',
  'dos', 'début', 'elle', 'elles', 'en', 'encore', 'essai', 'est', 'et', 'eu',
  'fait', 'faites', 'fois', 'font', 'hors', 'ici', 'il', 'ils', 'je', 'juste',
  'la', 'le', 'les', 'leur', 'là', 'ma', 'maintenant', 'mais', 'mes', 'mien',
  'moins', 'mon', 'mot', 'même', 'ni', 'nommés', 'notre', 'nous', 'ou', 'où',
  'par', 'parce', 'pas', 'peut', 'peu', 'plupart', 'pour', 'pourquoi', 'quand',
  'que', 'quel', 'quelle', 'quelles', 'quels', 'qui', 'sa', 'sans', 'ses',
  'seulement', 'si', 'sien', 'son', 'sont', 'sous', 'soyez', 'sujet', 'sur',
  'ta', 'tandis', 'tellement', 'tels', 'tes', 'ton', 'tous', 'tout', 'trop',
  'très', 'tu', 'voient', 'vont', 'votre', 'vous', 'vu', 'ça', 'étaient',
  'état', 'étions', 'été', 'être',
];

// The following list is almost certainly too aggressive but I don't know
// Slovene so I don't know which to drop. I've already dropped several hundred.

// prettier-ignore
const SLOVENE_STOPWORDS = [
  'a', 'ali', 'b', 'bi', 'bil', 'bila', 'bile', 'bili', 'bilo', 'biti', 'blizu',
  'bo', 'bodo', 'bojo', 'bolj', 'bom', 'bomo', 'boste', 'bova', 'boš', 'brez',
  'c', 'd', 'da', 'daleč', 'dan', 'datum', 'do', 'dokler', 'dol', 'e', 'eden',
  'en', 'ena', 'ene', 'eni', 'enkrat', 'eno', 'etc.', 'f', 'g', 'g.', 'ga',
  'ga.', 'gor', 'h', 'halo', 'i', 'idr.', 'ii', 'iii', 'in', 'iv', 'ix', 'iz',
  'j', 'jaz', 'je', 'ji', 'jih', 'jim', 'jo', 'k', 'kaj', 'kajti', 'kako',
  'kakor', 'kamor', 'kamorkoli', 'kar', 'karkoli', 'katerikoli', 'kdaj', 'kdo',
  'kdorkoli', 'ker', 'ki', 'kje', 'kjer', 'kjerkoli', 'ko', 'koder',
  'koderkoli', 'koga', 'komu', 'kot', 'l', 'le', 'lepo', 'm', 'me', 'med',
  'medtem', 'mene', 'mi', 'midva', 'midve', 'mnogo', 'moj', 'moja', 'moje',
  'mora', 'morajo', 'moram', 'moramo', 'morate', 'moraš', 'morem', 'mu', 'n',
  'na', 'naj', 'najina', 'najino', 'najmanj', 'naju', 'največ', 'nam', 'narobe',
  'nas', 'nato', 'nazaj', 'naš', 'naša', 'naše', 'ne', 'nek', 'neka', 'nekaj',
  'nekatere', 'nekateri', 'nekatero', 'nekdo', 'neke', 'nekega', 'neki',
  'nekje', 'neko', 'nekoga', 'ni', 'nje', 'njega', 'njegov', 'njegova',
  'njegovo', 'njej', 'njemu', 'njen', 'njena', 'njeno', 'nji', 'njih', 'njihov',
  'njihova', 'njihovo', 'njiju', 'njim', 'njo', 'njun', 'njuna', 'njuno', 'no',
  'npr.', 'o', 'ob', 'oba', 'obe', 'oboje', 'od', 'odprt', 'odprta', 'odprti',
  'okoli', 'on', 'onadva', 'one', 'oni', 'onidve', 'oz.', 'p', 'pa', 'po',
  'pod', 'pogosto', 'poleg', 'ponovno', 'potem', 'povsod', 'prbl.', 'precej',
  'pred', 'prej', 'preko', 'pri', 'pribl.', 'proti', 'r', 'redko', 'res', 'reč',
  's', 'saj', 'sam', 'sama', 'same', 'sami', 'samo', 'se', 'sebe', 'sebi',
  'sem', 'seveda', 'si', 'sicer', 'skoraj', 'skozi', 'smo', 'so', 'spet', 'sta',
  'ste', 'stran', 'stvar', 'sva', 't', 'ta', 'tak', 'taka', 'take', 'taki',
  'tako', 'tam', 'te', 'tebe', 'tebi', 'tega', 'ti', 'tista', 'tiste', 'tisti',
  'tisto', 'tj.', 'tja', 'to', 'toda', 'tu', 'tudi', 'tukaj', 'tvoj', 'tvoja',
  'tvoje', 'u', 'v', 'vaju', 'vam', 'vas', 'vaš', 'vaša', 'vaše', 've',
  'vendar', 'več', 'vi', 'vidva', 'vii', 'viii', 'vsa', 'vsaj', 'vsak', 'vsaka',
  'vsakdo', 'vsake', 'vsaki', 'vsakomur', 'vse', 'vsega', 'vsi', 'vso',
  'včasih', 'x', 'z', 'za', 'zadnji', 'zakaj', 'zdaj', 'zelo', 'zunaj', 'č',
  'če', 'često', 'čez', 'čigav', 'š', 'ž', 'že'
];

const STOPWORDS: { [lang: string]: Array<string> } = {
  en: ENGLISH_STOPWORDS,
  nl: DUTCH_STOPWORDS,
  de: GERMAN_STOPWORDS,
  ru: RUSSIAN_STOPWORDS,
  es: SPANISH_STOPWORDS,
  hu: HUNGARIAN_STOPWORDS,
  sv: SWEDISH_STOPWORDS,
  fr: FRENCH_STOPWORDS,
  sl: SLOVENE_STOPWORDS,
};

// We store these as arrays and generate Sets on demand so we can tree-shake
// the data.

const stopWordSetCache: { [lang: string]: Set<string> } = {};

function getStopWordSet(lang: string): Set<string> {
  if (!stopWordSetCache[lang]) {
    stopWordSetCache[lang] = new Set(STOPWORDS[lang] || []);
  }
  return stopWordSetCache[lang];
}
