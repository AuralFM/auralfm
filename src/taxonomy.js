/**
 * The AuralFM taxonomy: what a station plays, where its sound is from, what
 * kind of station it is, and what it is good for.
 *
 *   genres   what it plays            Afrobeats, Jazz, K-pop …
 *   scenes   where the sound is from  African, Japanese, Thai … (by place first)
 *   formats  what kind of station     Talk, News, Community …
 *   moods    what it is good for      Focus, Party, After hours … (derived)
 *
 * A hand-made list (September 2026), the ten vibes already on the site, and seven
 * the stations' own tags asked for (Arabic, Balkan, Bollywood & Indian, Creole,
 * Crooners, Greek, Schlager). The
 * vibes stay as they are: a vibe is a hand-picked lane across the globe, and
 * later each one can be written as a set of these ids instead of raw tags.
 *
 * ── how a station is matched ────────────────────────────────────────────────
 * A category matches when ANY of its rules does. A rule's keys are ANDed:
 *
 *   { tags: [...] }                    the station carries one of these tags
 *   { countries: [...] }               the station is in one of these countries
 *   { genres: [...] }                  the station is already in one of these genres
 *   { genres: [...], countries: [...] } both — "hip hop, from Brazil"
 *
 * Tags are compared after norm(): lower case, accents off, hyphens and slashes
 * as spaces, so "Hip-Hop", "hip hop" and "hip/hop" are one. A term matches a
 * tag that is the term, or contains it as whole words: "christian" matches
 * "christian contemporary"; "metal" never matches "metallica". A term starting
 * with "=" matches only a tag that is exactly it: "=hits" is chart pop, and
 * must not take "classic hits", which is oldies.
 *
 * `names` (genres only) are words that count in a station's name when it has
 * no tags at all: a station called "Jazz FM" with nothing else to go on is a
 * jazz station. Only words that cannot mean anything else belong there — never
 * "love", "kiss", "hits", "mix".
 *
 * Moods are not a fact any directory records. They are our reading of genres
 * and tags, so every mood says why in `because`, and each is a proposal to
 * argue with, not a measurement.
 */

// ── places ──────────────────────────────────────────────────────────────────
// Spelled as the catalogue spells them (data/stations.json).
const AFRICA = ["Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", "Cameroon",
  "Cape Verde", "Central African Republic", "Chad", "Comoros", "Côte d'Ivoire",
  "Democratic Republic of the Congo", "Egypt", "Eritrea", "Eswatini", "Ethiopia", "Gabon", "Ghana",
  "Guinea", "Guiné-Bissau", "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi", "Mali",
  "Mauritania", "Mauritius", "Mayotte", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria",
  "Republic of the Congo", "Réunion", "Rwanda", "Saint Helena", "São Tomé and Príncipe", "Senegal",
  "Seychelles", "Sierra Leone", "Somalia", "South Africa", "Sudan", "Tanzania", "The Gambia", "Togo",
  "Tunisia", "Uganda", "Zambia", "Zimbabwe"];
const LATIN_AMERICA = ["Argentina", "Bolivia", "Chile", "Colombia", "Costa Rica", "Cuba",
  "Dominican Republic", "Ecuador", "El Salvador", "Guatemala", "Honduras", "Mexico", "Nicaragua",
  "Panama", "Paraguay", "Peru", "Puerto Rico", "Uruguay", "Venezuela"];
const SPANISH_SPEAKING = [...LATIN_AMERICA, "Spain"];
const CHINESE_SPEAKING = ["China", "Taiwan", "Hong Kong", "Macau", "Singapore"];

