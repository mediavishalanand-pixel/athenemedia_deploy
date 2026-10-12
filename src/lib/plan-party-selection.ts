/** Choosing a party must include its plan row in the documents being created. */
export function selectPlanParty(
  selected: Record<string, boolean>,
  groupId: string,
): Record<string, boolean> {
  return { ...selected, [groupId]: true };
}