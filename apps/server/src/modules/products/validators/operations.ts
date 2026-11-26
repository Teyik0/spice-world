/** Updated and deleted IDs must belong to the product and appear only once. */
export function hasInvalidIds(
  current: { id: string }[],
  operations: { update?: { id: string }[]; delete?: string[] },
) {
  const known = new Set(current.map(({ id }) => id));
  const ids = [
    ...(operations.update ?? []).map(({ id }) => id),
    ...(operations.delete ?? []),
  ];
  return new Set(ids).size !== ids.length || ids.some((id) => !known.has(id));
}
