/**
 * A country's headlines, from its own newsrooms.
 *
 * They were Google News' country editions. On the web that request leaves from
 * the site's relay, and Google refuses the relay: on 9 Oct 2026 every country
 * tried came back as its 503 "Sorry…" page (Indonesia six times out of six),
 * so "This place" and "Now playing" showed "Could not reach the headlines" on
 * the web and the iPhone almost every time. World had the same trouble in
 * September and the same answer (WORLD_FEEDS in src/news.js).
 *
 * So each country has up to three newsrooms of its own, each on its own feed:
 * one failing leaves the others, and nobody stands between the listener and
 * the paper but the paper. Where there was a choice, a public broadcaster or
 * an agency comes first, then independents, then the large dailies.
 *
 * Every feed here answered on 9 Oct 2026 with stories under three days old,
 * over https, in RSS that src/news.js reads. A feed that goes quiet is not an
 * error anywhere: the others carry the country, and with none left the
 * desktop asks Google's edition as it used to.
 *
 * `route` is the web version's relay path (/api/feeds/<route>);
 * scripts/build-web.mjs writes one per feed from this list. Country names are
 * the catalogue's own.
 *
 * `relay: false` marks a newsroom that answers the desktop and refuses the
 * web's relay (a 403 or a 520, found by asking each one through it on 9 Oct 2026). The
 * desktop still uses it. The web skips it and takes the next on the list,
 * which is why some countries list more than three.
 *
 * "Open" here means anyone can read the headline, not that the outlet is
 * neutral. Several are state-funded and it shows; where a country's press is
 * not free, an outlet from outside it sits beside the ones from inside.
 */
