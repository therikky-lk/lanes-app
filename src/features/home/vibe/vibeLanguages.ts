/** A flag represents a language filter, not where the recording was made. */
export const QUICK_VIBE_FLAGS = { russian: "RU", english: "US" } as const;

export const OTHER_VIBE_LANGUAGES = {
  ukrainian: ["uk", "UA", "ukr", "українські пісні"],
  es: ["es", "ES", "spa", "canciones en español"],
  fr: ["fr", "FR", "fra", "chansons françaises"],
  de: ["de", "DE", "deu", "deutsche Lieder"],
  it: ["it", "IT", "ita", "canzoni italiane"],
  pt: ["pt", "BR", "por", "músicas em português"],
  pl: ["pl", "PL", "pol", "polskie piosenki"],
  tr: ["tr", "TR", "tur", "Türkçe şarkılar"],
  ja: ["ja", "JP", "jpn", "日本語の曲"],
  ko: ["ko", "KR", "kor", "한국어 노래"],
  zh: ["zh", "CN", "cmn", "华语歌曲"],
  hi: ["hi", "IN", "hin", "हिंदी गाने"],
  ar: ["ar", "SA", "arb", "أغاني عربية"],
  kk: ["kk", "KZ", "kaz", "қазақша әндер"],
  be: ["be", "BY", "bel", "беларускія песні"],
  nl: ["nl", "NL", "nld", "Nederlandstalige liedjes"],
  sv: ["sv", "SE", "swe", "svenska låtar"],
  el: ["el", "GR", "ell", "ελληνικά τραγούδια"],
  he: ["he", "IL", "heb", "שירים בעברית"],
  th: ["th", "TH", "tha", "เพลงไทย"],
  vi: ["vi", "VN", "vie", "bài hát tiếng Việt"],
  id: ["id", "ID", "ind", "lagu bahasa Indonesia"],
  ro: ["ro", "RO", "ron", "melodii românești"],
  cs: ["cs", "CZ", "ces", "české písničky"],
  da: ["da", "DK", "dan", "danske sange"],
  no: ["no", "NO", "nob", "norske sanger"],
  fi: ["fi", "FI", "fin", "suomalaisia kappaleita"],
  et: ["et", "EE", "est", "eestikeelsed laulud"],
  ms: ["ms", "MY", "zlm", "lagu bahasa Melayu"],
  sw: ["sw", "TZ", "swh", "nyimbo za Kiswahili"],
  lv: ["lv", "LV", "lvs", "dziesmas latviešu valodā"],
  lt: ["lt", "LT", "lit", "lietuviškos dainos"],
  hu: ["hu", "HU", "hun", "magyar dalok"],
  sk: ["sk", "SK", "slk", "slovenské piesne"],
  hr: ["hr", "HR", "hrv", "hrvatske pjesme"],
  sr: ["sr", "RS", "srp", "српске песме"],
  bg: ["bg", "BG", "bul", "български песни"],
  hy: ["hy", "AM", "hye", "հայերեն երգեր"],
  ka: ["ka", "GE", "kat", "ქართული სიმღერები"],
  fa: ["fa", "IR", "pes", "آهنگ های فارسی"],
  bn: ["bn", "BD", "ben", "বাংলা গান"],
  ta: ["ta", "LK", "tam", "தமிழ் பாடல்கள்"],
  tl: ["tl", "PH", "tgl", "mga kantang Tagalog"],
  az: ["az", "AZ", "azj", "azərbaycanca mahnılar"],
  uz: ["uz", "UZ", "uzn", "o‘zbekcha qo‘shiqlar"],
  ky: ["ky", "KG", "kir", "кыргызча ырлар"],
  tg: ["tg", "TJ", "tgk", "сурудҳои тоҷикӣ"],
  tk: ["tk", "TM", "tuk", "türkmen aýdymlary"],
  mn: ["mn", "MN", "khk", "монгол дуунууд"],
  ur: ["ur", "PK", "urd", "اردو گانے"],
  ne: ["ne", "NP", "npi", "नेपाली गीतहरू"],
  my: ["my", "MM", "mya", "မြန်မာသီချင်းများ"],
  km: ["km", "KH", "khm", "ចម្រៀងខ្មែរ"],
  lo: ["lo", "LA", "lao", "ເພງລາວ"],
  ps: ["ps", "AF", "pbu", "پښتو سندرې"],
  sq: ["sq", "AL", "als", "këngë shqip"],
  bs: ["bs", "BA", "bos", "bosanske pjesme"],
  mk: ["mk", "MK", "mkd", "македонски песни"],
  sl: ["sl", "SI", "slv", "slovenske pesmi"],
  af: ["af", "ZA", "afr", "Afrikaanse liedjies"],
  am: ["am", "ET", "amh", "የአማርኛ ዘፈኖች"],
  so: ["so", "SO", "som", "heeso Soomaali"],
  ha: ["ha", "NG", "hau", "waƙoƙin Hausa"],
  sn: ["sn", "ZW", "sna", "nziyo dzechiShona"],
  rw: ["rw", "RW", "kin", "indirimbo z'Ikinyarwanda"],
  ln: ["ln", "CD", "lin", "nzembo ya Lingála"],
  wo: ["wo", "SN", "wol", "woy yi ci Wolof"],
  ca: ["ca", "AD", "cat", "cançons en català"],
  ht: ["ht", "HT", "hat", "chante an kreyòl ayisyen"],
  qu: ["qu", "PE", "quz", "runasimi takikuna"],
  ay: ["ay", "BO", "ayr", "aymara kirkinaka"],
  tpi: ["tpi", "PG", "tpi", "ol singsing long Tok Pisin"],
  ckb: ["ckb", "IQ", "ckb", "گۆرانیی سۆرانی"],
  ny: ["ny", "MW", "nya", "nyimbo za Chichewa"],
  rn: ["rn", "BI", "run", "indirimbo z'ikirundi"],
  lg: ["lg", "UG", "lug", "ennyimba za Luganda"],
  tn: ["tn", "BW", "tsn", "dipina tsa Setswana"],
  st: ["st", "LS", "sot", "lipina tsa Sesotho"],
  bem: ["bem", "ZM", "bem", "inyimbo sha Chibemba"],
  sg: ["sg", "CF", "sag", "bia na Sängö"],
  mos: ["mos", "BF", "mos", "chansons en mooré"],
  bm: ["bm", "ML", "bam", "donkili bamanankan"],
  tem: ["tem", "SL", "tem", "Temne traditional songs"],
} as const;

