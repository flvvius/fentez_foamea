import { OFFER_KIND_LABELS, SOURCE_LABELS, WEEKDAY_SHORT } from "@fentezfoamea/core";
import { shareOffer } from "@/lib/share";
import { bucharestClock, bucharestWeekday, formatDistance, formatPickup, formatPrice, formatRelative, minutesUntil } from "@/lib/format";
import type { PlacedOffer } from "./explore";
import { ShareButton } from "./ShareButton";

type Props = {
  offer: PlacedOffer;
  now: Date;
  onShowVenue: (venueId: string) => void;
  saved: boolean;
  onToggleSave: (placeId: string) => void;
};

export function OfferCard({ offer, now, onShowVenue, saved, onToggleSave }: Readonly<Props>) {
  const closesIn = offer.pickupEnd ? minutesUntil(offer.pickupEnd, now) : null;
  const pickupStarted = offer.pickupStart ? new Date(offer.pickupStart) <= now : true;
  const closingSoon = closesIn !== null && closesIn <= 60 && pickupStarted;
  const notToday = offer.daysOfWeek?.length ? !offer.daysOfWeek.includes(bucharestWeekday(now)) : false;
  const overForToday = !notToday && offer.timeEnd !== null && bucharestClock(now) >= offer.timeEnd;
  const isNew = offer.firstSeenAt !== null && -minutesUntil(offer.firstSeenAt, now) < NEW_FOR_MINUTES;
  const when = schedule(offer);
  const place = placeNote(offer);
  const directions = directionsUrl(offer);

  return (
    <article className={`offer ${notToday || overForToday ? "offer-off-day" : ""}`}>
      <PriceFigure offer={offer} />

      <div className="min-w-0">
        <p className="offer-kind">
          {OFFER_KIND_LABELS[offer.kind]}
          {offer.deliveryOnly && " · doar livrare"}
          {isNew && <span className="offer-new"> · nou</span>}
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
        {(place || directions) && (
          <p className="offer-detail muted">
            {place}
            {place && directions && " · "}
            {directions && (
              <a className="link-quiet" href={directions} target="_blank" rel="noopener noreferrer">
                Traseu<span className="sr-only"> până la {offer.venueName ?? "local"} (se deschide într-o filă nouă)</span>
              </a>
            )}
          </p>
        )}

        {when && (
          <p className="offer-detail">
            {when}
            {notToday && <span className="muted"> · nu azi</span>}
            {overForToday && <span className="muted"> · s-a terminat pe azi</span>}
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
            <span className={offer.available === 1 ? "urgent" : "muted"}>{offer.available === 1 ? "ultimul" : `mai sunt ${offer.available}`}</span>
          )}
          <span className="offer-actions">
            {offer.placeId && (
              <button type="button" className="link-quiet save" aria-pressed={saved} onClick={() => onToggleSave(offer.placeId!)}>
                Salvează<span className="sr-only"> localul</span>
              </button>
            )}
            <ShareButton className="link-quiet share" label="Trimite" share={() => shareOffer(offer)} />
            <a className="offer-link" href={offer.url} target="_blank" rel="noopener noreferrer">
              {offer.kind === "surplus" ? "Rezervă în" : "Vezi pe"} {SOURCE_LABELS[offer.source]} <span aria-hidden>↗</span>
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
      {offer.price === null && offer.headlinePct === null && offer.priceCap !== null && (
        <span className="figure-price">
          <span className="figure-unit figure-prefix">sub</span>
          {formatPrice(offer.priceCap)}
          <span className="figure-unit">lei</span>
        </span>
      )}
      {offer.price === null && offer.headlinePct === null && offer.priceCap === null && <span className="figure-kind">{OFFER_KIND_LABELS[offer.kind]}</span>}
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
const NEW_FOR_MINUTES = 180;

function checkedLongAgo(offer: PlacedOffer, now: Date): boolean {
  return offer.checkedAt !== null && -minutesUntil(offer.checkedAt, now) > CHECK_AGE_WORTH_MENTIONING_MIN;
}

function directionsUrl(offer: PlacedOffer): string | null {
  if (offer.deliveryOnly || offer.lat === null || offer.lon === null) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${offer.lat},${offer.lon}`;
}

function placeNote(offer: PlacedOffer): string | null {
  const parts = [
    offer.distance === null || offer.deliveryOnly ? null : formatDistance(offer.distance),
    offer.otherLocations ? otherLocationsLabel(offer.otherLocations) : null,
    offer.alsoSoldAs?.length ? `și ca ${offer.alsoSoldAs.join(", ")}` : null,
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

function otherLocationsLabel(count: number): string {
  if (count === 1) return "și într-o altă locație";
  const lastTwo = count % 100;
  return lastTwo === 0 || lastTwo >= 20 ? `și în alte ${count} de locații` : `și în alte ${count} locații`;
}
