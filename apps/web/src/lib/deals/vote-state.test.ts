import { describe, expect, it } from "vitest";
import { initialVoteState, nextVote, voteReducer, type VoteAction, type VoteState } from "./vote-state";

const run = (state: VoteState, ...actions: VoteAction[]) => actions.reduce(voteReducer, state);
const seeded = run(initialVoteState, { type: "seed", deals: [{ id: "a", score: 10 }, { id: "b", score: 0 }] });

describe("nextVote", () => {
  it("sets a vote, switches direction, and removes on the same click", () => {
    expect(nextVote(0, 1)).toBe(1);
    expect(nextVote(0, -1)).toBe(-1);
    expect(nextVote(1, -1)).toBe(-1);
    expect(nextVote(1, 1)).toBe(0);
    expect(nextVote(-1, -1)).toBe(0);
  });
});

describe("voteReducer", () => {
  it("seeds only deals it does not track yet", () => {
    const voted = run(seeded, { type: "vote", id: "a", click: 1 });
    const again = run(voted, { type: "seed", deals: [{ id: "a", score: 99 }, { id: "c", score: 3 }] });
    expect(again.a).toBe(voted.a);
    expect(again.c).toMatchObject({ score: 3, myVote: 0 });
  });

  it("applies a vote optimistically", () => {
    const next = run(seeded, { type: "vote", id: "a", click: 1 });
    expect(next.a).toMatchObject({ score: 11, myVote: 1, pending: true, error: null });
  });

  it("moves two points when switching from up to down", () => {
    const state = run(seeded, { type: "myVotes", ids: ["a"], votes: { a: 1 }, since: {} }, { type: "vote", id: "a", click: -1 });
    expect(state.a).toMatchObject({ score: 8, myVote: -1 });
  });

  it("removes the vote when the active direction is clicked again", () => {
    const state = run(seeded, { type: "myVotes", ids: ["a"], votes: { a: 1 }, since: {} }, { type: "vote", id: "a", click: 1 });
    expect(state.a).toMatchObject({ score: 9, myVote: 0, pending: true });
  });

  it("ignores clicks while a vote is in flight and for unknown deals", () => {
    const inFlight = run(seeded, { type: "vote", id: "a", click: 1 });
    expect(voteReducer(inFlight, { type: "vote", id: "a", click: -1 })).toBe(inFlight);
    expect(voteReducer(inFlight, { type: "vote", id: "zzz", click: 1 })).toBe(inFlight);
  });

  it("reconciles with the server's score and vote", () => {
    const state = run(seeded, { type: "vote", id: "a", click: 1 }, { type: "reconcile", id: "a", score: 14, myVote: 1 });
    expect(state.a).toEqual({ score: 14, myVote: 1, pending: false, error: null, rollback: null, seq: 1 });
  });

  it("reverts on failure and keeps the message", () => {
    const state = run(
      seeded,
      { type: "myVotes", ids: ["a"], votes: { a: -1 }, since: {} },
      { type: "vote", id: "a", click: 1 },
      { type: "fail", id: "a", message: "Nu am putut salva votul" },
    );
    expect(state.a).toEqual({ score: 10, myVote: -1, pending: false, error: "Nu am putut salva votul", rollback: null, seq: 1 });
  });

  it("allows another vote after a failure and clears the error", () => {
    const state = run(
      seeded,
      { type: "vote", id: "a", click: 1 },
      { type: "fail", id: "a", message: "x" },
      { type: "vote", id: "a", click: 1 },
    );
    expect(state.a).toMatchObject({ score: 11, myVote: 1, pending: true, error: null });
  });

  it("dismisses an error", () => {
    const state = run(seeded, { type: "vote", id: "a", click: 1 }, { type: "fail", id: "a", message: "x" }, { type: "dismissError", id: "a" });
    expect(state.a!.error).toBeNull();
  });

  it("loads my votes, treating missing ids as no vote, without touching a vote in flight", () => {
    const state = run(
      seeded,
      { type: "vote", id: "b", click: 1 },
      { type: "myVotes", ids: ["a", "b"], votes: { a: -1 }, since: {} },
    );
    expect(state.a!.myVote).toBe(-1);
    expect(state.b).toMatchObject({ myVote: 1, pending: true });
  });

  it("ignores a stale my-votes answer that arrives after the user voted and the vote was reconciled", () => {
    // The request starts while seq is 0, the user votes up, castVote answers, then the old answer lands.
    const state = run(
      seeded,
      { type: "vote", id: "a", click: 1 },
      { type: "reconcile", id: "a", score: 11, myVote: 1 },
      { type: "myVotes", ids: ["a", "b"], votes: {}, since: { a: 0, b: 0 } },
    );
    expect(state.a).toMatchObject({ score: 11, myVote: 1, seq: 1 });
    expect(state.b!.myVote).toBe(0);
  });

  it("applies a my-votes answer when nothing was voted since the request started", () => {
    const voted = run(seeded, { type: "vote", id: "a", click: 1 }, { type: "reconcile", id: "a", score: 11, myVote: 1 });
    const state = run(voted, { type: "myVotes", ids: ["a"], votes: { a: -1 }, since: { a: 1 } });
    expect(state.a!.myVote).toBe(-1);
  });

  it("returns the same state when there is no personal vote to forget", () => {
    expect(voteReducer(seeded, { type: "forgetMyVotes" })).toBe(seeded);
    expect(voteReducer(initialVoteState, { type: "forgetMyVotes" })).toBe(initialVoteState);
    const voted = run(seeded, { type: "myVotes", ids: ["a"], votes: { a: 1 }, since: {} });
    const forgotten = voteReducer(voted, { type: "forgetMyVotes" });
    expect(forgotten).not.toBe(voted);
    expect(voteReducer(forgotten, { type: "forgetMyVotes" })).toBe(forgotten);
  });

  it("forgets personal votes but keeps scores", () => {
    const state = run(seeded, { type: "myVotes", ids: ["a"], votes: { a: 1 }, since: {} }, { type: "forgetMyVotes" });
    expect(state.a).toMatchObject({ score: 10, myVote: 0 });
  });
});
