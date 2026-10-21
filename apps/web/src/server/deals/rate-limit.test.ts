import { describe, expect, it } from "vitest";
import { decideRateLimit } from "./rate-limit";

const now = new Date("2026-10-22T12:00:00Z");

describe("decideRateLimit", () => {
  it("allows while under the limit", () => {
    expect(decideRateLimit(0, 60, null, now, 60)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(decideRateLimit(59, 60, new Date(now.getTime() - 5000), now, 60).allowed).toBe(true);
  });

  it("denies at the limit and says when the blocking event ages out", () => {
    const blocking = new Date(now.getTime() - 45_000);
    expect(decideRateLimit(60, 60, blocking, now, 60)).toEqual({ allowed: false, retryAfterSeconds: 15 });
  });

  it("waits for the (count - limit + 1)-th oldest event, not the oldest", () => {
    // limit 3 with 5 events in the window: 3 must age out. The caller passes the 3rd oldest
    // (30s old), so the wait is 30s even though the oldest event expires in 5s.
    const third = new Date(now.getTime() - 30_000);
    expect(decideRateLimit(5, 3, third, now, 60).retryAfterSeconds).toBe(30);
  });

  it("rounds the wait up and never returns less than a second", () => {
    expect(decideRateLimit(5, 5, new Date(now.getTime() - 59_500), now, 60).retryAfterSeconds).toBe(1);
    expect(decideRateLimit(5, 5, new Date(now.getTime() - 61_000), now, 60).retryAfterSeconds).toBe(1);
  });

  it("works for a global budget over a long window", () => {
    const oldest = new Date(now.getTime() - 3600_000);
    expect(decideRateLimit(300, 300, oldest, now, 86_400)).toEqual({
      allowed: false,
      retryAfterSeconds: 82_800,
    });
  });
});
