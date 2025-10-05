export function normalizeLeadStatuses(input?: string[] | null): string[] {
  const incoming = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  incoming.forEach((status) => {
    const value = status?.toLowerCase().trim();
    if (value && !seen.has(value)) {
      normalized.push(value);
      seen.add(value);
    }
  });

  return normalized;
}

const FOLLOW_UP_STORAGE_PREFIX = 'lead-followup';

export const buildFollowUpStorageKey = (identifier: string | number) =>
  `${FOLLOW_UP_STORAGE_PREFIX}-${identifier}`;