// ── genres ──────────────────────────────────────────────────────────────────
const GENRES = [
  { id: "acoustic", name: "Acoustic", any: [{ tags: ["acoustic", "unplugged", "singer songwriter"] }] },
  { id: "afrobeats", name: "Afrobeats", any: [{ tags: ["afrobeats", "afrobeat", "afropop", "afro pop", "afrofusion",
    "amapiano", "naija", "highlife", "afro house", "afrohouse", "gqom", "bongo flava", "azonto"] }] },
  { id: "alternative", name: "Alternative", any: [{ tags: ["alternative", "indie", "post punk", "new wave", "shoegaze", "grunge"] }] },
  { id: "americana", name: "Americana", any: [{ tags: ["americana", "bluegrass", "roots", "alt country", "folk rock"] }] },
  { id: "anime", name: "Anime", any: [{ tags: ["anime", "anison", "vocaloid"] }], names: ["anime"] },
  { id: "arabic", name: "Arabic", any: [{ tags: ["arabic", "arabic music", "arabic songs", "arabic hits", "=arab",
    "music arabe", "musique arabe", "tarab", "khaleeji", "mahraganat", "dabke"] }] },
  { id: "baile-funk", name: "Baile funk", any: [{ tags: ["baile funk", "funk carioca", "funk brasileiro", "funk ostentacao",
    "brazilian funk"] }, { tags: ["funk"], countries: ["Brazil"] }] },
  { id: "balkan", name: "Balkan", any: [{ tags: ["balkan", "manele", "narodna", "zabavna", "turbo folk", "chalga",
    "sevdah", "sevdalinka", "gypsy", "romani", "cigan", "narodna muzika"] }] },
  { id: "bollywood-indian", name: "Bollywood & Indian", any: [{ tags: ["bollywood", "hindi", "filmi", "tamil", "telugu",
    "malayalam", "kannada", "punjabi", "bhangra", "desi", "indian", "indian music", "carnatic", "hindustani", "ghazal"] },
    { genres: ["pop"], countries: ["India"] }] },
  { id: "blues", name: "Blues", any: [{ tags: ["blues"] }], names: ["blues"] },
  { id: "brazilian-hip-hop", name: "Brazilian hip hop", any: [{ tags: ["rap nacional", "hip hop brasileiro", "rap brasileiro",
    "brazilian hip hop"] }, { genres: ["hip-hop"], countries: ["Brazil"] }] },
  { id: "brazilian-pop", name: "Brazilian pop", any: [{ tags: ["mpb", "musica popular brasileira", "sertanejo", "sertaneja",
    "pagode", "axe", "forro", "brazilian music", "brazilian pop", "musica brasileira"] },
    { genres: ["pop"], countries: ["Brazil"] }] },
  { id: "christian", name: "Christian", any: [{ tags: ["christian", "gospel", "ccm", "worship", "praise", "catholic",
    "catolica", "evangelica", "evangelical", "cristiana", "cristiano", "gospel music"] }],
    names: ["gospel", "christian", "catolica", "evangelica", "cristiana"] },
  { id: "classical", name: "Classical", any: [{ tags: ["classical", "classical music", "opera", "baroque", "symphony",
    "orchestral", "chamber music", "klassik", "musica clasica", "musique classique", "early music"] }],
    names: ["classical", "classica", "klassik", "clasica", "classique"] },
  { id: "classic-rock", name: "Classic rock", any: [{ tags: ["classic rock", "rock classics", "classic rock hits"] }] },
  { id: "country", name: "Country", any: [{ tags: ["country", "country music", "new country", "classic country"] }] },
  { id: "c-pop", name: "C-pop", any: [{ tags: ["c pop", "cpop", "mandopop", "cantopop", "chinese pop"] },
    { genres: ["pop"], countries: CHINESE_SPEAKING }] },
  { id: "creole", name: "Creole", any: [{ tags: ["creole", "kreyol", "kompa", "konpa", "zouk", "sega", "seggae",
    "maloya", "musique creole"] }] },
  { id: "crooners", name: "Crooners", any: [{ tags: ["crooner", "crooners", "adult standards", "=standards",
    "old standards", "great american songbook"] }] },
  { id: "dance", name: "Dance", any: [{ tags: ["dance", "edm", "eurodance", "club", "dance pop", "disco"] }] },
  { id: "electronic", name: "Electronic", any: [{ tags: ["electronic", "electronica", "electro", "ambient", "idm",
    "downtempo", "trance", "drum and bass", "dnb", "dubstep", "breakbeat", "synthwave"] },
    { genres: ["house", "techno"] }] },
  { id: "family", name: "Kids & family", any: [{ tags: ["kids", "children", "childrens music", "children s music",
    "infantil", "enfants", "musiques des enfants", "kinder", "family"] }] },
  { id: "film-tv-stage", name: "Film, TV & stage", any: [{ tags: ["soundtrack", "soundtracks", "film", "film music",
    "film score", "movie", "movies", "movie soundtracks", "musical", "musicals", "broadway", "showtunes", "filmmusik"] }] },
  { id: "folk", name: "Folk", any: [{ tags: ["folk", "folk music", "traditional", "folklore", "folklorica"] }] },
  { id: "french-pop", name: "French pop", any: [{ tags: ["chanson", "chansons", "chanson francaise", "chansons francaises",
    "variete", "variete francaise", "french pop", "french music", "musique francaise", "francophone"] }] },
  { id: "funk-soul", name: "Funk & soul", any: [{ tags: ["soul", "funk", "motown", "northern soul", "neo soul"] }] },
  { id: "greek", name: "Greek", any: [{ tags: ["greek", "greek music", "greek pop", "greek folk", "laiko", "rebetiko",
    "entehno", "hellenic"] }, { genres: ["pop"], countries: ["Greece", "Cyprus"] }] },
  { id: "hard-rock", name: "Hard rock", any: [{ tags: ["hard rock", "glam rock", "arena rock"] }] },
  { id: "hip-hop", name: "Hip hop", any: [{ tags: ["hip hop", "hiphop", "rap", "trap", "drill", "grime", "boom bap"] }] },
  { id: "holiday", name: "Holiday", any: [{ tags: ["christmas", "xmas", "holiday", "navidad", "natal", "noel", "weihnachten"] }],
    names: ["christmas", "xmas", "navidad", "weihnacht"] },
  { id: "house", name: "House", any: [{ tags: ["house", "deep house", "tech house", "progressive house", "soulful house"] }] },
  { id: "islamic", name: "Islamic", any: [{ tags: ["islamic", "islam", "quran", "koran", "nasheed", "islamic music",
    "quran radio"] }], names: ["quran", "coran", "koran"] },
  { id: "j-pop", name: "J-pop", any: [{ tags: ["j pop", "jpop"] }, { genres: ["pop"], countries: ["Japan"] }] },
  { id: "j-rock", name: "J-rock", any: [{ tags: ["j rock", "jrock", "visual kei"] }, { genres: ["rock"], countries: ["Japan"] }] },
  { id: "jazz", name: "Jazz", any: [{ tags: ["jazz", "smooth jazz", "vocal jazz", "classic jazz", "bebop", "swing",
    "big band", "nu jazz"] }], names: ["jazz"] },
  { id: "k-pop", name: "K-pop", any: [{ tags: ["k pop", "kpop", "korean pop"] }, { genres: ["pop"], countries: ["South Korea"] }] },
  { id: "latin", name: "Latin", any: [{ tags: ["latin", "latino", "latina", "latin music", "musica latina", "salsa",
    "bachata", "merengue", "cumbia", "vallenato", "tropical", "bolero", "son cubano", "tango", "ranchera",
    "regional mexican", "regional mexicana", "banda", "norteno", "grupera"] }] },
  { id: "live", name: "Live music", any: [{ tags: ["live music", "live concert", "concerts", "live sessions",
    "programas en vivo"] }] },
  { id: "metal", name: "Metal", any: [{ tags: ["metal", "heavy metal", "death metal", "black metal", "thrash metal",
    "metalcore", "doom metal", "power metal", "nu metal"] }], names: ["metal"] },
  { id: "pop", name: "Pop", any: [{ tags: ["pop", "pop music", "top 40", "top40", "chr", "contemporary hits",
    "contemporary hits radio", "top hits", "=hits", "=adult hits", "musica pop", "поп музыка"] }] },
  { id: "pop-latino", name: "Pop latino", any: [{ tags: ["pop latino", "latin pop", "pop en espanol",
    "baladas en espanol"] }, { genres: ["pop"], countries: LATIN_AMERICA }] },
  { id: "pride", name: "Pride", any: [{ tags: ["lgbt", "lgbtq", "lgbtqia", "lgbtiqa", "gay", "queer", "pride"] }] },
  { id: "punk", name: "Punk", any: [{ tags: ["punk", "punk rock", "hardcore punk", "pop punk", "ska punk", "post punk"] }] },
  { id: "r-and-b", name: "R&B", any: [{ tags: ["rnb", "r&b", "r b", "r n b", "urban contemporary", "slow jams",
    "contemporary r b"] }] },
  { id: "reggae", name: "Reggae & dub", any: [{ tags: ["reggae", "dub", "dancehall", "roots reggae", "ska", "rocksteady"] }],
    names: ["reggae"] },
  { id: "rock", name: "Rock", any: [{ tags: ["rock", "rock music", "pop rock", "indie rock", "alternative rock", "rock n roll"] },
    { genres: ["classic-rock", "hard-rock", "metal", "punk"] }] },
  { id: "samba", name: "Samba", any: [{ tags: ["samba", "pagode", "samba enredo", "bossa nova", "samba pagode"] }] },
  { id: "schlager", name: "Schlager", any: [{ tags: ["schlager", "volksmusik", "discofox", "popschlager",
    "partyschlager", "volkstumlicher schlager", "deutsche schlager", "schlagerhits"] }] },
  { id: "spanish-rock", name: "Rock en español", any: [{ tags: ["rock en espanol", "rock nacional", "rock latino",
    "spanish rock", "rock argentino", "rock mexicano"] }, { genres: ["rock"], countries: SPANISH_SPEAKING }] },
  { id: "t-pop", name: "T-pop", any: [{ tags: ["t pop", "tpop", "thai pop"] }, { genres: ["pop"], countries: ["Thailand"] }] },
  { id: "techno", name: "Techno", any: [{ tags: ["techno", "minimal techno", "hard techno"] }] },
  { id: "urbano-latino", name: "Urbano latino", any: [{ tags: ["reggaeton", "urbano", "latino urbano", "pop urbano",
    "trap latino", "dembow", "perreo"] }] },
  { id: "world", name: "Worldwide", any: [{ tags: ["world", "world music", "worldmusic", "international", "ethnic",
    "global"] }] },
];

