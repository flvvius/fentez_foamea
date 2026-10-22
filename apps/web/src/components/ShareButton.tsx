import { useEffect, useState } from "react";
import type { ShareResult } from "@/lib/share";

const DONE_LABELS: Record<ShareResult, string | null> = {
  shared: "Trimis",
  copied: "Link copiat",
  failed: null,
};

type Props = { label: string; className: string; share: () => Promise<ShareResult> };

export function ShareButton({ label, className, share }: Readonly<Props>) {
  const [status, setStatus] = useState<ShareResult | null>(null);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  return (
    <button type="button" className={className} onClick={async () => setStatus(await share())}>
      <span aria-live="polite">{(status && DONE_LABELS[status]) ?? label}</span>
    </button>
  );
}
