import type { VoteValue } from "@/server/deals/ranking";

type Props = {
  /** The deal title, so every button has a name of its own in a list of votes. */
  title: string;
  score: number;
  myVote: VoteValue;
  pending: boolean;
  onVote: (click: 1 | -1) => void;
};

function Chevron({ down }: Readonly<{ down?: boolean }>) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden focusable="false">
      <path
        d={down ? "M3 6l5 5 5-5" : "M3 10l5-5 5 5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function VoteControl({ title, score, myVote, pending, onVote }: Readonly<Props>) {
  return (
    <div className="vote" role="group" aria-label={`Voturi: ${title}`}>
      <button
        type="button"
        className="vote-btn"
        aria-label={`Votează pozitiv: ${title}`}
        aria-pressed={myVote === 1}
        aria-disabled={pending || undefined}
        onClick={() => onVote(1)}
      >
        <Chevron />
      </button>
      <span className="vote-score" aria-live="polite">
        {score}
      </span>
      <button
        type="button"
        className="vote-btn"
        aria-label={`Votează negativ: ${title}`}
        aria-pressed={myVote === -1}
        aria-disabled={pending || undefined}
        onClick={() => onVote(-1)}
      >
        <Chevron down />
      </button>
    </div>
  );
}
