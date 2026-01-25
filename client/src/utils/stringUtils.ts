/**
 * Calculates the Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Calculate distance
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1, // deletion
          ),
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculates the similarity percentage between two strings.
 * Returns a number between 0 and 100.
 */
export function calculateSimilarity(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;

  const formattedS1 = s1.trim().toLowerCase();
  const formattedS2 = s2.trim().toLowerCase();

  if (formattedS1 === formattedS2) return 100;

  const distance = levenshteinDistance(formattedS1, formattedS2);
  const maxLength = Math.max(formattedS1.length, formattedS2.length);

  if (maxLength === 0) return 100;

  const similarity = ((maxLength - distance) / maxLength) * 100;
  return Math.round(similarity * 10) / 10; // Round to 1 decimal place
}
