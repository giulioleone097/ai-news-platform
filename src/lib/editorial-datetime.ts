const utcDateTimeInputPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function parseUtcDateTimeInput(value: string) {
  const input = value.trim();
  if (!utcDateTimeInputPattern.test(input)) return null;

  const date = new Date(`${input}:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 16) !== input) {
    return null;
  }
  return date.toISOString();
}

export function toUtcDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
}
