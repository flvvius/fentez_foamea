export type VoteValue = -1 | 0 | 1;

/** Every 10x in votes is worth HOT_DECAY_SECONDS of recency (12.5 hours). */
export const HOT_DECAY_SECONDS = 45000;

/**
 * Reddit-style hot rank. The SQL ORDER BY in feed-query.ts computes the same expression:
 * keep the two in sync. sign() makes net-negative deals sort below neutral ones at equal age.
 */
export function hotRank(score: number, createdAt: Date): number {
  return (
    Math.sign(score) * Math.log10(Math.max(Math.abs(score), 1)) +
    createdAt.getTime() / 1000 / HOT_DECAY_SECONDS
  );
}

/** How much deals.score changes when a user's vote goes from prev to next (0 = no vote). */
export function voteDelta(prev: VoteValue, next: VoteValue): number {
  return next - prev;
}