// ── scenes: where the sound is from ─────────────────────────────────────────
// Place first, because the directories barely tag these: across all 65,943
// radio-browser stations there is no "thai" or "vietnamese" tag worth the name.
// Talk and news stations are left out, so a scene is the music of a place.
const SCENES = [
  { id: "african", name: "African", any: [{ countries: AFRICA }, { tags: ["african", "africa", "afro", "african music"] },
    { genres: ["afrobeats"] }] },
  { id: "brazilian", name: "Brazilian", any: [{ countries: ["Brazil"] }, { genres: ["brazilian-pop", "samba", "baile-funk"] }] },
  { id: "canadian", name: "Canadian", any: [{ countries: ["Canada"] }, { tags: ["canada", "canadian", "quebec", "quebecois"] }] },
  { id: "japanese", name: "Japanese", any: [{ countries: ["Japan"] }, { tags: ["japanese", "japan", "enka"] },
    { genres: ["j-pop", "j-rock", "anime"] }] },
  { id: "thai", name: "Thai", any: [{ countries: ["Thailand"] }, { tags: ["thai", "luk thung", "mor lam", "molam"] }] },
  { id: "vietnamese", name: "Vietnamese", any: [{ countries: ["Vietnam"] }, { tags: ["vietnamese", "v pop", "vpop", "nhac viet"] }] },
];
const SCENE_SKIPS_FORMATS = ["news", "talk", "sports"];

