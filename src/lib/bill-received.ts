export type BillReceivedFilter = "all" | "received" | "pending";

export function matchesBillReceivedFilter(received: boolean, filter: BillReceivedFilter) {
  if (filter === "all") return true;
  return filter === "received" ? received : !received;
}

export function billReceivedLabel(received: boolean) {
  return received ? "Bill received" : "Bill pending";
}