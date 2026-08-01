import { VaultItem } from './storage';

export interface FuzzyResult {
  score: number;
  matches: number[];
}

export interface TextPart {
  text: string;
  isMatch: boolean;
}

export interface FuzzySearchResult {
  item: VaultItem;
  score: number;
  titleMatches: number[];
  folderMatches: number[];
  typeMatches: number[];
  tagMatches: { tag: string; matches: number[] }[];
}

/**
 * Perform a subsequence fuzzy match of query against text.
 * Returns score and indices of matched characters in text, or null if no match.
 */
export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  if (q.length === 0) {
    return { score: 0, matches: [] };
  }

  const qLen = q.length;
  const tLen = t.length;

  if (qLen > tLen) {
    return null;
  }

  // Memoization table: memo[qIdx][tIdx] stores the best FuzzyResult or null
  const memo: (FuzzyResult | null)[][] = Array.from({ length: qLen }, () =>
    Array(tLen).fill(undefined)
  );

  function match(qIdx: number, tIdx: number): FuzzyResult | null {
    if (qIdx === qLen) {
      return { score: 0, matches: [] };
    }
    if (tIdx === tLen) {
      return null;
    }

    if (memo[qIdx][tIdx] !== undefined) {
      return memo[qIdx][tIdx];
    }

    const char = q[qIdx];
    let bestResult: FuzzyResult | null = null;

    // Search for occurrences of char starting from tIdx
    const remainingQ = qLen - qIdx;
    const maxSearchIdx = tLen - remainingQ;

    for (let i = tIdx; i <= maxSearchIdx; i++) {
      if (t[i] === char) {
        const next = match(qIdx + 1, i + 1);
        if (next !== null) {
          let score = 10; // base score for a matching character

          // Bonus: Consecutive character match
          if (qIdx > 0 && i === tIdx) {
            score += 15;
          }

          // Bonus: Match at word start / word boundary
          const prevChar = i > 0 ? text[i - 1] : '';
          const isWordStart =
            i === 0 ||
            prevChar === ' ' ||
            prevChar === '-' ||
            prevChar === '_' ||
            prevChar === '/' ||
            prevChar === '\\' ||
            prevChar === '.';
          if (isWordStart) {
            score += 20;
          }

          // Bonus: CamelCase transition match (e.g. 'C' in 'camelCase')
          const isCamelStart =
            i > 0 &&
            text[i] !== t[i] && // original is uppercase
            text[i - 1] === t[i - 1]; // previous was lowercase
          if (isCamelStart) {
            score += 15;
          }

          // Penalty: Gap from previous match
          if (qIdx > 0 && i > tIdx) {
            const gap = i - tIdx;
            score -= gap * 2;
          }

          // Penalty: Distance from start of the text (helps matches at beginning of title rank higher)
          if (qIdx === 0) {
            score -= i * 0.5;
          }

          const totalScore = score + next.score;
          const matches = [i, ...next.matches];

          if (bestResult === null || totalScore > bestResult.score) {
            bestResult = { score: totalScore, matches };
          }
        }
      }
    }

    memo[qIdx][tIdx] = bestResult;
    return bestResult;
  }

  const result = match(0, 0);
  if (result === null) return null;

  // Apply a small penalty for overall text length so shorter strings matching the query rank higher
  result.score -= tLen * 0.1;
  return result;
}

/**
 * Splits text into highlighted/unhighlighted segments for UI rendering.
 * Merges consecutive matched or unmatched character ranges.
 */
export function getHighlightedParts(text: string, matches: number[]): TextPart[] {
  if (!matches || matches.length === 0 || !text) {
    return [{ text, isMatch: false }];
  }

  const parts: TextPart[] = [];
  const matchSet = new Set(matches);
  let currentPart = { text: text[0], isMatch: matchSet.has(0) };

  for (let i = 1; i < text.length; i++) {
    const isMatch = matchSet.has(i);
    if (isMatch === currentPart.isMatch) {
      currentPart.text += text[i];
    } else {
      parts.push(currentPart);
      currentPart = { text: text[i], isMatch };
    }
  }
  parts.push(currentPart);

  return parts;
}

/**
 * Searches across all vault items using a client-side fuzzy matching index.
 * Only indexes public metadata fields like title, folder, type, and tags.
 */
export function searchVaultItems(
  items: VaultItem[],
  query: string,
  typeConfigs: Record<string, any>
): FuzzySearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) {
    // Default: Sort by pinned first, then updatedAt desc, and return everything
    return items
      .filter((item) => !!typeConfigs[item.type])
      .map((item) => ({
        item,
        score: 0,
        titleMatches: [],
        folderMatches: [],
        typeMatches: [],
        tagMatches: [],
      }));
  }

  const isTagSearch = trimmed.startsWith('#');
  const actualQuery = isTagSearch ? trimmed.slice(1) : trimmed;

  if (isTagSearch && !actualQuery) {
    // Show all items that have tags
    return items
      .filter((item) => {
        if (!typeConfigs[item.type]) return false;
        const tags = (item.metadata?.tags as string[]) || [];
        return tags.length > 0;
      })
      .map((item) => ({
        item,
        score: 1,
        titleMatches: [],
        folderMatches: [],
        typeMatches: [],
        tagMatches: ((item.metadata?.tags as string[]) || []).map((t) => ({
          tag: t,
          matches: [],
        })),
      }));
  }

  const results: FuzzySearchResult[] = [];

  for (const item of items) {
    if (!typeConfigs[item.type]) continue;

    const tags = (item.metadata?.tags as string[]) || [];

    if (isTagSearch) {
      const tagMatches: { tag: string; matches: number[] }[] = [];
      let bestTagScore = -Infinity;

      for (const tag of tags) {
        const matchResult = fuzzyMatch(actualQuery, tag);
        if (matchResult) {
          tagMatches.push({ tag, matches: matchResult.matches });
          if (matchResult.score > bestTagScore) {
            bestTagScore = matchResult.score;
          }
        }
      }

      if (tagMatches.length > 0) {
        results.push({
          item,
          score: bestTagScore,
          titleMatches: [],
          folderMatches: [],
          typeMatches: [],
          tagMatches,
        });
      }
    } else {
      const titleMatch = fuzzyMatch(actualQuery, item.title);
      const folderMatch = item.folder ? fuzzyMatch(actualQuery, item.folder) : null;
      const typeLabel = typeConfigs[item.type]?.label || item.type;
      const typeMatch = fuzzyMatch(actualQuery, typeLabel);

      const tagMatches: { tag: string; matches: number[] }[] = [];
      let bestTagScore = -Infinity;

      for (const tag of tags) {
        const matchResult = fuzzyMatch(actualQuery, tag);
        if (matchResult) {
          tagMatches.push({ tag, matches: matchResult.matches });
          if (matchResult.score > bestTagScore) {
            bestTagScore = matchResult.score;
          }
        }
      }

      const hasMatch = titleMatch || folderMatch || typeMatch || tagMatches.length > 0;

      if (hasMatch) {
        const scores: number[] = [];
        if (titleMatch) scores.push(titleMatch.score);
        if (folderMatch) scores.push(folderMatch.score * 0.8);
        if (typeMatch) scores.push(typeMatch.score * 0.6);
        if (tagMatches.length > 0) scores.push(bestTagScore * 0.7);

        const maxScore = Math.max(...scores);

        results.push({
          item,
          score: maxScore,
          titleMatches: titleMatch ? titleMatch.matches : [],
          folderMatches: folderMatch ? folderMatch.matches : [],
          typeMatches: typeMatch ? typeMatch.matches : [],
          tagMatches,
        });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
