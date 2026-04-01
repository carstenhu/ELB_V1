import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, PlatformProvider } from "@elb/client-app/index";
import { webPlatform } from "./webPlatform";
import { WebInstallHint } from "./pwa/WebInstallHint";
import "@elb/client-app/styles.css";
import "./pwa/pwa.css";

const CHUNK_RECOVERY_KEY = "elb-v1-chunk-recovery-reload";

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();

  // Prevent reload loops if a deployment is briefly unavailable.
  if (sessionStorage.getItem(CHUNK_RECOVERY_KEY) === "1") {
    return;
  }

  sessionStorage.setItem(CHUNK_RECOVERY_KEY, "1");
  window.location.reload();
});

window.addEventListener("error", (event) => {
  const message = event?.message ?? "";
  if (!message.includes("Failed to fetch dynamically imported module")) {
    return;
  }

  if (sessionStorage.getItem(CHUNK_RECOVERY_KEY) === "1") {
    return;
  }

  sessionStorage.setItem(CHUNK_RECOVERY_KEY, "1");
  window.location.reload();
});

window.addEventListener("pageshow", () => {
  sessionStorage.removeItem(CHUNK_RECOVERY_KEY);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PlatformProvider platform={webPlatform}>
      <WebInstallHint />
      <App />
    </PlatformProvider>
  </StrictMode>
);
