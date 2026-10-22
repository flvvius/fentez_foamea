import { isStillAvailable } from "@/components/explore";
import type { Offer } from "@/lib/offers";
import { offerLink, offerShareText } from "@/lib/share";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const FEED_SIZE = 40;

export function bagsFeed(offers: Offer[], now: Date): string {
  const bags = offers
    .filter((offer) => offer.kind === "surplus" && isStillAvailable(offer, now))
    .sort((a, b) => (b.firstSeenAt ?? "").localeCompare(a.firstSeenAt ?? ""))
    .slice(0, FEED_SIZE);
  const items = bags.map(
    (bag) => `    <item>
      <title>${escapeXml(offerShareText(bag, now))}</title>
      <link>${escapeXml(offerLink(SITE_URL, bag.id))}</link>
      <guid isPermaLink="false">${bag.id}</guid>${bag.firstSeenAt ? `\n      <pubDate>${new Date(bag.firstSeenAt).toUTCString()}</pubDate>` : ""}
    </item>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(`Pachete anti-risipă noi în București · ${SITE_NAME}`)}</title>
    <link>${SITE_URL}/pachete-anti-risipa</link>
    <description>Pachete cu mâncare rămasă, la preț redus, apărute de curând în București.</description>
    <language>ro</language>
${items.join("\n")}
  </channel>
</rss>
`;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
