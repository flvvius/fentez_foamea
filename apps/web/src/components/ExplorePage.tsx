import { useMemo } from "react";
import { decodeSnapshot, type SnapshotWire } from "@/lib/offers";
import { stateFromSearch, type ExploreSearch, type ExploreState } from "@/lib/search";
import { Explorer } from "./Explorer";

type Props = {
  wire: SnapshotWire;
  state: ExploreState;
  headline?: string;
  onChange: (next: Partial<ExploreState>) => void;
};

export function ExplorePage({ wire, state, headline, onChange }: Readonly<Props>) {
  const snapshot = useMemo(() => decodeSnapshot(wire), [wire]);
  return <Explorer snapshot={snapshot} state={state} headline={headline} onChange={onChange} />;
}

export function useExploreState(search: ExploreSearch, defaults: Partial<ExploreState> = {}): ExploreState {
  return useMemo(() => ({ ...stateFromSearch(search), ...(search.tip ? {} : defaults) }), [search, defaults]);
}
