import { useMemo } from "react";
import type { LatLon } from "@fentezfoamea/core";
import { decodeSnapshot, type SnapshotWire } from "@/lib/offers";
import { searchFromState, stateFromSearch, type ExploreSearch, type ExploreState } from "@/lib/search";
import { Explorer } from "./Explorer";

type Props = {
  wire: SnapshotWire;
  state: ExploreState;
  headline?: string;
  center?: LatLon & { name: string };
  onChange: (next: Partial<ExploreState>) => void;
};

export function ExplorePage({ wire, ...props }: Readonly<Props>) {
  const snapshot = useMemo(() => decodeSnapshot(wire), [wire]);
  return <Explorer snapshot={snapshot} {...props} />;
}

export type PageDefaults = Partial<Pick<ExploreState, "kinds" | "radiusKm">>;

export function useExploreState(search: ExploreSearch, defaults: PageDefaults = {}): ExploreState {
  return useMemo(() => {
    const state = stateFromSearch(search);
    if (defaults.kinds && search.tip === undefined) state.kinds = defaults.kinds;
    if (defaults.radiusKm !== undefined && search.km === undefined) state.radiusKm = defaults.radiusKm;
    return state;
  }, [search, defaults]);
}

export function searchForPage(state: ExploreState, defaults: PageDefaults): ExploreSearch {
  const search = searchFromState(state);
  if (defaults.kinds && sameKinds(state.kinds, defaults.kinds)) delete search.tip;
  else if (defaults.kinds && !state.kinds.length) search.tip = "toate";
  if (defaults.radiusKm !== undefined) {
    if (state.radiusKm === defaults.radiusKm) delete search.km;
    else search.km = state.radiusKm ?? "oras";
  }
  return search;
}

function sameKinds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((kind) => b.includes(kind));
}
