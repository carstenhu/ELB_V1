import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, PlatformProvider } from "@elb/client-app/index";
import { webPlatform } from "./webPlatform";
import "@elb/client-app/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PlatformProvider platform={webPlatform}>
      <App />
    </PlatformProvider>
  </StrictMode>
);
