import { useEffect, useMemo, useState } from "react";

const DISMISS_KEY = "elb.v1.pwa-install-dismissed";

function isIosFamily(): boolean {
  const userAgent = navigator.userAgent || navigator.vendor || "";
  return /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneDisplay(): boolean {
  return window.matchMedia?.("(display-mode: standalone)")?.matches
    || (typeof navigator !== "undefined" && "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

export function WebInstallHint() {
  const [dismissed, setDismissed] = useState(true);
  const isIos = useMemo(() => isIosFamily(), []);

  useEffect(() => {
    if (!isIos || isStandaloneDisplay()) {
      return;
    }

    const wasDismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
    setDismissed(wasDismissed);
  }, [isIos]);

  if (!isIos || isStandaloneDisplay() || dismissed) {
    return null;
  }

  return (
    <div className="pwa-install-hint" role="status">
      <div className="pwa-install-hint__copy">
        <strong>Offline-Start auf iPhone/iPad verbessern</strong>
        <p>Teilen, dann Zum Home-Bildschirm. So startet ELB V1 stabiler und fuehlt sich mehr wie eine App an.</p>
      </div>
      <button
        type="button"
        className="secondary-button"
        onClick={() => {
          window.localStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
      >
        Verstanden
      </button>
    </div>
  );
}
