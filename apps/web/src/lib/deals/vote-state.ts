import { voteDelta, type VoteValue } from "@/server/deals/ranking";

/** What a row shows for one deal. `rollback` is the state before an in-flight optimistic vote. */
export type VoteEntry = {
  score: number;
  myVote: VoteValue;
  pending: boolean;
  error: string | null;
  rollback: { score: number; myVote: VoteValue } | null;
  /** Counts the user's own clicks on this deal, so a slow "my votes" answer can tell it is stale. */
  seq: number;
};

export type VoteState = Record<string, VoteEntry>;

export type VoteAction =
  /** Adds entries for deals not tracked yet (first page, "Mai multe"). Existing entries are kept. */
  | { type: "seed"; deals: readonly { id: string; score: number }[] }
  /**
   * The signed-in user's saved votes for `ids`; ids missing from `votes` mean "no vote".
   * `since` holds each id's `seq` when the request started: an id the user has voted on since
   * is skipped, because the answer is older than what the row already shows.
   */
  | { type: "myVotes"; ids: readonly string[]; votes: Record<string, number>; since: Record<string, number> }
  /** The user clicked up (1) or down (-1). Ignored while a vote for this deal is in flight. */
  | { type: "vote"; id: string; click: 1 | -1 }
  /** castVote answered: the server's numbers win. */
  | { type: "reconcile"; id: string; score: number; myVote: VoteValue }
  /** castVote failed: undo the optimistic change and show `message`. */
  | { type: "fail"; id: string; message: string }
  | { type: "dismissError"; id: string }
  /** Signed out or switched account: forget every personal vote. */
  | { type: "forgetMyVotes" };

export const initialVoteState: VoteState = {};

/** Clicking the active direction removes the vote; anything else sets it. */
export function nextVote(current: VoteValue, click: 1 | -1): VoteValue {
  return current === click ? 0 : click;
}

function asVote(value: number | undefined): VoteValue {
  return value === 1 || value === -1 ? value : 0;
}

export function voteReducer(state: VoteState, action: VoteAction): VoteState {
  switch (action.type) {
    case "seed": {
      let next = state;
      for (const deal of action.deals) {
        if (state[deal.id]) continue;
        if (next === state) next = { ...state };
        next[deal.id] = { score: deal.score, myVote: 0, pending: false, error: null, rollback: null, seq: 0 };
      }
      return next;
    }
    case "myVotes": {
      const next = { ...state };
      for (const id of action.ids) {
        const entry = next[id];
        // A vote in flight is newer than what the server knew when it answered.
        if (!entry || entry.pending || entry.seq !== (action.since[id] ?? 0)) continue;
        next[id] = { ...entry, myVote: asVote(action.votes[id]) };
      }
      return next;
    }
    case "vote": {
      const entry = state[action.id];
      if (!entry || entry.pending) return state;
      const myVote = nextVote(entry.myVote, action.click);
      return {
        ...state,
        [action.id]: {
          score: entry.score + voteDelta(entry.myVote, myVote),
          myVote,
          pending: true,
          error: null,
          rollback: { score: entry.score, myVote: entry.myVote },
          seq: entry.seq + 1,
        },
      };
    }
    case "reconcile": {
      const entry = state[action.id];
      if (!entry) return state;
      return {
        ...state,
        [action.id]: { ...entry, score: action.score, myVote: action.myVote, pending: false, error: null, rollback: null },
      };
    }
    case "fail": {
      const entry = state[action.id];
      if (!entry) return state;
      return {
        ...state,
        [action.id]: {
          ...entry,
          score: entry.rollback?.score ?? entry.score,
          myVote: entry.rollback?.myVote ?? entry.myVote,
          pending: false,
          error: action.message,
          rollback: null,
        },
      };
    }
    case "dismissError": {
      const entry = state[action.id];
      if (!entry?.error) return state;
      return { ...state, [action.id]: { ...entry, error: null } };
    }
    case "forgetMyVotes": {
      // Nothing to forget: return the same object so a signed-out effect can't loop on it.
      if (Object.values(state).every((e) => e.myVote === 0 && e.rollback === null && e.error === null)) return state;
      const next: VoteState = {};
      for (const [id, entry] of Object.entries(state)) {
        next[id] = { ...entry, myVote: 0, rollback: null, error: null };
      }
      return next;
    }
  }
}
