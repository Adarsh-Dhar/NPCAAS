export const PROTOCOL_BABEL_NODE_NAMES = [
  "Vinnie_DeLuca",
  "Svetlana_Morozova",
  "Diego_Vargas",
  "The_Curator",
  "Remy_Boudreaux",
  "Silas_Dupre",
  "Papa_Kofi",
] as const;

const CANONICAL_BY_NORMALIZED = new Map(
  PROTOCOL_BABEL_NODE_NAMES.map((name) => [normalizeNpcName(name), name]),
);

export function normalizeNpcName(name: string) {
  return String(name).trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export function toCanonicalNpcName(name: string) {
  const normalized = normalizeNpcName(name);
  return CANONICAL_BY_NORMALIZED.get(normalized) ?? name;
}

export function formatNpcDisplayName(name: string) {
  return toCanonicalNpcName(name).replace(/_/g, "-");
}
