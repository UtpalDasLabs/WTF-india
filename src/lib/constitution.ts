/**
 * Constitution of India reading data.
 *
 * Honesty rules baked into this file:
 *  - `inApp` means the text below was checked against the official published
 *    text and is shown inside the app.
 *  - `unconfirmed` means we have NOT confirmed that an official version of the
 *    Constitution is published in that language, and we show nothing but a link
 *    to the official Legislative Department listing. We never label a
 *    translation "official" unless we can point at the official source for it.
 */

export const OFFICIAL_SOURCES = {
  constitution: {
    label: "Constitution of India — Legislative Department, Ministry of Law and Justice",
    url: "https://lddashboard.legislative.gov.in/constitution-of-india",
  },
  preamble: {
    label: "Preamble to the Constitution of India — Legislative Department",
    url: "https://lddashboard.legislative.gov.in/constitution-of-india/preamble-to-the-constitution-of-india",
  },
  regional: {
    label: "Constitution of India in regional languages — Legislative Department",
    url: "https://lddashboard.legislative.gov.in/constitution-of-india-in-regional-languages",
  },
  hindi: {
    label: "भारत का संविधान — विधायी विभाग, विधि और न्याय मंत्रालय",
    url: "https://lddashboard.legislative.gov.in/hi/constitution-of-india",
  },
  eighthSchedule: {
    label: "Eighth Schedule languages — Ministry of Home Affairs",
    url: "https://www.mha.gov.in/sites/default/files/EighthSchedule_19052017.pdf",
  },
} as const;

export type LanguageStatus = "in_app" | "unconfirmed";

export type ConstitutionLanguage = {
  code: string;
  /** Name in English. */
  name: string;
  /** Name written in the language itself, where the script is known. */
  nativeName: string;
  status: LanguageStatus;
  /** Where the version we show (or point to) comes from. */
  source: { label: string; url: string };
  /** Plain-English explanation of what a reader gets in this language. */
  note: string;
  preambleTitle?: string;
  preamble?: string[];
};

const ENGLISH_PREAMBLE = [
  "WE, THE PEOPLE OF INDIA, having solemnly resolved to constitute India into a SOVEREIGN SOCIALIST SECULAR DEMOCRATIC REPUBLIC and to secure to all its citizens:",
  "JUSTICE, social, economic and political;",
  "LIBERTY of thought, expression, belief, faith and worship;",
  "EQUALITY of status and of opportunity;",
  "and to promote among them all",
  "FRATERNITY assuring the dignity of the individual and the unity and integrity of the Nation;",
  "IN OUR CONSTITUENT ASSEMBLY this twenty-sixth day of November, 1949, do HEREBY ADOPT, ENACT AND GIVE TO OURSELVES THIS CONSTITUTION.",
];

const HINDI_PREAMBLE = [
  "हम भारत के लोग, भारत को एक सम्पूर्ण प्रभुत्व-संपन्न समाजवादी पंथनिरपेक्ष लोकतंत्रात्मक गणराज्य बनाने के लिए, तथा उसके समस्त नागरिकों को:",
  "सामाजिक, आर्थिक और राजनैतिक न्याय,",
  "विचार, अभिव्यक्ति, विश्वास, धर्म और उपासना की स्वतंत्रता,",
  "प्रतिष्ठा और अवसर की समता प्राप्त कराने के लिए,",
  "तथा उन सब में",
  "व्यक्ति की गरिमा और राष्ट्र की एकता और अखंडता सुनिश्चित करने वाली बंधुता बढ़ाने के लिए",
  "दृढ़संकल्प होकर अपनी इस संविधान सभा में आज तारीख 26 नवम्बर, 1949 ई. को एतद्द्वारा इस संविधान को अंगीकृत, अधिनियमित और आत्मार्पित करते हैं।",
];

