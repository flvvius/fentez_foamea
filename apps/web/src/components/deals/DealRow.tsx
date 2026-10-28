import { Link } from "@tanstack/react-router";
import { DEAL_CHANNEL_LABELS, DEAL_TYPE_LABELS } from "@fentezfoamea/core";
import { formatSchedule, formatValidity, priceFigure, sourceHost } from "@/lib/deals/deal-display";
import { formatRelative } from "@/lib/format";
import { shareDeal } from "@/lib/share";
import { ShareButton } from "../ShareButton";
import type { VoteEntry } from "@/lib/deals/vote-state";
import type { DealCard } from "@/server/deals/types";
import { VoteControl } from "./VoteControl";

type Props = {
  deal: DealCard;
  vote: Pick<VoteEntry, "score" | "myVote" | "pending" | "error">;
  onVote: (click: 1 | -1) => void;
  /** Render the title as a link to /oferta/<id> (feed) or plain heading (single page). */
  linkTitle?: boolean;
  /** A note above the row, e.g. "Oferta ta a fost publicată". */
  note?: string;
};

function PriceFigure({ deal }: Readonly<{ deal: DealCard }>) {
  const figure = priceFigure(deal);
  return (
    <p className="figure">
      {figure.price === null ? (
        <span className="figure-kind">{figure.fallbackLabel}</span>
      ) : (
        <span className="figure-price">
          {figure.price}
          <span className="figure-unit">{figure.unit}</span>
        </span>
      )}
      {figure.was !== null && (
        <s className="figure-was">
          <span className="sr-only">înainte </span>
          {figure.was} {figure.unit}
        </s>
      )}
      {figure.off !== null && <span className="figure-off">{figure.off}</span>}
      {figure.notADiscount && <span className="figure-none">nu e reducere</span>}
    </p>
  );
}

/** Time since posting. The server and the browser disagree by a few minutes, so the text is allowed to differ on hydration. */
function PostedAgo({ iso }: Readonly<{ iso: string }>) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {formatRelative(iso, new Date())}
    </time>
  );
}

export function DealRow({ deal, vote, onVote, linkTitle = true, note }: Readonly<Props>) {
  const schedule = formatSchedule(deal);
  const host = sourceHost(deal.sourceUrl);
  const validity = formatValidity(deal, new Date());
  const Title = linkTitle ? (
    <Link to="/oferta/$id" params={{ id: deal.id }} className="deal-title-link">
      {deal.title}
    </Link>
  ) : (
    deal.title
  );

  return (
    <article id={`deal-${deal.id}`} className="deal">
      <div className="deal-lead">
        <PriceFigure deal={deal} />
        {deal.imageUrl && (
          <img
            className="deal-thumb"
            src={deal.imageUrl}
            width={76}
            height={76}
            loading="lazy"
            decoding="async"
            alt={`Captură de ecran: ${deal.title}`}
          />
        )}
      </div>

      <div className="min-w-0">
        {note && <p className="deal-note">{note}</p>}
        <p className="offer-kind">
          {DEAL_TYPE_LABELS[deal.dealType]} · {DEAL_CHANNEL_LABELS[deal.channel]}
        </p>
        {linkTitle ? <h2 className="offer-title">{Title}</h2> : <h1 className="offer-title">{Title}</h1>}
        <p className="offer-venue">{deal.restaurantName}</p>
        {deal.description && <p className="offer-detail offer-conditions">{deal.description}</p>}
        {schedule && <p className="offer-detail">{schedule}</p>}
        <p className="offer-detail muted">{validity}</p>
        {deal.address && <p className="offer-detail muted">{deal.address}</p>}
        {deal.promoCode && (
          <p className="offer-detail">
            Cod: <code className="promo">{deal.promoCode}</code>
          </p>
        )}

        <div className="deal-foot">
          <VoteControl title={deal.title} score={vote.score} myVote={vote.myVote} pending={vote.pending} onVote={onVote} />
          <span className="offer-actions">
            <ShareButton className="link-quiet share" label="Trimite" share={() => shareDeal(deal)} />
            {host && deal.sourceUrl && (
              <a className="offer-link" href={deal.sourceUrl} target="_blank" rel="nofollow ugc noopener noreferrer">
                {host} <span aria-hidden>↗</span>
                <span className="sr-only"> (se deschide într-o filă nouă)</span>
              </a>
            )}
          </span>
        </div>
        {vote.error && (
          <p role="alert" className="vote-error">
            <span className="err-label">Eroare: </span>
            {vote.error}
          </p>
        )}
        <p className="offer-detail muted deal-meta">
          postat de {deal.submitterName ?? "un utilizator"} · <PostedAgo iso={deal.createdAt} />
        </p>
      </div>
    </article>
  );
}
