export type HistoryItem = {
  id: string;
  timestamp: number;
  systemPrompt: string;
  userPrompt: string;
  result: string;
  model: string;
};

const MAX = 100;
const key = (slug: string) => `history:${slug}`;

export function loadHistory(slug: string): HistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key(slug));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveHistory(slug: string, items: HistoryItem[]) {
  if (typeof window === 'undefined') return;
  const trimmed = items.slice(0, MAX);
  try {
    window.localStorage.setItem(key(slug), JSON.stringify(trimmed));
  } catch {
    // quota exceeded — drop oldest half and retry once
    try {
      window.localStorage.setItem(key(slug), JSON.stringify(trimmed.slice(0, Math.floor(MAX / 2))));
    } catch {}
  }
}

export function addHistory(slug: string, item: HistoryItem): HistoryItem[] {
  const cur = loadHistory(slug);
  const next = [item, ...cur].slice(0, MAX);
  saveHistory(slug, next);
  return next;
}

export function deleteHistory(slug: string, id: string): HistoryItem[] {
  const next = loadHistory(slug).filter((i) => i.id !== id);
  saveHistory(slug, next);
  return next;
}

export function clearHistory(slug: string): HistoryItem[] {
  if (typeof window !== 'undefined') window.localStorage.removeItem(key(slug));
  return [];
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function exportHistory(slug: string): string {
  return JSON.stringify({ slug, exportedAt: Date.now(), items: loadHistory(slug) }, null, 2);
}

/** Merge imported items with existing (dedupe by id), return new list. */
export function importHistory(slug: string, json: string): HistoryItem[] {
  const parsed = JSON.parse(json);
  const incoming: HistoryItem[] = Array.isArray(parsed?.items) ? parsed.items : [];
  // basic shape filter
  const valid = incoming.filter(
    (i) =>
      i &&
      typeof i.id === 'string' &&
      typeof i.timestamp === 'number' &&
      typeof i.userPrompt === 'string' &&
      typeof i.result === 'string' &&
      typeof i.systemPrompt === 'string' &&
      typeof i.model === 'string',
  );
  const cur = loadHistory(slug);
  const seen = new Set(cur.map((i) => i.id));
  const merged = [...cur, ...valid.filter((i) => !seen.has(i.id))].sort(
    (a, b) => b.timestamp - a.timestamp,
  );
  saveHistory(slug, merged);
  return merged.slice(0, MAX);
}
