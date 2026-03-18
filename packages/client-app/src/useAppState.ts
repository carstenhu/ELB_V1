import { useSyncExternalStore } from "react";
import { getState, subscribe } from "./appState";

export function useAppState() {
  return useSyncExternalStore(subscribe, getState, getState);
}
