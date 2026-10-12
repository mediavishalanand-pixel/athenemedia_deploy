/**
 * Shared channel-name matching used by plan import, manual ROs and document
 * saving. A plan name matches a master record when it equals the channel name
 * or ANY alias listed on that record, ignoring case, spacing, punctuation and
 * quality suffixes such as HD / SD / 4K.
 *
 * Example: a master saved as "Sun TV" with aliases "suntv, ktv" matches plan
 * names "SUN TV", "Sun TV HD", "KTV", "KTV HD" and "K TV SD".
 */

/** Lowercase, drop everything that is not a letter or digit. */
export const normalizeChannelKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Quality / feed markers that never change which company the RO is raised to. */
const QUALITY_SUFFIXES = [
  "ultrahd",
  "fullhd",
  "uhd",
  "hdtv",
  "sdtv",
  "4k",
  "hd",
  "sd",
];

/** Strip trailing quality markers, repeatedly (e.g. "ktvhdhd" -> "ktv"). */
const stripQuality = (key: string): string => {
  let result = key;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of QUALITY_SUFFIXES) {
      if (result.length > suffix.length && result.endsWith(suffix)) {
        result = result.slice(0, -suffix.length);
        changed = true;
        break;
      }
    }
  }
  return result;
};

/** All keys a name can be recognised by: exact and quality-stripped. */
export const channelKeys = (value: unknown): string[] => {
  const key = normalizeChannelKey(value);
  if (!key) return [];
  const bare = stripQuality(key);
  return bare && bare !== key ? [key, bare] : [key];
};

/** True when a plan name and a master name/alias refer to the same channel. */
export const channelNamesMatch = (a: unknown, b: unknown): boolean => {
  const left = channelKeys(a);
  const right = channelKeys(b);
  if (!left.length || !right.length) return false;
  return left.some((key) => right.includes(key));
};

/**
 * Plan sheets sometimes append programme/campaign text after a spaced dash,
 * for example "JIOHOTSTAR - AUS vs IND". Only the leading value is eligible
 * for alias matching; the trailing text remains schedule content.
 */
const channelLookupNames = (value: string): string[] => {
  const trimmed = value.trim();
  const prefix = trimmed.split(/\s+[–—-]\s+/, 1)[0]?.trim() ?? "";
  return prefix && prefix !== trimmed ? [trimmed, prefix] : [trimmed];
};

/**
 * Last resort for plan names that carry a page/edition/variety suffix without a
 * clean " - " separator, e.g. "The Hindu-black & white" or "TV9 CTV": the plan
 * name merely starts with the master name or alias. The longest prefix wins so
 * "Sun TV" beats "Sun", and matches under 3 characters are ignored.
 */
const prefixMatch = <T>(
  key: string,
  rows: readonly T[],
  namesOf: (row: T) => Array<string | null | undefined>,
): T | undefined => {
  let best: T | undefined;
  let bestLength = 0;
  for (const row of rows) {
    for (const candidate of namesOf(row)) {
      const candidateKey = normalizeChannelKey(candidate);
      if (
        candidateKey.length >= 3 &&
        key.startsWith(candidateKey) &&
        candidateKey.length > bestLength
      ) {
        best = row;
        bestLength = candidateKey.length;
      }
    }
  }
  return best;
};

/**
 * Find the master record whose channel name or any alias matches `name`.
 * Exact matches win over quality-stripped ones so "Sun TV" never steals a row
 * that literally lists "Sun TV HD" as its own name.
 */
export function findChannelByAlias<T>(
  name: string,
  rows: readonly T[],
  namesOf: (row: T) => Array<string | null | undefined>,
): T | undefined {
  for (const lookupName of channelLookupNames(name)) {
    const keys = channelKeys(lookupName);
    if (!keys.length) continue;
    const exact = keys[0];
    if (!exact) continue;

    // Priority: exact channel name > exact alias > quality-stripped match.
    let aliasExact: T | undefined;
    let loose: T | undefined;
    for (const row of rows) {
      const names = namesOf(row);
      for (let index = 0; index < names.length; index += 1) {
        const candidate = names[index];
        if (!candidate) continue;
        const candidateKeys = channelKeys(candidate);
        if (!candidateKeys.length) continue;
        if (candidateKeys[0] === exact) {
          if (index === 0) return row;
          if (!aliasExact) aliasExact = row;
          continue;
        }
        if (!loose && candidateKeys.some((key) => keys.includes(key))) loose = row;
      }
    }
    if (aliasExact) return aliasExact;
    if (loose) return loose;
    const prefixed = prefixMatch(exact, rows, namesOf);
    if (prefixed) return prefixed;
  }
  return undefined;
}

/**
 * Radio stations: "Suryan FM" + station "Coimbatore" first looks for a master
 * named/aliased "Suryan FM / Coimbatore" (any separator), and only falls back
 * to the all-over "Suryan FM" master when no station master exists.
 */
export function findStationChannel<T>(
  name: string,
  station: string | null | undefined,
  rows: readonly T[],
  namesOf: (row: T) => Array<string | null | undefined>,
): T | undefined {
  const city = String(station ?? "").trim();
  const base = name.trim();
  if (city && !normalizeChannelKey(base).endsWith(normalizeChannelKey(city))) {
    const specific = findChannelByAlias(`${base} / ${city}`, rows, namesOf);
    if (specific) return specific;
  }
  return findChannelByAlias(base, rows, namesOf);
}