/** One flag per region; its filter can include several languages. */
export const VIBE_REGION_LANGUAGES = {
  hi: {
    gu: ["guj", "ગુજરાતી ગીતો"],
    mr: ["mar", "मराठी गाणी"],
    kn: ["kan", "ಕನ್ನಡ ಹಾಡುಗಳು"],
    ml: ["mal", "മലയാളം പാട്ടുകൾ"],
    te: ["tel", "తెలుగు పాటలు"],
    pa: ["pan", "ਪੰਜਾਬੀ ਗੀਤ"],
  },
  id: {
    jv: ["jav", "tembang basa Jawa"],
    su: ["sun", "lagu basa Sunda"],
  },
} as const;

export type OtherVibeLanguage = keyof typeof OTHER_VIBE_LANGUAGES;
export const OTHER_VIBE_LANGUAGE_KEYS = Object.keys(OTHER_VIBE_LANGUAGES) as OtherVibeLanguage[];
type VibeRegion = keyof typeof VIBE_REGION_LANGUAGES;
export const VIBE_REGIONS = Object.keys(VIBE_REGION_LANGUAGES) as VibeRegion[];

export function isVibeRegion(value: string): value is VibeRegion {
  return Object.hasOwn(VIBE_REGION_LANGUAGES, value);
}

export function vibeRegionForLanguage(value: string): string {
  return VIBE_REGIONS.find(region => Object.hasOwn(VIBE_REGION_LANGUAGES[region], value)) ?? value;
}

export function isOtherVibeLanguage(value: string | null): value is OtherVibeLanguage {
  return value !== null && Object.hasOwn(OTHER_VIBE_LANGUAGES, value);
}

export const COUNTRY_GROUPS = ["europe", "asia", "americas", "africa", "oceania"] as const;
export type CountryGroup = (typeof COUNTRY_GROUPS)[number];
const GROUP_COUNTRIES: Record<CountryGroup, string> = {
  // Editorial order: prominence of each music market within its region.
  europe: "RU DE FR ES IT UA PL NL SE NO DK FI GR CZ RO HU RS HR BG BY SK LT LV EE SI AL BA MK AD",
  asia: "JP KR CN IN TR ID VN PH TH SA IL MY IR PK BD KZ IQ AZ UZ AM GE LK NP MM MN KH KG TJ LA TM AF",
  americas: "US BR PE BO HT",
  africa: "ZA NG TZ ET CD UG SN ZW ZM ML MW RW BW BF SO BI SL LS CF",
  oceania: "PG",
};
const countryGroups = new Map(COUNTRY_GROUPS.flatMap(group =>
  GROUP_COUNTRIES[group].split(" ").map(country => [country, group] as const)));

export function countryGroup(country: string): CountryGroup | undefined {
  return countryGroups.get(country);
}

export function countriesInGroup<T>(entries: readonly T[], group: CountryGroup, getCountry: (item: T) => string): T[] {
  const byCountry = new Map(entries.map(item => [getCountry(item), item] as const));
  return GROUP_COUNTRIES[group].split(" ").flatMap(country =>
    byCountry.has(country) ? [byCountry.get(country)!] : []);
}