// ── formats: what kind of station it is ─────────────────────────────────────
const FORMATS = [
  { id: "news", name: "News", any: [{ tags: ["news", "local news", "noticias", "news talk", "news and talk", "world news",
    "information", "informacion", "nachrichten", "actualites"] }] },
  { id: "talk", name: "Talk", any: [{ tags: ["talk", "talk radio", "radio hablada", "talk show radio", "talk speech",
    "local talk", "spoken word", "podcast"] }] },
  { id: "sports", name: "Sports", any: [{ tags: ["sports", "sport", "deportes", "esportes", "football", "soccer",
    "futbol", "cricket", "baseball"] }] },
  { id: "community", name: "Community", any: [{ tags: ["community radio", "community", "radio comunitaria",
    "radio comunitaria", "associative", "radio associative", "freeform"] }] },
  { id: "college", name: "College & university", any: [{ tags: ["college", "college radio", "university radio",
    "student radio", "campus radio", "radio universitaria"] }] },
  { id: "public", name: "Public radio", any: [{ tags: ["public radio", "public", "npr", "public broadcaster"] }] },
  { id: "old-time-radio", name: "Old-time radio", any: [{ tags: ["old time radio", "otr", "radio drama", "drama",
    "detective"] }] },
  { id: "faith", name: "Faith", any: [{ genres: ["christian", "islamic"] }, { tags: ["religion", "religious"] }] },
  { id: "variety", name: "Variety", any: [{ tags: ["variety", "eclectic", "eclectica", "various", "various music", "misc",
    "mix", "musica variada", "full service", "all genres", "freeform"] }] },
];

