import type { VoteValue } from "./ranking";
import type { LockedDeal, VoteStore } from "./vote-store";

/** In-memory VoteStore for tests. Single-threaded, so lockDeal needs no real locking. */
export class MemoryVoteStore implements VoteStore {
  readonly deals = new Map<string, LockedDeal>();
  readonly votes = new Map<string, -1 | 1>();

  /** Pass a shared log to interleave store calls with other fakes' calls. */
  constructor(readonly calls: string[] = []) {}

  private key(dealId: string, userId: string) {
    return `${dealId}:${userId}`;
  }

  async lockDeal(dealId: string) {
    this.calls.push("lockDeal");
    const deal = this.deals.get(dealId);
    return deal ? { ...deal } : null;
  }
  async getVote(dealId: string, userId: string): Promise<VoteValue> {
    this.calls.push("getVote");
    return this.votes.get(this.key(dealId, userId)) ?? 0;
  }
  async setVote(dealId: string, userId: string, value: -1 | 1) {
    this.calls.push("setVote");
    this.votes.set(this.key(dealId, userId), value);
  }
  async deleteVote(dealId: string, userId: string) {
    this.calls.push("deleteVote");
    this.votes.delete(this.key(dealId, userId));
  }
  async addScore(dealId: string, delta: number) {
    this.calls.push("addScore");
    const deal = this.deals.get(dealId)!;
    deal.score += delta;
    return deal.score;
  }
}
