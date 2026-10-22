export type AutofillSource = "link" | "image";
export type StepState = "done" | "active" | "waiting";
export type AutofillStep = { label: string; startsAtMs: number };

// The server reads, extracts and checks in one call, so the steps advance on a timer shaped like
// a typical run. The last step stays active until the answer arrives: nothing is marked done early.
export const AUTOFILL_STEPS: Record<AutofillSource, AutofillStep[]> = {
  link: [
    { label: "Deschidem linkul", startsAtMs: 0 },
    { label: "Citim textul postării", startsAtMs: 1500 },
    { label: "Căutăm prețul și condițiile", startsAtMs: 4000 },
    { label: "Verificăm prețul în sursă", startsAtMs: 9000 },
  ],
  image: [
    { label: "Pregătim captura", startsAtMs: 0 },
    { label: "Trimitem captura", startsAtMs: 1200 },
    { label: "Citim captura", startsAtMs: 3000 },
    { label: "Verificăm datele", startsAtMs: 9000 },
  ],
};

// An overloaded model can take 25 s or more; past this point the user is told it is still working.
export const SLOW_AFTER_MS = 15_000;

export function stepStates(source: AutofillSource, elapsedMs: number): StepState[] {
  const steps = AUTOFILL_STEPS[source];
  let active = 0;
  steps.forEach((step, i) => {
    if (elapsedMs >= step.startsAtMs) active = i;
  });
  return steps.map((_, i) => (i < active ? "done" : i === active ? "active" : "waiting"));
}

export function isSlow(elapsedMs: number): boolean {
  return elapsedMs >= SLOW_AFTER_MS;
}
