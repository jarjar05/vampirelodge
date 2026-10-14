/** The cards a person can show on their Overview. Keep in step with OverviewCard in backend/app/schemas/auth.py. */
export type OverviewCardId = "summary" | "plan" | "schedule" | "family" | "activity";

/** Where a card sits: across the top, in the wide main column, or in the narrow side column. */
export type OverviewArea = "top" | "main" | "side";

export const overviewCards: { id: OverviewCardId; label: string; area: OverviewArea }[] = [
  { id: "summary", label: "Summary tiles", area: "top" },
  { id: "plan", label: "Your plan", area: "main" },
  { id: "schedule", label: "Today's schedule", area: "main" },
  { id: "family", label: "Family workload", area: "side" },
  { id: "activity", label: "Recent activity", area: "side" },
];

export const defaultOverviewLayout: OverviewCardId[] = ["summary", "plan", "schedule", "family", "activity"];

const knownIds = new Set<string>(overviewCards.map((card) => card.id));

/** The saved layout, or the default when there is none. Unknown ids from an older version are dropped. */
export function resolveOverviewLayout(saved: readonly string[] | null | undefined): OverviewCardId[] {
  if (!saved) return defaultOverviewLayout;
  return saved.filter((id): id is OverviewCardId => knownIds.has(id));
}

export const areaOf = (id: OverviewCardId): OverviewArea => overviewCards.find((card) => card.id === id)?.area ?? "main";
