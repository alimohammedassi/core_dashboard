import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isCoachOwned } from "../src/lib/ownership.ts";

describe("isCoachOwned (S5/S7 authorization boundary)", () => {
  it("accepts a row whose coach_id equals the resolved coach", () => {
    assert.equal(isCoachOwned({ coach_id: "coach-1" }, "coach-1"), true);
  });

  it("rejects another coach's row even when it exists", () => {
    assert.equal(isCoachOwned({ coach_id: "coach-2" }, "coach-1"), false);
  });

  it("rejects missing rows (never treat absence as ownership)", () => {
    assert.equal(isCoachOwned(null, "coach-1"), false);
    assert.equal(isCoachOwned(undefined, "coach-1"), false);
  });

  it("rejects rows without a coach_id field", () => {
    assert.equal(isCoachOwned({} as { coach_id?: unknown }, "coach-1"), false);
  });

  it("is strict (no coercion between distinct ids)", () => {
    assert.equal(isCoachOwned({ coach_id: "Coach-1" }, "coach-1"), false);
  });
});
