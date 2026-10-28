import { DEAL_TYPE_LABELS } from "@fentezfoamea/core";
import { priceFigure } from "@/lib/deals/deal-display";
import { SITE_URL } from "@/lib/site";
import type { DealCard } from "@/server/deals/types";

export function dealMeta(deal: DealCard) {
  const figure = priceFigure(deal);
  const price = figure.price === null ? null : `${figure.price} ${figure.unit}`;
  const title = [`${deal.title} la ${deal.restaurantName}`, price, figure.off].filter(Boolean).join(" · ");
  const description = deal.description?.trim() || `${DEAL_TYPE_LABELS[deal.dealType]} la ${deal.restaurantName}, postată și votată de comunitate pe fentez foamea.`;
  const url = `${SITE_URL}/oferta/${deal.id}`;
  const image = `${SITE_URL}/og?deal=${deal.id}`;
  return {
    meta: [
      { title: `${title} · fentez foamea` },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
