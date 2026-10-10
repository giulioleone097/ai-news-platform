const spreadsheetFormulaPrefix = /^[=+\-@\t\r\n]/;

export function csvCell(value: string) {
  const safeValue = spreadsheetFormulaPrefix.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}
