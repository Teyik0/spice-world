export function hasUnknownIds(
  current: { id: string }[],
  operations: { update?: { id: string }[]; delete?: string[] },
) {
  const known = new Set(current.map(({ id }) => id));
  return [
    ...(operations.update ?? []).map(({ id }) => id),
    ...(operations.delete ?? []),
  ].some((id) => !known.has(id));
}
