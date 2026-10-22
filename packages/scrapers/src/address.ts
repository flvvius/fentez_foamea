const ABBREVIATIONS: [RegExp, string][] = [
  [/^(b-?dul|bdul|bd|bld|blvd)\.?\s+/i, "Bulevardul "],
  [/^(str|st)\.?\s+/i, "Strada "],
  [/^(sos|șos|şos)\.?\s+/i, "Șoseaua "],
  [/^(cal)\.?\s+/i, "Calea "],
  [/^(pța|pta|piata)\.?\s+/i, "Piața "],
];

const COUNTIES =
  "alba|arad|argeș|argeş|arges|bacău|bihor|bistrița|botoșani|brașov|braşov|brasov|brăila|buzău|caraș|călărași|cluj|constanța|constanţa|covasna|dâmbovița|dâmboviţa|dolj|galați|giurgiu|gorj|harghita|hunedoara|ialomița|iași|ilfov|maramureș|mehedinți|mehedinţi|mureș|neamț|olt|prahova|satu mare|sălaj|sibiu|suceava|teleorman|timiș|tulcea|vaslui|vâlcea|vrancea";

const SUBURBS = ["voluntari", "popești-leordeni", "chiajna", "bragadiru", "otopeni", "pantelimon", "roșu", "domnești"];
const CITY_NAMES = `bucure[sșş]ti|bucuresti|bucharest|bucursti|${SUBURBS.join("|")}`;

const word = (pattern: string) => new RegExp(`(?<![\\p{L}\\d])(?:${pattern})(?![\\p{L}\\d])`, "giu");

const NOISE = [
  word(`(județul|judetul)\\s+(${COUNTIES})`),
  word(`(${COUNTIES})\\s+county`),
  word(`(${COUNTIES})(?=\\s+(0\\s+)?(${CITY_NAMES})(?![\\p{L}\\d]))`),
  word("romania|românia|romanai|ro"),
  word("sector(ul)?\\s*\\d"),
  word("parter|etaj\\s*\\d+|lifebox"),
  word("0"),
];

const CITY = word("bucure[sșş]ti|bucuresti|bucharest|bucursti");
const PLUS_CODE = /\b[23456789CFGHJMPQRVWX]{4}\+[23456789CFGHJMPQRVWX]{2,3}\b/i;

export function addressCandidates(raw: string): string[] {
  if (PLUS_CODE.test(raw)) return [];
  let text = raw;
  for (const pattern of NOISE) text = text.replace(pattern, " ");
  const suburb = SUBURBS.find((name) => text.toLowerCase().includes(name));
  const segments = unique(
    text
      .replace(CITY, " ")
      .split(/,|\n/)
      .map(cleanSegment)
      .filter((segment) => segment && (!suburb || segment.toLowerCase() !== suburb)),
  );
  const city = suburb ? capitalize(suburb) : "București";
  const street = segments.find((segment) => /\p{L}{3,}.*\s\d+[a-z]?\b/iu.test(segment));
  const candidates = [segments.join(", ") ? `${segments.join(", ")}, ${city}` : undefined];
  if (street) {
    candidates.push(`${street}, ${city}`);
    const firstNumber = street.replace(/(\d+[a-z]?)\s*-\s*\d+[a-z]?\b/i, "$1");
    candidates.push(`${firstNumber}, ${city}`);
  }
  return unique(candidates.filter((candidate): candidate is string => Boolean(candidate)));
}

function cleanSegment(segment: string): string {
  let text = segment
    .replace(/\b(nr|number|numărul)\.?\s*(?=\d)/giu, "")
    .replace(/\b(\d+[a-z]?)\s+\1\b/giu, "$1")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, replacement] of ABBREVIATIONS) text = text.replace(pattern, replacement);
  return text;
}

function unique<T>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function capitalize(name: string): string {
  return name.replace(/(^|-)(\p{L})/gu, (_, dash: string, letter: string) => dash + letter.toUpperCase());
}