module.exports = {
  "United States": [
    { name: "NPR", route: "us-npr", url: "https://feeds.npr.org/1001/rss.xml" },
    { name: "PBS NewsHour", route: "us-pbs", url: "https://www.pbs.org/newshour/feeds/rss/headlines" },
    { name: "CBS News", route: "us-cbsnews", url: "https://www.cbsnews.com/latest/rss/main" },
  ],
  "Brazil": [
    { name: "Agência Brasil", route: "br-agenciabrasil", url: "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml" },
    { name: "G1", route: "br-g1", url: "https://g1.globo.com/rss/g1/" },
    { name: "Folha", route: "br-folha", url: "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml" },
  ],
  "France": [
    { name: "franceinfo", route: "fr-francetvinfo", url: "https://www.francetvinfo.fr/titres.rss", relay: false },
    { name: "RFI", route: "fr-rfi", url: "https://www.rfi.fr/fr/rss" },
    { name: "France 24", route: "fr-france24", url: "https://www.france24.com/fr/rss" },
    { name: "Le Monde", route: "fr-lemonde", url: "https://www.lemonde.fr/rss/une.xml" },
  ],
  "Spain": [
    { name: "elDiario.es", route: "es-eldiario", url: "https://www.eldiario.es/rss/" },
    { name: "20minutos", route: "es-20minutos", url: "https://www.20minutos.es/rss/" },
    { name: "El País", route: "es-elpais", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada" },
  ],
  "Germany": [
    { name: "tagesschau", route: "de-tagesschau", url: "https://www.tagesschau.de/index~rss2.xml" },
    { name: "DW", route: "de-dw", url: "https://rss.dw.com/rdf/rss-de-all" },
    { name: "ZDF", route: "de-zdf", url: "https://www.zdf.de/rss/zdf/nachrichten" },
  ],
  "Argentina": [
    { name: "Clarín", route: "ar-clarin", url: "https://www.clarin.com/rss/lo-ultimo/" },
    { name: "La Nación", route: "ar-lanacion", url: "https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml" },
  ],
  "United Kingdom": [
    { name: "BBC", route: "gb-bbci", url: "https://feeds.bbci.co.uk/news/uk/rss.xml" },
    { name: "The Guardian", route: "gb-theguardian", url: "https://www.theguardian.com/uk-news/rss" },
    { name: "Sky News", route: "gb-skynews", url: "https://feeds.skynews.com/feeds/rss/uk.xml" },
  ],
  "Italy": [
    { name: "ANSA", route: "it-ansa", url: "https://www.ansa.it/sito/ansait_rss.xml" },
    { name: "Rai News", route: "it-rainews", url: "https://www.rainews.it/rss/tutti" },
    { name: "la Repubblica", route: "it-repubblica", url: "https://www.repubblica.it/rss/homepage/rss2.0.xml" },
  ],
  "Mexico": [
    { name: "La Jornada", route: "mx-jornada", url: "https://www.jornada.com.mx/rss/edicion.xml" },
    { name: "El Universal", route: "mx-eluniversal", url: "https://www.eluniversal.com.mx/arc/outboundfeeds/rss/?outputType=xml" },
  ],
  "Colombia": [
    { name: "El Tiempo", route: "co-eltiempo", url: "https://www.eltiempo.com/rss/colombia.xml" },
    { name: "La Silla Vacía", route: "co-lasillavacia", url: "https://www.lasillavacia.com/feed/" },
    { name: "Semana", route: "co-semana", url: "https://www.semana.com/arc/outboundfeeds/rss/?outputType=xml" },
  ],
  "Indonesia": [
    { name: "Antara", route: "id-antaranews", url: "https://www.antaranews.com/rss/terkini.xml" },
    { name: "CNN Indonesia", route: "id-cnnindonesia", url: "https://www.cnnindonesia.com/nasional/rss" },
    { name: "Republika", route: "id-republika", url: "https://www.republika.co.id/rss" },
  ],
  "Canada": [
    { name: "CBC", route: "ca-cbc", url: "https://rss.cbc.ca/lineup/topstories.xml", relay: false },
    { name: "Global News", route: "ca-globalnews", url: "https://globalnews.ca/feed/" },
    { name: "Radio-Canada", route: "ca-radiocanada", url: "https://ici.radio-canada.ca/rss/4159" },
    { name: "The Tyee", route: "ca-thetyee", url: "https://thetyee.ca/rss2.xml" },
  ],
  "Chile": [
    { name: "Cooperativa", route: "cl-cooperativa", url: "https://www.cooperativa.cl/noticias/site/tax/port/all/rss____1.xml" },
    { name: "La Tercera", route: "cl-latercera", url: "https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml" },
    { name: "CIPER", route: "cl-ciperchile", url: "https://www.ciperchile.cl/feed/" },
  ],
  "Netherlands": [
    { name: "NOS", route: "nl-nos", url: "https://feeds.nos.nl/nosnieuwsalgemeen" },
    { name: "NU.nl", route: "nl-nu", url: "https://www.nu.nl/rss/Algemeen" },
  ],
  "Russia": [
    { name: "Meduza", route: "ru-meduza", url: "https://meduza.io/rss/all" },
    { name: "BBC Russian", route: "ru-bbci", url: "https://feeds.bbci.co.uk/russian/rss.xml" },
    { name: "Kommersant", route: "ru-kommersant", url: "https://www.kommersant.ru/RSS/news.xml" },
  ],
  "Greece": [
    { name: "ERT", route: "gr-ertnews", url: "https://www.ertnews.gr/feed/" },
    { name: "Kathimerini", route: "gr-kathimerini", url: "https://www.kathimerini.gr/infeeds/rss/nx-rss-feed.xml" },
    { name: "in.gr", route: "gr-in", url: "https://www.in.gr/feed/" },
  ],
  "Australia": [
    { name: "ABC", route: "au-abc", url: "https://www.abc.net.au/news/feed/51120/rss.xml" },
    { name: "The Guardian", route: "au-theguardian", url: "https://www.theguardian.com/australia-news/rss" },
  ],
  "Türkiye": [
    { name: "BBC Türkçe", route: "tr-bbci", url: "https://feeds.bbci.co.uk/turkce/rss.xml" },
    { name: "Cumhuriyet", route: "tr-cumhuriyet", url: "https://www.cumhuriyet.com.tr/rss/son_dakika.xml" },
    { name: "TRT Haber", route: "tr-trthaber", url: "https://www.trthaber.com/sondakika.rss" },
  ],
  "Nigeria": [
    { name: "Premium Times", route: "ng-premiumtimesng", url: "https://www.premiumtimesng.com/feed" },
    { name: "Punch", route: "ng-punchng", url: "https://punchng.com/feed/" },
    { name: "Vanguard", route: "ng-vanguardngr", url: "https://www.vanguardngr.com/feed/" },
  ],
  "Romania": [
    { name: "Digi24", route: "ro-digi24", url: "https://www.digi24.ro/rss" },
    { name: "HotNews", route: "ro-hotnews", url: "https://hotnews.ro/feed" },
    { name: "G4Media", route: "ro-g4media", url: "https://www.g4media.ro/feed" },
  ],
  "Poland": [
    { name: "TVN24", route: "pl-tvn24", url: "https://tvn24.pl/najnowsze.xml" },
    { name: "RMF24", route: "pl-rmf24", url: "https://www.rmf24.pl/feed" },
    { name: "Onet", route: "pl-onet", url: "https://wiadomosci.onet.pl/.feed" },
  ],
  "China": [
    { name: "BBC 中文", route: "cn-bbci", url: "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml" },
    { name: "中新网", route: "cn-chinanews", url: "https://www.chinanews.com.cn/rss/scroll-news.xml" },
    { name: "DW 中文", route: "cn-dw", url: "https://rss.dw.com/rdf/rss-chi-all" },
  ],
  "Belgium": [
    { name: "VRT NWS", route: "be-vrt", url: "https://www.vrt.be/vrtnws/nl.rss.articles.xml" },
    { name: "RTBF", route: "be-rtbf", url: "https://rss.rtbf.be/article/rss/highlight_rtbf_info.xml" },
    { name: "Le Soir", route: "be-lesoir", url: "https://www.lesoir.be/rss2/2/cible_principale", relay: false },
    { name: "La Libre", route: "be-lalibre", url: "https://www.lalibre.be/arc/outboundfeeds/rss/?outputType=xml" },
  ],
  "Peru": [
    { name: "RPP", route: "pe-rpp", url: "https://rpp.pe/rss" },
    { name: "Andina", route: "pe-andina", url: "https://andina.pe/agencia/rss/" },
    { name: "El Comercio", route: "pe-elcomercio", url: "https://elcomercio.pe/arc/outboundfeeds/rss/?outputType=xml" },
  ],
  "India": [
    { name: "The Hindu", route: "in-thehindu", url: "https://www.thehindu.com/news/national/feeder/default.rss" },
    { name: "The Indian Express", route: "in-indianexpress", url: "https://indianexpress.com/section/india/feed/" },
    { name: "NDTV", route: "in-feedburner", url: "https://feeds.feedburner.com/ndtvnews-top-stories" },
  ],
  "Portugal": [
    { name: "RTP", route: "pt-rtp", url: "https://www.rtp.pt/noticias/rss" },
    { name: "Público", route: "pt-feedburner", url: "https://feeds.feedburner.com/PublicoRSS" },
    { name: "Observador", route: "pt-observador", url: "https://observador.pt/feed/" },
  ],
  "Venezuela": [
    { name: "Tal Cual", route: "ve-talcualdigital", url: "https://talcualdigital.com/feed/" },
    { name: "El Pitazo", route: "ve-elpitazo", url: "https://elpitazo.net/feed/", relay: false },
    { name: "El Nacional", route: "ve-elnacional", url: "https://www.elnacional.com/feed/" },
    { name: "Runrunes", route: "ve-runrun", url: "https://runrun.es/feed/" },
  ],
  "South Africa": [
    { name: "Daily Maverick", route: "za-dailymaverick", url: "https://www.dailymaverick.co.za/dmrss/" },
    { name: "GroundUp", route: "za-groundup", url: "https://groundup.org.za/sitenews/rss/" },
    { name: "SABC News", route: "za-sabcnews", url: "https://www.sabcnews.com/sabcnews/feed/" },
  ],
  "Ecuador": [
    { name: "El Universo", route: "ec-eluniverso", url: "https://www.eluniverso.com/arc/outboundfeeds/rss/?outputType=xml" },
    { name: "El Comercio", route: "ec-elcomercio", url: "https://www.elcomercio.com/feed/" },
  ],
  "Switzerland": [
    { name: "SRF", route: "ch-srf", url: "https://www.srf.ch/news/bnf/rss/1646" },
    { name: "RTS", route: "ch-rts", url: "https://www.rts.ch/info/?format=rss/news" },
    { name: "NZZ", route: "ch-nzz", url: "https://www.nzz.ch/recent.rss" },
  ],
  "Serbia": [
    { name: "N1", route: "rs-n1info", url: "https://n1info.rs/feed/" },
    { name: "Danas", route: "rs-danas", url: "https://www.danas.rs/feed/" },
    { name: "B92", route: "rs-b92", url: "https://www.b92.net/info/rss/vesti.xml", relay: false },
    { name: "BIRN", route: "rs-balkaninsight", url: "https://balkaninsight.com/feed/" },
  ],
  "Uruguay": [
    { name: "la diaria", route: "uy-ladiaria", url: "https://ladiaria.com.uy/feeds/articulos/" },
    { name: "Montevideo Portal", route: "uy-montevideo", url: "https://www.montevideo.com.uy/anxml.aspx?59" },
    { name: "Brecha", route: "uy-brecha", url: "https://brecha.com.uy/feed/" },
  ],
  "Philippines": [
    { name: "Rappler", route: "ph-rappler", url: "https://www.rappler.com/feed/", relay: false },
    { name: "Inquirer", route: "ph-inquirer", url: "https://newsinfo.inquirer.net/feed", relay: false },
    { name: "GMA News", route: "ph-gmanetwork", url: "https://data.gmanetwork.com/gno/rss/news/feed.xml" },
    { name: "Philstar", route: "ph-philstar", url: "https://www.philstar.com/rss/headlines" },
    { name: "BusinessWorld", route: "ph-bworldonline", url: "https://www.bworldonline.com/feed/" },
  ],
  "Austria": [
    { name: "ORF", route: "at-orf", url: "https://rss.orf.at/news.xml" },
    { name: "Der Standard", route: "at-derstandard", url: "https://www.derstandard.at/rss" },
  ],
  "Dominican Republic": [
    { name: "Diario Libre", route: "do-diariolibre", url: "https://www.diariolibre.com/rss/portada.xml" },
    { name: "El Día", route: "do-eldia", url: "https://eldia.com.do/feed/" },
  ],
  "Hungary": [
    { name: "444", route: "hu-444", url: "https://444.hu/feed" },
    { name: "24.hu", route: "hu-24", url: "https://24.hu/feed/" },
    { name: "Index", route: "hu-index", url: "https://index.hu/24ora/rss/" },
  ],
  "Croatia": [
    { name: "Index.hr", route: "hr-index", url: "https://www.index.hr/rss/vijesti" },
    { name: "N1", route: "hr-n1info", url: "https://n1info.hr/feed/" },
    { name: "24sata", route: "hr-24sata", url: "https://www.24sata.hr/feeds/aktualno.xml" },
  ],
  "Guatemala": [
    { name: "Prensa Libre", route: "gt-prensalibre", url: "https://www.prensalibre.com/feed/" },
    { name: "La Hora", route: "gt-lahora", url: "https://lahora.gt/feed/" },
  ],
  "Ukraine": [
    { name: "Ukrainska Pravda", route: "ua-pravda", url: "https://www.pravda.com.ua/rss/" },
    { name: "Ukrinform", route: "ua-ukrinform", url: "https://www.ukrinform.ua/rss/block-lastnews" },
  ],
  "Thailand": [
    { name: "Prachatai", route: "th-prachatai", url: "https://prachatai.com/rss.xml" },
    { name: "Matichon", route: "th-matichon", url: "https://www.matichon.co.th/feed" },
    { name: "Khaosod", route: "th-khaosod", url: "https://www.khaosod.co.th/feed" },
  ],
  "Ireland": [
    { name: "RTÉ", route: "ie-rte", url: "https://www.rte.ie/feeds/rss/?index=/news/" },
    { name: "TheJournal.ie", route: "ie-thejournal", url: "https://www.thejournal.ie/feed/" },
    { name: "The Irish Times", route: "ie-irishtimes", url: "https://www.irishtimes.com/arc/outboundfeeds/feed-irish-news/?from=0&size=20" },
  ],
  "Norway": [
    { name: "NRK", route: "no-nrk", url: "https://www.nrk.no/toppsaker.rss" },
    { name: "VG", route: "no-vg", url: "https://www.vg.no/rss/feed/" },
    { name: "Aftenposten", route: "no-aftenposten", url: "https://www.aftenposten.no/rss" },
  ],
  "Sweden": [
    { name: "SVT", route: "se-svt", url: "https://www.svt.se/nyheter/rss.xml" },
    { name: "Aftonbladet", route: "se-aftonbladet", url: "https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/" },
    { name: "Sveriges Radio", route: "se-sr", url: "https://api.sr.se/api/rss/program/83" },
  ],
  "Czechia": [
    { name: "ČT24", route: "cz-ceskatelevize", url: "https://ct24.ceskatelevize.cz/rss/hlavni-zpravy" },
    { name: "iROZHLAS", route: "cz-irozhlas", url: "https://www.irozhlas.cz/rss/irozhlas" },
    { name: "Seznam Zprávy", route: "cz-seznamzpravy", url: "https://www.seznamzpravy.cz/rss" },
  ],
  "Paraguay": [
    { name: "ABC Color", route: "py-abc", url: "https://www.abc.com.py/arc/outboundfeeds/rss/?outputType=xml" },
    { name: "ADN Digital", route: "py-adndigital", url: "https://www.adndigital.com.py/feed/" },
  ],
  "Kenya": [
    { name: "Nation", route: "ke-nation", url: "https://nation.africa/kenya/rss.xml" },
    { name: "Capital FM", route: "ke-capitalfm", url: "https://www.capitalfm.co.ke/news/feed/" },
    { name: "The Standard", route: "ke-standardmedia", url: "https://www.standardmedia.co.ke/rss/headlines.php" },
  ],
  "Ghana": [
    { name: "MyJoyOnline", route: "gh-myjoyonline", url: "https://www.myjoyonline.com/feed/" },
    { name: "GBC", route: "gh-gbcghanaonline", url: "https://www.gbcghanaonline.com/feed/" },
    { name: "Graphic", route: "gh-graphic", url: "https://www.graphic.com.gh/news.feed?type=rss" },
  ],
  "Uganda": [
    { name: "The Independent", route: "ug-independent", url: "https://www.independent.co.ug/feed/" },
    { name: "Nile Post", route: "ug-nilepost", url: "https://nilepost.co.ug/feed" },
    { name: "The Observer", route: "ug-observer", url: "https://observer.ug/feed" },
  ],
  "New Zealand": [
    { name: "RNZ", route: "nz-rnz", url: "https://www.rnz.co.nz/rss/national.xml" },
    { name: "NZ Herald", route: "nz-nzherald", url: "https://www.nzherald.co.nz/arc/outboundfeeds/rss/curated/78/?outputType=xml" },
    { name: "Stuff", route: "nz-stuff", url: "https://www.stuff.co.nz/rss" },
  ],
  "Japan": [
    { name: "朝日新聞", route: "jp-asahi", url: "https://www.asahi.com/rss/asahi/newsheadlines.rdf" },
    { name: "毎日新聞", route: "jp-mainichi", url: "https://mainichi.jp/rss/etc/mainichi-flash.rss" },
  ],
  "South Korea": [
    { name: "연합뉴스", route: "kr-yna", url: "https://www.yna.co.kr/rss/news.xml" },
    { name: "경향신문", route: "kr-khan", url: "https://www.khan.co.kr/rss/rssdata/total_news.xml" },
  ],
  "Israel": [
    { name: "Ynet", route: "il-ynet", url: "https://www.ynet.co.il/Integration/StoryRss2.xml" },
    { name: "+972 Magazine", route: "il-972mag", url: "https://www.972mag.com/feed/" },
  ],
  "Egypt": [
    { name: "BBC عربي", route: "eg-bbci", url: "https://feeds.bbci.co.uk/arabic/rss.xml" },
    { name: "المصري اليوم", route: "eg-almasryalyoum", url: "https://www.almasryalyoum.com/rss/rssfeed" },
  ],
  "Morocco": [
    { name: "Hespress", route: "ma-hespress", url: "https://www.hespress.com/feed", relay: false },
    { name: "Yabiladi", route: "ma-yabiladi", url: "https://www.yabiladi.com/rss/news.xml" },
    { name: "TelQuel", route: "ma-telquel", url: "https://telquel.ma/feed" },
    { name: "Le360", route: "ma-le360", url: "https://fr.le360.ma/arc/outboundfeeds/rss/?outputType=xml" },
  ],
  "Denmark": [
    { name: "DR", route: "dk-dr", url: "https://www.dr.dk/nyheder/service/feeds/senestenyt" },
    { name: "Politiken", route: "dk-politiken", url: "https://politiken.dk/rss/senestenyt.rss" },
  ],
  "Finland": [
    { name: "Yle", route: "fi-yle", url: "https://feeds.yle.fi/uutiset/v1/majorHeadlines/YLE_UUTISET.rss" },
    { name: "Helsingin Sanomat", route: "fi-hs", url: "https://www.hs.fi/rss/tuoreimmat.xml" },
    { name: "Iltalehti", route: "fi-iltalehti", url: "https://www.iltalehti.fi/rss/uutiset.xml" },
  ],
  "Bulgaria": [
    { name: "Дневник", route: "bg-dnevnik", url: "https://www.dnevnik.bg/rss/" },
    { name: "Mediapool", route: "bg-mediapool", url: "https://www.mediapool.bg/rss" },
    { name: "OFFNews", route: "bg-offnews", url: "https://offnews.bg/rss/all" },
  ],
  "Slovakia": [
    { name: "Denník N", route: "sk-dennikn", url: "https://dennikn.sk/feed/" },
    { name: "SME", route: "sk-sme", url: "https://www.sme.sk/rss-title" },
    { name: "Aktuality", route: "sk-aktuality", url: "https://www.aktuality.sk/rss/" },
  ],
  "Vietnam": [
    { name: "VnExpress", route: "vn-vnexpress", url: "https://vnexpress.net/rss/tin-moi-nhat.rss" },
    { name: "Tuổi Trẻ", route: "vn-tuoitre", url: "https://tuoitre.vn/rss/tin-moi-nhat.rss" },
    { name: "Thanh Niên", route: "vn-thanhnien", url: "https://thanhnien.vn/rss/home.rss" },
  ],
  "Malaysia": [
    { name: "Malaysiakini", route: "my-malaysiakini", url: "https://www.malaysiakini.com/rss/en/news.rss" },
    { name: "Malay Mail", route: "my-malaymail", url: "https://www.malaymail.com/feed/rss/malaysia" },
  ],
  "Pakistan": [
    { name: "Dawn", route: "pk-dawn", url: "https://www.dawn.com/feeds/home" },
    { name: "The Express Tribune", route: "pk-tribune", url: "https://tribune.com.pk/feed/home" },
    { name: "Geo News", route: "pk-geo", url: "https://www.geo.tv/rss/1/1" },
  ],
  "Bangladesh": [
    { name: "প্রথম আলো", route: "bd-prothomalo", url: "https://www.prothomalo.com/feed" },
    { name: "Dhaka Tribune", route: "bd-dhakatribune", url: "https://www.dhakatribune.com/feed/" },
  ],
  "Taiwan": [
    { name: "中央社", route: "tw-feedburner", url: "https://feeds.feedburner.com/rsscna/politics" },
    { name: "自由時報", route: "tw-ltn", url: "https://news.ltn.com.tw/rss/all.xml" },
    { name: "公視新聞", route: "tw-pts", url: "https://news.pts.org.tw/xml/newsfeed.xml" },
  ],
  "Hong Kong": [
    { name: "RTHK", route: "hk-rthk", url: "https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml" },
    { name: "Hong Kong Free Press", route: "hk-hongkongfp", url: "https://hongkongfp.com/feed/" },
  ],
  "Singapore": [
    { name: "CNA", route: "sg-channelnewsasia", url: "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=10416" },
    { name: "The Straits Times", route: "sg-straitstimes", url: "https://www.straitstimes.com/news/singapore/rss.xml" },
    { name: "Mothership", route: "sg-mothership", url: "https://mothership.sg/feed/" },
  ],
  "Jamaica": [
    { name: "The Gleaner", route: "jm-jamaicagleaner", url: "https://jamaica-gleaner.com/feed/rss.xml" },
    { name: "Jamaica Observer", route: "jm-jamaicaobserver", url: "https://www.jamaicaobserver.com/feed/" },
  ],
  "Senegal": [
    { name: "APS", route: "sn-aps", url: "https://aps.sn/feed/" },
    { name: "Senenews", route: "sn-senenews", url: "https://www.senenews.com/feed" },
  ],
  "Lebanon": [
    { name: "النهار", route: "lb-annahar", url: "https://www.annahar.com/rss" },
    { name: "Naharnet", route: "lb-naharnet", url: "https://www.naharnet.com/tags/lebanon/en/feed.atom" },
    { name: "المدن", route: "lb-almodon", url: "https://www.almodon.com/rss" },
  ],
  "Sri Lanka": [
    { name: "EconomyNext", route: "lk-economynext", url: "https://economynext.com/feed/" },
  ],
  "Bolivia": [
    { name: "Los Tiempos", route: "bo-lostiempos", url: "https://www.lostiempos.com/rss/ultimas" },
    { name: "Opinión", route: "bo-opinion", url: "https://www.opinion.com.bo/rss/" },
  ],
  "Cuba": [
    { name: "14ymedio", route: "cu-14ymedio", url: "https://www.14ymedio.com/rss/" },
    { name: "OnCuba", route: "cu-oncubanews", url: "https://oncubanews.com/feed/" },
  ],
  "Mali": [
    { name: "Studio Tamani", route: "ml-studiotamani", url: "https://www.studiotamani.org/feed" },
    { name: "Bamada", route: "ml-bamada", url: "https://bamada.net/feed" },
    { name: "Journal du Mali", route: "ml-journaldumali", url: "https://www.journaldumali.com/feed/" },
  ],
  "Georgia": [
    { name: "Civil.ge", route: "ge-civil", url: "https://civil.ge/feed" },
    { name: "OC Media", route: "ge-ocmedia", url: "https://oc-media.org/feed/" },
  ],
  "Costa Rica": [
    { name: "La Nación", route: "cr-nacion", url: "https://www.nacion.com/arc/outboundfeeds/rss/?outputType=xml" },
    { name: "Semanario Universidad", route: "cr-semanariouniversidad", url: "https://semanariouniversidad.com/feed/" },
    { name: "Delfino", route: "cr-delfino", url: "https://delfino.cr/feed" },
  ],
  "Honduras": [
    { name: "Criterio", route: "hn-criterio", url: "https://criterio.hn/feed/" },
    { name: "Proceso Digital", route: "hn-proceso", url: "https://proceso.hn/feed/" },
  ],
  "El Salvador": [
    { name: "GatoEncerrado", route: "sv-gatoencerrado", url: "https://gatoencerrado.news/feed/" },
  ],
  "Tanzania": [
    { name: "The Chanzo", route: "tz-thechanzo", url: "https://thechanzo.com/feed/" },
    { name: "Daily News", route: "tz-dailynews", url: "https://dailynews.co.tz/feed/", relay: false },
  ],
};
