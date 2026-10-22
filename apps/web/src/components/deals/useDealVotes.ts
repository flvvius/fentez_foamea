import { useCallback, useEffect, useReducer, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSession } from "@/lib/auth-client";
import { voteErrorMessage } from "@/lib/deals/messages";
import { initialVoteState, nextVote, voteReducer, type VoteEntry } from "@/lib/deals/vote-state";
import { castVote, fetchMyVotes } from "@/server/deals/votes";
import { MAX_MY_VOTES_IDS } from "@/server/deals/inputs";
import type { DealCard } from "@/server/deals/types";
import { voteErrorCode } from "@/server/deals/vote-errors";

export type VoteView = Pick<VoteEntry, "score" | "myVote" | "pending" | "error">;

/**
 * Optimistic voting for a list of deals. After hydration, a signed-in user's saved votes are
 * loaded for the visible ids (again whenever new ids show up). A click updates the score at
 * once, then castVote's answer replaces it; a failure puts the old numbers back.
 *
 * Effects depend on the list of ids (a string), not on the array's identity, so callers that
 * pass a new array every render can't make them re-run.
 */
export function useDealVotes(deals: readonly DealCard[]) {
  const [state, dispatch] = useReducer(voteReducer, initialVoteState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const dealsRef = useRef(deals);
  dealsRef.current = deals;
  const inFlight = useRef(new Set<string>());
  const fetched = useRef(new Set<string>());
  const session = useSession();
  const userId = session.data?.user.id ?? null;
  const sessionPending = session.isPending;
  const navigate = useNavigate();
  const idsKey = deals.map((deal) => deal.id).join(",");

  useEffect(() => {
    dispatch({ type: "seed", deals: dealsRef.current });
  }, [idsKey]);

  // Loads saved votes. The answer is tagged with each id's click counter from when the request
  // started, so the reducer can drop it for deals the user has voted on in the meantime.
  const loadMyVotes = useCallback((ids: string[]) => {
    for (let i = 0; i < ids.length; i += MAX_MY_VOTES_IDS) {
      const chunk = ids.slice(i, i + MAX_MY_VOTES_IDS);
      const since = Object.fromEntries(chunk.map((id) => [id, stateRef.current[id]?.seq ?? 0]));
      for (const id of chunk) fetched.current.add(id);
      fetchMyVotes({ data: { dealIds: chunk } })
        .then((votes) => dispatch({ type: "myVotes", ids: chunk, votes, since }))
        .catch(() => {
          // Not fatal: the buttons just show no saved vote. Try again on the next change.
          for (const id of chunk) fetched.current.delete(id);
        });
    }
  }, []);

  useEffect(() => {
    if (sessionPending) return;
    if (!userId) {
      fetched.current.clear();
      dispatch({ type: "forgetMyVotes" });
      return;
    }
    loadMyVotes(dealsRef.current.map((deal) => deal.id).filter((id) => !fetched.current.has(id)));
  }, [idsKey, userId, sessionPending, loadMyVotes]);

  const vote = useCallback(
    async (deal: DealCard, click: 1 | -1) => {
      if (sessionPending || inFlight.current.has(deal.id)) return;
      const goToSignIn = () => navigate({ to: "/autentificare", search: { redirect: "/" } });
      if (!userId) return goToSignIn();

      const current = stateRef.current[deal.id]?.myVote ?? 0;
      const value = nextVote(current, click);
      inFlight.current.add(deal.id);
      dispatch({ type: "seed", deals: [deal] });
      dispatch({ type: "vote", id: deal.id, click });
      try {
        const result = await castVote({ data: { dealId: deal.id, value } });
        dispatch({ type: "reconcile", id: deal.id, score: result.score, myVote: result.myVote });
      } catch (error) {
        if (voteErrorCode(error) === "unauthorized") {
          dispatch({ type: "fail", id: deal.id, message: "" });
          return goToSignIn();
        }
        dispatch({ type: "fail", id: deal.id, message: voteErrorMessage(error) });
        // The saved vote may not have loaded before this click: ask again.
        loadMyVotes([deal.id]);
      } finally {
        inFlight.current.delete(deal.id);
      }
    },
    [loadMyVotes, navigate, sessionPending, userId],
  );

  const viewOf = useCallback(
    (deal: DealCard): VoteView => {
      const entry = state[deal.id];
      return entry ?? { score: deal.score, myVote: 0, pending: false, error: null };
    },
    [state],
  );

  return { viewOf, vote };
}
