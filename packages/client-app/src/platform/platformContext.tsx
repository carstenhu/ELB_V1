/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import type { AppPlatform } from "./platformTypes";

const PlatformContext = createContext<AppPlatform | null>(null);

export function PlatformProvider(props: { platform: AppPlatform; children: ReactNode }) {
  return <PlatformContext.Provider value={props.platform}>{props.children}</PlatformContext.Provider>;
}

export function usePlatform(): AppPlatform {
  const platform = useContext(PlatformContext);
  if (!platform) {
    throw new Error("App platform not provided.");
  }

  return platform;
}
