import { useCallback, useSyncExternalStore } from "react";

interface ProjectArchiveState {
  archivedByProjectKey: Record<string, true>;
  showArchivedProjects: boolean;
}

const STORAGE_KEY = "agents:project-archive:v1";
const DEFAULT_STATE: ProjectArchiveState = {
  archivedByProjectKey: {},
  showArchivedProjects: false,
};

let listeners: Array<() => void> = [];
let cachedRawState: string | null | undefined;
let cachedSnapshot: ProjectArchiveState = DEFAULT_STATE;

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function parsePersistedState(raw: string | null): ProjectArchiveState {
  if (!raw) return DEFAULT_STATE;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_STATE;
    }

    const record = parsed as {
      archivedByProjectKey?: unknown;
      showArchivedProjects?: unknown;
    };
    const archivedByProjectKey: Record<string, true> = {};

    if (record.archivedByProjectKey && typeof record.archivedByProjectKey === "object") {
      for (const [key, value] of Object.entries(record.archivedByProjectKey)) {
        if (typeof key !== "string" || key.trim().length === 0) continue;
        if (value === true) {
          archivedByProjectKey[key] = true;
        }
      }
    }

    return {
      archivedByProjectKey,
      showArchivedProjects: record.showArchivedProjects === true,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function persistState(next: ProjectArchiveState): void {
  if (typeof window === "undefined") return;

  const raw = JSON.stringify(next);
  try {
    if (raw !== cachedRawState) {
      window.localStorage.setItem(STORAGE_KEY, raw);
    }
  } catch {
    // Best-effort only.
  }

  cachedRawState = raw;
  cachedSnapshot = next;
}

export function getProjectArchiveSettingsSnapshot(): ProjectArchiveState {
  if (typeof window === "undefined") return DEFAULT_STATE;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRawState) {
    return cachedSnapshot;
  }

  cachedRawState = raw;
  cachedSnapshot = parsePersistedState(raw);
  return cachedSnapshot;
}

export function isProjectArchivedForKey(projectKey: string | null): boolean {
  if (!projectKey) return false;
  return getProjectArchiveSettingsSnapshot().archivedByProjectKey[projectKey] === true;
}

export function setProjectArchivedForKey(projectKey: string): void {
  if (!projectKey || projectKey.trim().length === 0) return;

  const current = getProjectArchiveSettingsSnapshot();
  if (current.archivedByProjectKey[projectKey] === true) return;

  persistState({
    ...current,
    archivedByProjectKey: {
      ...current.archivedByProjectKey,
      [projectKey]: true,
    },
  });
  emitChange();
}

export function clearProjectArchivedForKey(projectKey: string): void {
  if (!projectKey || projectKey.trim().length === 0) return;

  const current = getProjectArchiveSettingsSnapshot();
  if (current.archivedByProjectKey[projectKey] !== true) return;

  const nextArchivedByProjectKey = { ...current.archivedByProjectKey };
  delete nextArchivedByProjectKey[projectKey];

  persistState({
    ...current,
    archivedByProjectKey: nextArchivedByProjectKey,
  });
  emitChange();
}

export function setShowArchivedProjects(nextValue: boolean): void {
  const current = getProjectArchiveSettingsSnapshot();
  if (current.showArchivedProjects === nextValue) return;

  persistState({
    ...current,
    showArchivedProjects: nextValue,
  });
  emitChange();
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener);

  if (typeof window === "undefined") {
    return () => {
      listeners = listeners.filter((entry) => entry !== listener);
    };
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      emitChange();
    }
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useProjectArchiveSettings() {
  const state = useSyncExternalStore(
    subscribe,
    getProjectArchiveSettingsSnapshot,
    () => DEFAULT_STATE,
  );

  const archiveProject = useCallback((projectKey: string) => {
    setProjectArchivedForKey(projectKey);
  }, []);

  const unarchiveProject = useCallback((projectKey: string) => {
    clearProjectArchivedForKey(projectKey);
  }, []);

  const updateShowArchivedProjects = useCallback((nextValue: boolean) => {
    setShowArchivedProjects(nextValue);
  }, []);

  return {
    archivedByProjectKey: state.archivedByProjectKey,
    showArchivedProjects: state.showArchivedProjects,
    archiveProject,
    unarchiveProject,
    setShowArchivedProjects: updateShowArchivedProjects,
  } as const;
}
