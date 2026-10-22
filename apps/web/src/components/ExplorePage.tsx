import { useMemo } from "react";
import type { LatLon } from "@fentezfoamea/core";
import { decodeSnapshot, type SnapshotWire } from "@/lib/offers";
import { stateForPage, type ExploreSearch, type ExploreState, type PageDefaults } from "@/lib/search";
import { Explorer } from "./Explorer";
import { SiteHeader } from "./SiteHeader";

type Props = {
  wire: SnapshotWire;
  state: ExploreState;
  headline?: string;
  center?: LatLon & { name: string; slug?: string };
  onChange: (next: Partial<ExploreState>) => void;
};

export function ExplorePage({ wire, ...props }: Readonly<Props>) {
  const snapshot = useMemo(() => decodeSnapshot(wire), [wire]);
  // Every map page (/harta, zones, categories) gets the site header that links back to the feed.
  return (
    <div className="harta-page">
      <SiteHeader />
      <Explorer snapshot={snapshot} {...props} />
    </div>
  );
}

export function useExploreState(search: ExploreSearch, defaults: PageDefaults = {}): ExploreState {
  return useMemo(() => stateForPage(search, defaults), [search, defaults]);
}