/**
 * A station tagged with more than this many tags is tagged with everything:
 * RPR1 lists yoga, techno and Christmas among 100+. Such a list says "variety",
 * not what the station plays, so it counts as Variety and nothing else until
 * the station's own stream or website says more.
 */
const TAG_SOUP = 16;

// ── moods and moments ───────────────────────────────────────────────────────
// Derived, never recorded anywhere. `when` marks the ones that depend on the
// hour where the station is; the app can lift those stations when it is that
// time there, and the rule alone decides membership.
const MOODS = [
  { id: "after-hours", name: "After hours", because: "late-night club and lounge sounds",
    any: [{ genres: ["house"] }, { tags: ["lounge", "chillout", "downtempo", "trip hop", "nu jazz", "late night"] }], when: [0, 5] },
  { id: "chill", name: "Chill", because: "slow, soft and spacious",
    any: [{ tags: ["chill", "chillout", "lounge", "lofi", "lo fi", "downtempo", "ambient", "smooth jazz", "easy listening",
      "chillhop"] }, { genres: ["acoustic"] }] },
  { id: "commuting", name: "Commuting", because: "news, talk and traffic for the drive",
    any: [{ formats: ["news", "talk"] }, { tags: ["traffic", "drive time"] }] },
  { id: "evening", name: "Evening", because: "jazz, soul and the quieter end of the dial",
    any: [{ genres: ["jazz", "funk-soul", "r-and-b", "classical", "crooners"] }], when: [18, 23] },
  { id: "feel-good", name: "Feel good", because: "sing-along hits and the golden oldies",
    any: [{ genres: ["funk-soul"] }, { tags: ["oldies", "classic hits", "disco", "70s", "80s", "80's", "90s", "90's",
      "flashback", "decades", "nostalgie", "feel good", "happy", "good vibes", "retro"] }] },
  { id: "feeling-blue", name: "Feeling blue", because: "the blues, ballads and heartbreak",
    any: [{ genres: ["blues"] }, { tags: ["ballads", "baladas", "sad", "melancholic", "bolero", "fado"] }] },
  { id: "fitness", name: "Fitness", because: "high tempo: dance, EDM, hip hop",
    any: [{ genres: ["dance", "hip-hop", "techno"] }, { tags: ["workout", "fitness", "gym", "training", "hardstyle",
      "drum and bass"] }] },
  { id: "focus", name: "Focus", because: "few or no words",
    any: [{ genres: ["classical"] }, { tags: ["lofi", "lo fi", "lofi hip hop", "study", "focus", "instrumental",
      "ambient", "piano", "music for study"] }] },
  { id: "gaming", name: "Gaming", because: "game soundtracks, chiptune, synthwave",
    any: [{ tags: ["video game music", "videogame music", "vgm", "chiptune", "chiptunes", "gaming", "game music",
      "video games", "synthwave", "retro games"] }] },
  { id: "love", name: "Love", because: "love songs, slow jams and romance",
    any: [{ tags: ["love songs", "romantic", "romantica", "musica romantica", "slow jams", "baladas romanticas",
      "kizomba", "zouk", "bolero"] }] },
  { id: "motivation", name: "Motivation", because: "anthems and uplift",
    any: [{ tags: ["motivational", "motivation", "inspirational", "inspiration", "anthems"] }] },
  { id: "outdoors", name: "Outdoors", because: "roots music and open air",
    any: [{ genres: ["americana", "folk"] }, { tags: ["nature", "nature sounds", "outdoors"] }] },
  { id: "party", name: "Party", because: "dance floors from Lagos to Rio",
    any: [{ genres: ["dance", "urbano-latino", "baile-funk", "afrobeats", "house", "balkan", "schlager"] }, { tags: ["party", "club",
      "dancehall", "soca"] }] },
  { id: "sports", name: "Sports", because: "commentary and phone-ins",
    any: [{ formats: ["sports"] }] },
  { id: "summertime", name: "Summertime", because: "beach, tropical and island sounds",
    any: [{ genres: ["reggae", "samba", "creole"] }, { tags: ["summer", "beach", "tropical", "cumbia", "soca", "calypso", "zouk",
      "kizomba"] }] },
  { id: "weekend", name: "Weekend", because: "party and feel-good together",
    any: [{ moods: ["party", "feel-good"] }] },
  { id: "well-being", name: "Well-being", because: "meditation, relaxation and sleep",
    any: [{ tags: ["meditation", "relax", "relaxing", "relaxation", "relaxation music", "ambient and relaxation music",
      "sleep", "spa", "healing", "new age", "yoga", "wellness"] }] },
  { id: "work", name: "Work", because: "unobtrusive: easy listening, soft rock, smooth jazz",
    any: [{ tags: ["easy listening", "adult contemporary", "soft rock", "smooth jazz", "instrumental", "lounge",
      "office"] }] },
];

