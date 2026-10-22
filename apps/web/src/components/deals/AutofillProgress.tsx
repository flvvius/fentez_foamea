import { useEffect, useState } from "react";
import { AUTOFILL_STEPS, isSlow, stepStates, type AutofillSource } from "@/lib/deals/autofill-progress";

/** Shown while the server reads a link or screenshot. Remount it (key) to restart the timeline. */
export function AutofillProgress({ source }: { source: AutofillSource }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = performance.now();
    const timer = window.setInterval(() => setElapsed(performance.now() - started), 250);
    return () => window.clearInterval(timer);
  }, []);

  const steps = AUTOFILL_STEPS[source];
  const states = stepStates(source, elapsed);
  const active = steps[states.indexOf("active")]?.label ?? "";
  const seconds = Math.floor(elapsed / 1000);

  return (
    <div className="autofill">
      <div className="autofill-bar" aria-hidden="true">
        <span />
      </div>
      <ol className="autofill-steps">
        {steps.map((step, i) => (
          <li key={step.label} data-state={states[i]}>
            <span className="autofill-mark" aria-hidden="true">
              {states[i] === "done" ? "✓" : null}
            </span>
            {step.label}
            {states[i] === "done" && <span className="sr-only"> (gata)</span>}
          </li>
        ))}
      </ol>
      <p className="autofill-meta" aria-hidden="true">
        {seconds} s
        {isSlow(elapsed) && " · Durează mai mult decât de obicei. Mai așteaptă puțin sau completează manual."}
      </p>
      {/* Only the current step is announced, so screen readers don't hear the seconds tick. */}
      <span className="sr-only" aria-live="polite">
        {active}
      </span>
    </div>
  );
}
