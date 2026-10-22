import { OFFER_KIND_LABELS, SOURCE_LABELS, WEEKDAY_SHORT } from "@fentezfoamea/core";
import { shareOffer } from "@/lib/share";
import { bucharestWeekday, formatDistance, formatPickup, formatPrice, formatRelative, minutesUntil } from "@/lib/format";
import type { PlacedOffer } from "./explore";
import { ShareButton } from "./ShareButton";

type Props = {
  offer: PlacedOffer;
  now: Date;
  onShowVenue: (venueId: string) => void;
};

export function OfferCard({ offer, now, onShowVenue }: Readonly<Props>) {
  const closesIn = offer.pickupEnd ? minutesUntil(offer.pickupEnd, now) : null;
  const pickupStarted = offer.pickupStart ? new Date(offer.pickupStart) <= now : true;
  const closingSoon = closesIn !== null && closesIn <= 60 && pickupStarted;
  const notToday = offer.daysOfWeek?.length ? !offer.daysOfWeek.includes(bucharestWeekday(now)) : false;
  const when = schedule(offer);
  const place = placeNote(offer);

  return (
    <article className={`offer ${notToday ? "offer-off-day" : ""}`}>
      <PriceFigure offer={offer} />

      <div className="min-w-0">
        <p className="offer-kind">
          {OFFER_KIND_LABELS[offer.kind]}
          {offer.deliveryOnly && " · doar livrare"}
        </p>
        <h2 className="offer-title">{offer.title}</h2>
        <p className="offer-venue">
          {offer.venueId && offer.venueName ? (
            <button type="button" className="link-quiet" onClick={() => onShowVenue(offer.venueId!)}>
              {offer.venueName}
            </button>
          ) : (
            <span>{offer.chain ?? "În toate locațiile"}</span>
          )}
        </p>
        {place && <p className="offer-detail muted">{place}</p>}

        {when && (
          <p className="offer-detail">
            {when}
            {notToday && <span className="muted"> · nu azi</span>}
          </p>
        )}
        {offer.pickupStart && offer.pickupEnd && (
          <p className="offer-detail">
            Ridici {formatPickup(offer.pickupStart, offer.pickupEnd, now)}
            {closingSoon && <span className="urgent"> · mai ai {closesIn} min</span>}
            {checkedLongAgo(offer, now) && <span className="muted"> · verificat {formatRelative(offer.checkedAt!, now)}</span>}
          </p>
        )}
        {offer.conditions && <p className="offer-detail offer-conditions">{offer.conditions}</p>}

        <div className="offer-foot">
          {offer.available !== null && offer.available <= 5 && (
            <span className="muted">{offer.available === 1 ? "ultimul" : `mai sunt ${offer.available}`}</span>
          )}
          <span className="offer-actions">
            <ShareButton className="link-quiet share" label="Trimite" share={() => shareOffer(offer)} />
            <a className="offer-link" href={offer.url} target="_blank" rel="noopener noreferrer">
              Vezi pe {SOURCE_LABELS[offer.source]} <span aria-hidden>↗</span>
            </a>
          </span>
        </div>
      </div>
    </article>
  );
}

function PriceFigure({ offer }: Readonly<{ offer: PlacedOffer }>) {
  const wasHigher = offer.originalPrice !== null && offer.price !== null && offer.originalPrice > offer.price;
  return (
    <p className="figure">
      {offer.price === null && offer.headlinePct !== null && <span className="figure-price figure-deal">−{offer.headlinePct}%</span>}
      {offer.price === null && offer.headlinePct === null && <span className="figure-kind">{OFFER_KIND_LABELS[offer.kind]}</span>}
      {offer.price !== null && (
        <span className="figure-price">
          {formatPrice(offer.price)}
          <span className="figure-unit">lei</span>
        </span>
      )}
      {wasHigher && (
        <s className="figure-was">
          <span className="sr-only">înainte </span>
          {formatPrice(offer.originalPrice!)} lei
        </s>
      )}
      {offer.price !== null && offer.discountPct !== null && <span className="figure-off">−{offer.discountPct}%</span>}
    </p>
  );
}

const CHECK_AGE_WORTH_MENTIONING_MIN = 45;

function checkedLongAgo(offer: PlacedOffer, now: Date): boolean {
  return offer.checkedAt !== null && -minutesUntil(offer.checkedAt, now) > CHECK_AGE_WORTH_MENTIONING_MIN;
}

function placeNote(offer: PlacedOffer): string | null {
  const parts = [
    offer.distance === null ? null : formatDistance(offer.distance),
    offer.otherLocations ? `și în alte ${offer.otherLocations} locații` : null,
  ];
  return parts.filter(Boolean).join(" · ") || null;
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