// ── matching ────────────────────────────────────────────────────────────────
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim();

/** Does a normalised tag contain the normalised term as whole words? */
function tagHas(tag, term) {
  if (tag === term) return true;
  if (term[0] === "=") return tag === term.slice(1);
  const i = tag.indexOf(term);
  if (i < 0) return false;
  const before = i === 0 || tag[i - 1] === " ";
  const after = i + term.length === tag.length || tag[i + term.length] === " ";
  return before && after;
}

/** Rule terms, normalised once: the catalogue asks tens of thousands of times. */
const normed = new WeakMap();
const termsOf = (rule) => normed.get(rule)
  || (normed.set(rule, rule.tags.map((t) => (t[0] === "=" ? "=" + norm(t.slice(1)) : norm(t)))), normed.get(rule));

function ruleMatches(rule, st) {
  if (rule.tags && !termsOf(rule).some((t) => st.tags.some((g) => tagHas(g, t)))) return false;
  if (rule.countries && !rule.countries.includes(st.country)) return false;
  if (rule.genres && rule.genres.length && !rule.genres.some((g) => st.genres.has(g))) return false;
  if (rule.formats && !rule.formats.some((f) => st.formats.has(f))) return false;
  if (rule.moods && !rule.moods.some((m) => st.moods.has(m))) return false;
  return true;
}

/** Categories reference each other, so apply them until nothing new matches. */
function settle(list, st, into) {
  for (let changed = true; changed;) {
    changed = false;
    for (const c of list) if (!into.has(c.id) && c.any.some((r) => ruleMatches(r, st))) { into.add(c.id); changed = true; }
  }
}

const words = (s) => ` ${norm(s).replace(/[^a-z0-9 ]+/g, " ")} `;

/**
 * Classify one station: { tags: string[], title, country } →
 * { genres, scenes, formats, moods, from } where `from` is "tags" when the
 * station's own tags decided its genres, "name" when only its name did.
 */
function classify({ tags = [], title = "", country = "" }) {
  let st = { tags: tags.map(norm).filter(Boolean), country, genres: new Set(), formats: new Set(), moods: new Set() };
  let from = "tags";
  if (st.tags.length > TAG_SOUP) { st.tags = []; st.formats.add("variety"); }
  settle(GENRES, st, st.genres);
  if (!st.tags.length) {
    const w = words(title);
    for (const g of GENRES) if (g.names && g.names.some((n) => w.includes(` ${norm(n)} `))) st.genres.add(g.id);
    if (st.genres.size) { from = "name"; settle(GENRES, st, st.genres); }
  }
  settle(FORMATS, st, st.formats);
  const scenes = new Set();
  if (!SCENE_SKIPS_FORMATS.some((f) => st.formats.has(f))) settle(SCENES, st, scenes);
  settle(MOODS, st, st.moods);
  return { genres: [...st.genres], scenes: [...scenes], formats: [...st.formats], moods: [...st.moods], from };
}

module.exports = { GENRES, SCENES, FORMATS, MOODS, TAG_SOUP, classify, norm };
