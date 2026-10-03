// Unit tests for the shared pagination helpers, focused on the F-13 contract:
// subscriber pagination must respect the active search + status filter.
// Run: node --test tests/pagination.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSubscribersHref,
  clampPage,
  parsePageParam,
  sanitizeSearchTerm,
} from "../src/lib/pagination.ts";

test("buildSubscribersHref keeps canonical minimal hrefs", () => {
  assert.equal(buildSubscribersHref({}), "/dashboard/subscribers");
  assert.equal(buildSubscribersHref({ page: 1 }), "/dashboard/subscribers");
  assert.equal(buildSubscribersHref({ page: 0 }), "/dashboard/subscribers");
  assert.equal(buildSubscribersHref({ page: -3 }), "/dashboard/subscribers");
  assert.equal(buildSubscribersHref({ q: "" }), "/dashboard/subscribers");
  assert.equal(buildSubscribersHref({ status: "" }), "/dashboard/subscribers");
});

test("pager hrefs preserve BOTH the search term and the status filter", () => {
  assert.equal(
    buildSubscribersHref({ status: "active", q: "ahmed", page: 3 }),
    "/dashboard/subscribers?status=active&q=ahmed&page=3"
  );
  assert.equal(
    buildSubscribersHref({ status: "past_due", page: 2 }),
    "/dashboard/subscribers?status=past_due&page=2"
  );
  assert.equal(
    buildSubscribersHref({ q: "sara", page: 2 }),
    "/dashboard/subscribers?q=sara&page=2"
  );
});

test("filter/search changes omit the page param → server resets to page 1", () => {
  assert.equal(
    buildSubscribersHref({ status: "active", q: "ahmed" }),
    "/dashboard/subscribers?status=active&q=ahmed"
  );
  assert.equal(buildSubscribersHref({ status: null, q: "ahmed" }), "/dashboard/subscribers?q=ahmed");
  assert.equal(
    buildSubscribersHref({ status: "trialing", q: null }),
    "/dashboard/subscribers?status=trialing"
  );
});

test("clearing the search keeps the status filter", () => {
  assert.equal(
    buildSubscribersHref({ status: "active", q: null }),
    "/dashboard/subscribers?status=active"
  );
  assert.equal(buildSubscribersHref({ status: null, q: null }), "/dashboard/subscribers");
});

test("sanitizeSearchTerm strips PostgREST-ilike metacharacters and bounds length", () => {
  assert.equal(sanitizeSearchTerm("  Ahmed Hassan  "), "Ahmed Hassan");
  assert.equal(sanitizeSearchTerm("50%off(a,b)"), "50offab"); // % , ( ) removed
  assert.equal(sanitizeSearchTerm(undefined), "");
  assert.equal(sanitizeSearchTerm(null), "");
  assert.equal(sanitizeSearchTerm(42), "42");
  assert.equal(sanitizeSearchTerm("x".repeat(120)).length, 80);
  // a term that is ONLY metacharacters sanitizes to nothing → no server search
  assert.equal(sanitizeSearchTerm("%,()"), "");
});

test("parsePageParam and clampPage still behave (regression guard)", () => {
  assert.equal(parsePageParam("3"), 3);
  assert.equal(parsePageParam("bogus"), 1);
  assert.equal(parsePageParam(["7"]), 7);
  assert.equal(clampPage(99, 40), 2); // 40 items @ 20/page → 2 pages
  assert.equal(clampPage(0, 40), 1);
});
