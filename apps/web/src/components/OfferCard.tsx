import { OFFER_KIND_LABELS, SOURCE_LABELS } from "@fentezfoamea/core";
import { formatDistance, formatPickup, formatPrice, minutesUntil } from "@/lib/format";
import type { PlacedOffer } from "./explore";

type Props = {
  offer: PlacedOffer;
  now: Date;
  highlighted: boolean;
  onShowVenue: (venueId: string) => void;
};

export function OfferCard({ offer, now, highlighted, onShowVenue }: Readonly<Props>) {
  const closesIn = offer.pickupEnd ? minutesUntil(offer.pickupEnd, now) : null;
  const pickupStarted = offer.pickupStart ? new Date(offer.pickupStart) <= now : true;

  return (
    <article className={`card ${highlighted ? "card-highlighted" : ""}`}>
      <div className="tag" data-kind={offer.kind}>
        {offer.price !== null ? (
          <>
            <span className="tag-price">
              {formatPrice(offer.price)}
              <small> lei</small>
            </span>
            {offer.originalPrice !== null && offer.originalPrice > offer.price && (
              <s className="tag-was">{formatPrice(offer.originalPrice)} lei</s>
            )}
          </>
        ) : (
          <span className="tag-price tag-price-text">{OFFER_KIND_LABELS[offer.kind]}</span>
        )}
        {offer.discountPct !== null && <span className="tag-off">−{offer.discountPct}%</span>}
      </div>

      <div className="min-w-0 flex-1">
        <p className="eyebrow">
          {OFFER_KIND_LABELS[offer.kind]}
          {offer.deliveryOnly && <span className="chip-mini">doar livrare</span>}
        </p>
        <h3 className="card-title">{offer.title}</h3>
        <p className="card-venue">
          {offer.venueId && offer.venueName ? (
            <button type="button" className="link-quiet" onClick={() => onShowVenue(offer.venueId!)}>
              {offer.venueName}
            </button>
          ) : (
            <span>{offer.chain ?? "În toate locațiile"}</span>
          )}
          {offer.distance !== null && <span className="muted"> · {formatDistance(offer.distance)}</span>}
        </p>

        {offer.pickupStart && offer.pickupEnd && (
          <p className={`card-when ${closesIn !== null && closesIn <= 60 && pickupStarted ? "urgent" : ""}`}>
            Ridici {formatPickup(offer.pickupStart, offer.pickupEnd, now)}
            {closesIn !== null && closesIn <= 60 && pickupStarted && <> · mai ai {closesIn} min</>}
          </p>
        )}

        <div className="card-foot">
          {offer.available !== null && offer.available <= 5 && (
            <span className="muted">{offer.available === 1 ? "ultimul" : `mai sunt ${offer.available}`}</span>
          )}
          <a className="card-link" href={offer.url} target="_blank" rel="noopener noreferrer">
            Vezi pe {SOURCE_LABELS[offer.source]} <span aria-hidden>↗</span>
          </a>
        </div>
      </div>
    </article>
  );
}
