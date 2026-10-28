import { useState } from "react";
import { promptInstall, useCanInstall } from "@/lib/install-prompt";
import { useSavedVenues } from "@/lib/saved-venues";

const DISMISSED_KEY = "fentezfoamea:install-dismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) !== null;
  } catch {
    return true;
  }
}

export function InstallPrompt() {
  const canInstall = useCanInstall();
  const { ids } = useSavedVenues();
  const [dismissed, setDismissed] = useState(wasDismissed);

  if (!canInstall || ids.length === 0 || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, new Date().toISOString());
    } finally {
      setDismissed(true);
    }
  };

  return (
    <aside className="install" aria-label="Instalează aplicația">
      <p>Pune fentez foamea pe ecranul telefonului și vezi localurile salvate dintr-o atingere.</p>
      <div className="install-actions">
        <button type="button" className="btn-primary" onClick={() => void promptInstall()}>
          Instalează
        </button>
        <button type="button" className="link-quiet" onClick={dismiss}>
          Nu acum
        </button>
      </div>
    </aside>
  );
}
