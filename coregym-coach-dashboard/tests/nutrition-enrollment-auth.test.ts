import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Static authorization audit for the nutrition enrollment lifecycle route
// (PATCH/DELETE /api/nutrition-enrollments/[id]) — added so coaches can
// pause/remove nutrition plans through the UI (the AI proposal flow's
// "pause it first" instruction needs it). Follows the repo's no-database
// convention from tests/ai-route-auth.test.ts: parse the source and pin the
// security flow — auth order, ownership scoping on every read AND write,
// strict status validation, 404 without existence leak, and history-safe
// delete semantics mirroring /api/program-enrollments/[id].

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROUTE = readFileSync(
  path.join(HERE, "..", "src", "app", "api", "nutrition-enrollments", "[id]", "route.ts"),
  "utf8"
);
const WORKOUT_ROUTE = readFileSync(
  path.join(HERE, "..", "src", "app", "api", "program-enrollments", "[id]", "route.ts"),
  "utf8"
);
const ACTIONS = readFileSync(
  path.join(HERE, "..", "src", "components", "subscribers", "EnrollmentActions.tsx"),
  "utf8"
);

function patchSection(src: string): string {
  const start = src.indexOf("export async function PATCH");
  const del = src.indexOf("export async function DELETE");
  assert.ok(start >= 0 && del > start, "PATCH then DELETE handlers expected");
  return src.slice(start, del);
}
function deleteSection(src: string): string {
  const del = src.indexOf("export async function DELETE");
  assert.ok(del >= 0, "DELETE handler expected");
  return src.slice(del);
}

describe("nutrition enrollment lifecycle — authorization", () => {
  it("PATCH authenticates and resolves the coach before reading the request", () => {
    const patch = patchSection(ROUTE);
    const authPos = patch.indexOf("requireCoachContext");
    const bodyPos = patch.indexOf("req.json()");
    const paramPos = patch.indexOf("await params");
    assert.ok(authPos >= 0 && authPos < bodyPos, "requireCoachContext must run before reading the body");
    assert.ok(authPos < paramPos, "requireCoachContext must run before reading route params");
  });

  it("PATCH accepts only paused/active and rejects everything else", () => {
    const patch = patchSection(ROUTE);
    assert.match(patch, /status !== "paused" && status !== "active"/, "strict status whitelist");
    assert.match(patch, /Status must be paused or active/, "400 message");
  });

  it("PATCH scopes both the ownership read and the update to the resolved coach", () => {
    const patch = patchSection(ROUTE);
    const readPos = patch.indexOf('.from("client_nutrition_enrollments")');
    const scopePos = patch.indexOf('.eq("coach_id", ctx.coachId)');
    const updatePos = patch.indexOf(".update({ status })");
    assert.ok(readPos >= 0 && scopePos > readPos, "pre-read is coach-scoped");
    assert.ok(scopePos < updatePos, "ownership check before mutation");
    const updScopePos = patch.indexOf('.eq("coach_id", ctx.coachId)', scopePos + 1);
    assert.ok(updScopePos > updatePos, "update is ownership-scoped (API-04 defense in depth)");
  });

  it("returns 404 without leaking whether a foreign enrollment exists", () => {
    const patch = patchSection(ROUTE);
    const notFound = patch.indexOf('error: "Enrollment not found"');
    const scopePos = patch.indexOf('.eq("coach_id", ctx.coachId)');
    assert.ok(notFound > scopePos, "404 only after the coach-scoped read");
    assert.ok(!/current: \$\{/.test(patch.slice(0, notFound)), "no existence detail before 404");
  });

  it("DELETE is coach-scoped on the pre-read, the cancel and the final delete", () => {
    const del = deleteSection(ROUTE);
    const authPos = del.indexOf("requireCoachContext");
    assert.ok(authPos >= 0, "DELETE requires a coach context");
    const scopes = del.split('.eq("coach_id", ctx.coachId)').length - 1;
    assert.ok(scopes >= 3, `cancel + pre-read + final delete must each be coach-scoped (found ${scopes})`);
  });

  it("DELETE is history-safe: touched enrollments are cancelled, never erased", () => {
    const del = deleteSection(ROUTE);
    assert.match(del, /change_type/, "client-modified rows count as history (regenerate parity)");
    assert.match(del, /status: "cancelled"/, "touched → cancelled, kept for history");
    assert.match(del, /prunableIds/, "only pristine future rows are pruned");
    const cancelledPos = del.indexOf('status: "cancelled"');
    const removePos = del.indexOf("ok: true, removed: true");
    assert.ok(cancelledPos >= 0 && removePos > cancelledPos, "cancel branch precedes the full-removal branch");
  });

  it("DELETE removes assignment foods before their assignments (FK order)", () => {
    const del = deleteSection(ROUTE);
    // first DELETE of foods must precede the first DELETE of assignments
    // (the opening nutrition_assignments read is a SELECT, not a delete)
    const foodsDelPos = del.indexOf('.from("nutrition_assignment_foods").delete()');
    const assignDelPos = del.indexOf('.from("nutrition_assignments").delete()');
    assert.ok(foodsDelPos >= 0, "foods delete present");
    assert.ok(assignDelPos > foodsDelPos, "foods deleted child-first");
  });

  it("mirrors the workout enrollment route's guard structure", () => {
    for (const marker of [
      "requireCoachContext",
      'error: "Coach profile not found"',
      'error: "Enrollment id is required"',
      'error: "Enrollment not found"',
      "dbError(",
    ]) {
      assert.ok(ROUTE.includes(marker), `nutrition route pins ${marker}`);
      assert.ok(WORKOUT_ROUTE.includes(marker), `workout route pins ${marker} (parity)`);
    }
  });

  it("UI actions target the right endpoint per kind", () => {
    assert.match(ACTIONS, /nutrition-enrollments/, "nutrition kind hits the nutrition endpoint");
    assert.match(ACTIONS, /program-enrollments/, "workout kind hits the workout endpoint");
    assert.match(ACTIONS, /subscribers\.nutritionEnrollmentActions/, "nutrition copy uses its i18n block");
  });
});
