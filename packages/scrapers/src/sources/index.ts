import type { SourceId } from "@fentezfoamea/core";
import type { Source } from "../source.ts";
import { bonapp } from "./bonapp.ts";

export const SOURCES: Partial<Record<SourceId, Source>> = {
  bonapp,
};
