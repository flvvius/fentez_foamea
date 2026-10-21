import { OFFER_KIND_LABELS, SOURCE_LABELS, WEEKDAY_SHORT } from "@fentezfoamea/core";
import { bucharestWeekday, formatDistance, formatPickup, formatPrice, minutesUntil } from "@/lib/format";
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
  const notToday = offer.daysOfWeek?.length ? !offer.daysOfWeek.includes(bucharestWeekday(now)) : false;

  return (
    <article className={`card ${highlighted ? "card-highlighted" : ""} ${notToday ? "card-off-day" : ""}`}>
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
          {offer.otherLocations ? <span className="muted"> · și în alte {offer.otherLocations} locații</span> : null}
        </p>

        {schedule(offer) && (
          <p className="card-when">
            {schedule(offer)}
            {notToday && <span className="off-day"> · nu azi</span>}
          </p>
        )}
        {offer.conditions && <p className="card-conditions">{offer.conditions}</p>}

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

function schedule(offer: PlacedOffer): string | null {
  const days = offer.daysOfWeek?.length && offer.daysOfWeek.length < 7 ? formatDays(offer.daysOfWeek) : null;
  const hours = offer.timeStart && offer.timeEnd ? `${offer.timeStart}–${offer.timeEnd}` : null;
  if (!days && !hours) return null;
  return [days, hours].filter(Boolean).join(", ");
}

function formatDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const contiguous = sorted.every((day, index) => index === 0 || day === sorted[index - 1]! + 1);
  if (contiguous && sorted.length > 2) return `${WEEKDAY_SHORT[sorted[0]! - 1]}–${WEEKDAY_SHORT[sorted.at(-1)! - 1]}`;
  return sorted.map((day) => WEEKDAY_SHORT[day - 1]).join(", ");
}
