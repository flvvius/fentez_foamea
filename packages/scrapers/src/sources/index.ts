import type { SourceId } from "@fentezfoamea/core";
import type { Source } from "../source.ts";
import { bonapp } from "./bonapp.ts";
import { citygrill } from "./citygrill.ts";
import { dominos } from "./dominos.ts";
import { glovo } from "./glovo.ts";
import { kfc } from "./kfc.ts";
import { paul } from "./paul.ts";
import { pizzahut } from "./pizzahut.ts";
import { tacobell } from "./tacobell.ts";
import { wolt } from "./wolt.ts";

export const SOURCES: Record<SourceId, Source> = {
  bonapp,
  wolt,
  glovo,
  kfc,
  pizzahut,
  tacobell,
  dominos,
  paul,
  citygrill,
};
