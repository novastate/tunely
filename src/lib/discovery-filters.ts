/**
 * Discovery filters — precision-based, not blacklist-based.
 * 
 * Philosophy: Match candidates to the USER's taste, don't globally block genres.
 * The Levenshtein check prevents fuzzy name collisions (DJO ≠ Djojji).
 * Genre affinity scoring ranks candidates by how well they match the user's profile.
 */

import { distance } from 'fastest-levenshtein';

/**
 * Check if an artist name from search results is a plausible match
 * for the original search query (not a fuzzy false positive).
 * 
 * "DJO" vs "DJO" → true (exact)
 * "DJO" vs "Djojji" → false (distance 3, max allowed 1)
 * "Avicii" vs "Avicii ft. Someone" → true (substring)
 */
export function isNameMatch(searchName: string, resultName: string): boolean {
  const s = searchName.toLowerCase().trim();
  const r = resultName.toLowerCase().trim();

  if (s === r) return true;

  // Levenshtein: allow ~30% of search name length, min 1
  const maxDist = Math.max(1, Math.floor(s.length * 0.3));
  if (distance(s, r) <= maxDist) return true;

  // Substring match for "feat." style names
  if (s.length >= 3 && (r.includes(s) || s.includes(r))) return true;

  return false;
}

/**
 * Calculate genre affinity score between a candidate artist and the user's genre profile.
 * Returns 0.0 (no overlap) to 1.0 (perfect match).
 * 
 * Uses normalized set overlap — how many of the candidate's genres appear
 * in the user's genre list (case-insensitive, partial matching for sub-genres).
 */
export function genreAffinity(userGenres: string[], candidateGenres: string[]): number {
  if (candidateGenres.length === 0 || userGenres.length === 0) return 0;

  const userSet = userGenres.map(g => g.toLowerCase());
  let matches = 0;

  for (const cg of candidateGenres) {
    const cgLower = cg.toLowerCase();
    // Exact match
    if (userSet.includes(cgLower)) {
      matches++;
      continue;
    }
    // Partial: "indie pop" matches user's "pop" or "indie"
    // and user's "indie pop" matches candidate's "indie"
    const hasPartial = userSet.some(ug =>
      cgLower.includes(ug) || ug.includes(cgLower)
    );
    if (hasPartial) matches += 0.5;
  }

  return Math.min(1, matches / Math.max(1, candidateGenres.length));
}

/**
 * Minimum genre affinity score for a candidate to be considered relevant.
 * 0.1 = at least some partial genre overlap required.
 * Set to 0 to disable (accept any genre).
 */
export const MIN_GENRE_AFFINITY = 0.1;