/** Names of the 22 Eighth Schedule languages, plus English. */
const EIGHTH_SCHEDULE: Array<[string, string, string]> = [
  ["as", "Assamese", "অসমীয়া"],
  ["bn", "Bengali", "বাংলা"],
  ["brx", "Bodo", "बड़ो"],
  ["doi", "Dogri", "डोगरी"],
  ["gu", "Gujarati", "ગુજરાતી"],
  ["kn", "Kannada", "ಕನ್ನಡ"],
  ["ks", "Kashmiri", "کٲشُر"],
  ["kok", "Konkani", "कोंकणी"],
  ["mai", "Maithili", "मैथिली"],
  ["ml", "Malayalam", "മലയാളം"],
  ["mni", "Manipuri", "মৈতৈলোন্"],
  ["mr", "Marathi", "मराठी"],
  ["ne", "Nepali", "नेपाली"],
  ["or", "Odia", "ଓଡ଼ିଆ"],
  ["pa", "Punjabi", "ਪੰਜਾਬੀ"],
  ["sa", "Sanskrit", "संस्कृतम्"],
  ["sat", "Santali", "ᱥᱟᱱᱛᱟᱲᱤ"],
  ["sd", "Sindhi", "سنڌي"],
  ["ta", "Tamil", "தமிழ்"],
  ["te", "Telugu", "తెలుగు"],
  ["ur", "Urdu", "اُردُو"],
];

export const CONSTITUTION_LANGUAGES: ConstitutionLanguage[] = [
  {
    code: "en",
    name: "English",
    nativeName: "English",
    status: "in_app",
    source: OFFICIAL_SOURCES.preamble,
    note: "Checked word for word against the text published by the Legislative Department.",
    preambleTitle: "Preamble",
    preamble: ENGLISH_PREAMBLE,
  },
  {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    status: "in_app",
    source: OFFICIAL_SOURCES.hindi,
    note: "Hindi is an authoritative language of the Constitution. This text matches the Hindi version published by the Legislative Department.",
    preambleTitle: "उद्देशिका",
    preamble: HINDI_PREAMBLE,
  },
  ...EIGHTH_SCHEDULE.map<ConstitutionLanguage>(([code, name, nativeName]) => ({
    code,
    name,
    nativeName,
    status: "unconfirmed",
    source: OFFICIAL_SOURCES.regional,
    note: `${name} is one of the 22 languages listed in the Eighth Schedule. We have not yet confirmed an official published version we can quote, so nothing is shown here as official ${name} text. The Legislative Department publishes the Constitution in several regional languages — open the official list to check.`,
  })),
];

export function findLanguage(code: string): ConstitutionLanguage {
  return (
    CONSTITUTION_LANGUAGES.find((l) => l.code === code) ??
    (CONSTITUTION_LANGUAGES[0] as ConstitutionLanguage)
  );
}

export const LANGUAGE_STATUS_LABEL: Record<LanguageStatus, string> = {
  in_app: "Text available and checked",
  unconfirmed: "Official text not confirmed",
};

export type ConstitutionPart = {
  part: string;
  title: string;
  articles: string;
  about: string;
};

