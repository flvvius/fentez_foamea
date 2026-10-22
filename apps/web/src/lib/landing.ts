import type { OfferKind } from "@fentezfoamea/core";

export type Landing = {
  slug: string;
  kind: OfferKind;
  title: string;
  headline: string;
  description: string;
  countNoun: [one: string, many: string];
};

export const LANDINGS: Landing[] = [
  {
    slug: "pachete-anti-risipa",
    kind: "surplus",
    countNoun: ["pachet anti-risipă", "pachete anti-risipă"],
    title: "Pachete anti-risipă în București, azi",
    headline: "Pachete anti-risipă în București, azi.",
    description:
      "Pachete cu mâncare rămasă nevândută la brutării, cofetării și restaurante din București, la o fracțiune din preț. Vezi ce poți ridica azi lângă tine.",
  },
  {
    slug: "meniul-zilei",
    kind: "daily_menu",
    countNoun: ["meniu de prânz", "meniuri de prânz"],
    title: "Meniul zilei în București, pe hartă",
    headline: "Meniul zilei în București, lângă tine.",
    description: "Meniuri de prânz și meniul zilei la restaurante din București, cu preț și program. Vezi ce e aproape de tine azi.",
  },
  {
    slug: "reduceri",
    kind: "discount",
    countNoun: ["reducere", "reduceri"],
    title: "Reduceri la mâncare în București, acum",
    headline: "Reduceri la mâncare în București, acum.",
    description: "Reduceri la restaurante, fast-food-uri și pe aplicațiile de livrare din București, adunate pe o hartă și ordonate după distanță.",
  },
  {
    slug: "oferte-1-plus-1",
    kind: "combo",
    countNoun: ["ofertă 1+1 sau combo", "oferte 1+1 și combo-uri"],
    title: "Oferte 1+1 și meniuri combo în București",
    headline: "Oferte 1+1 și combo-uri în București.",
    description: "Oferte 1+1, zile cu reducere și meniuri combo la fast-food-uri și restaurante din București, cu zilele și orele în care merg.",
  },
  {
    slug: "happy-hour",
    kind: "happy_hour",
    countNoun: ["happy hour", "happy hour-uri"],
    title: "Happy hour în București",
    headline: "Happy hour în București, azi.",
    description: "Happy hour și reduceri pe intervale orare la restaurante și baruri din București.",
  },
];

export function findLanding(slug: string): Landing | undefined {
  return LANDINGS.find((landing) => landing.slug === slug);
}
