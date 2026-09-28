// Ownership predicate shared by service-role API routes (framework-free so
// unit tests pin the authorization boundary). Service-role queries bypass
// RLS, so these explicit comparisons are what actually protect the data:
// a row belongs to the caller only when its coach_id equals the resolved
// coaches.id — never when it merely exists.
export function isCoachOwned(
  row: { coach_id?: unknown } | null | undefined,
  coachId: string
): boolean {
  return !!row && row.coach_id === coachId;
}
