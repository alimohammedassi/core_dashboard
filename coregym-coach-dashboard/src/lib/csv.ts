// CSV serialization with formula-injection hardening (API-02).
// Shared by /api/export/subscribers so the escaping rules are testable.

/**
 * Neutralizes CSV/Excel formula injection: a field beginning with =, +, -, @,
 * TAB or CR would otherwise execute as a formula when the export is opened in
 * Excel/LibreOffice. Those fields are user-controlled (client names/emails),
 * and the person opening the export is a privileged coach. The standard
 * mitigation is a leading apostrophe, which spreadsheet apps treat as text.
 * Bare \r is stripped outright (it breaks row parsing without adding content).
 */
export function csvSafeField(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value).replace(/\r/g, "");
  const guarded = /^[=+\-@\t]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}