/** Structure of the Constitution — Parts, with plain-English one-liners. */
export const CONSTITUTION_PARTS: ConstitutionPart[] = [
  { part: "Part I", title: "The Union and its Territory", articles: "Articles 1–4", about: "India is a union of states, and how states or their borders can change." },
  { part: "Part II", title: "Citizenship", articles: "Articles 5–11", about: "Who is a citizen of India and how citizenship works." },
  { part: "Part III", title: "Fundamental Rights", articles: "Articles 12–35", about: "The rights every person can defend in court, including equality, free speech and life and liberty." },
  { part: "Part IV", title: "Directive Principles of State Policy", articles: "Articles 36–51", about: "Goals the government should work towards, such as fair wages, health and the environment." },
  { part: "Part IVA", title: "Fundamental Duties", articles: "Article 51A", about: "What citizens are asked to do in return, like protecting public property and the environment." },
  { part: "Part V", title: "The Union", articles: "Articles 52–151", about: "The President, Parliament, the Union government, the Supreme Court and the CAG." },
  { part: "Part VI", title: "The States", articles: "Articles 152–237", about: "Governors, state legislatures, state governments and High Courts." },
  { part: "Part VIII", title: "The Union Territories", articles: "Articles 239–242", about: "How Union Territories are governed." },
  { part: "Part IX", title: "The Panchayats", articles: "Articles 243–243O", about: "Elected village and district bodies — the level closest to most public works." },
  { part: "Part IXA", title: "The Municipalities", articles: "Articles 243P–243ZG", about: "City and town governments, and the money and duties given to them." },
  { part: "Part X", title: "The Scheduled and Tribal Areas", articles: "Articles 244–244A", about: "Special administration for Scheduled and tribal areas." },
  { part: "Part XI", title: "Relations between the Union and the States", articles: "Articles 245–263", about: "Who can make which laws, and how money and disputes are handled." },
  { part: "Part XII", title: "Finance, Property, Contracts and Suits", articles: "Articles 264–300A", about: "Taxes, public money, government contracts and the right to property." },
  { part: "Part XIII", title: "Trade, Commerce and Intercourse", articles: "Articles 301–307", about: "Free movement of trade across India." },
  { part: "Part XIV", title: "Services under the Union and the States", articles: "Articles 308–323", about: "Government jobs and public service commissions." },
  { part: "Part XIVA", title: "Tribunals", articles: "Articles 323A–323B", about: "Special tribunals for service and other disputes." },
  { part: "Part XV", title: "Elections", articles: "Articles 324–329A", about: "The Election Commission and how elections are run." },
  { part: "Part XVI", title: "Special Provisions for Certain Classes", articles: "Articles 330–342", about: "Reservations and safeguards for Scheduled Castes, Scheduled Tribes and others." },
  { part: "Part XVII", title: "Official Language", articles: "Articles 343–351", about: "Languages used by the Union, the states and the courts." },
  { part: "Part XVIII", title: "Emergency Provisions", articles: "Articles 352–360", about: "What happens during a national, state or financial emergency." },
  { part: "Part XIX", title: "Miscellaneous", articles: "Articles 361–367", about: "Assorted provisions, including protections for high offices." },
  { part: "Part XX", title: "Amendment of the Constitution", articles: "Article 368", about: "How the Constitution itself can be changed." },
  { part: "Part XXI", title: "Temporary, Transitional and Special Provisions", articles: "Articles 369–392", about: "Special arrangements for particular states and situations." },
  { part: "Part XXII", title: "Short Title, Commencement and Repeals", articles: "Articles 393–395", about: "The name of the Constitution and the date it came into force." },
];

export type KeyArticle = { article: string; title: string; about: string };

/** A few articles most useful to someone checking public works and services. */
export const KEY_ARTICLES: KeyArticle[] = [
  { article: "Article 14", title: "Equality before the law", about: "The state cannot deny anyone equality before the law or equal protection of the law." },
  { article: "Article 15", title: "No discrimination", about: "No discrimination on grounds of religion, race, caste, sex or place of birth." },
  { article: "Article 19", title: "Freedom of speech and expression", about: "Includes the freedom to speak, assemble peacefully, move and reside anywhere in India." },
  { article: "Article 21", title: "Protection of life and personal liberty", about: "Courts have read this to include a life with dignity, clean water and a clean environment." },
  { article: "Article 21A", title: "Right to education", about: "Free and compulsory education for children aged six to fourteen." },
  { article: "Article 32", title: "Right to constitutional remedies", about: "You can go directly to the Supreme Court when a fundamental right is broken." },
  { article: "Article 51A", title: "Fundamental duties", about: "Duties of every citizen, including protecting public property and the natural environment." },
  { article: "Article 243G", title: "Powers of Panchayats", about: "States may give village bodies the power to plan and run local works and services." },
  { article: "Article 243W", title: "Powers of Municipalities", about: "States may give city bodies responsibility for roads, water, sanitation and other local works." },
  { article: "Article 148", title: "Comptroller and Auditor-General of India", about: "The independent auditor whose reports often reveal how public projects were actually run." },
];
