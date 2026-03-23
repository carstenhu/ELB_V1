import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, PlatformProvider } from "@elb/client-app/index";
import { webPlatform } from "./webPlatform";
import { WebInstallHint } from "./pwa/WebInstallHint";
import "@elb/client-app/styles.css";
import "./pwa/pwa.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PlatformProvider platform={webPlatform}>
      <WebInstallHint />
      <App />
    </PlatformProvider>
  </StrictMode>
);
