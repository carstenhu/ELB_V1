import { useEffect, useRef, useState } from "react";
import { configureStateServices, createSnapshot, replaceState } from "../appState";
import { usePlatform } from "../platform/platformContext";
import { useAppState } from "../useAppState";

export function useWorkspaceLifecycle(): boolean {
  const platform = usePlatform();
  const state = useAppState();
  const [hydrated, setHydrated] = useState(false);
  const firstSaveRef = useRef(true);

  useEffect(() => {
    configureStateServices({ auditSink: platform.auditSink });
  }, [platform]);

  useEffect(() => {
    let active = true;

    platform.workspaceRepository.load()
      .then((snapshot) => {
        if (!active || !snapshot) {
          return;
        }

        replaceState(snapshot);
      })
      .finally(() => {
        if (active) {
          setHydrated(true);
        }
      });

    return () => {
      active = false;
    };
  }, [platform]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (firstSaveRef.current) {
      firstSaveRef.current = false;
      return;
    }

    void platform.workspaceRepository.save(createSnapshot());
  }, [hydrated, platform, state]);

  return hydrated;
}
