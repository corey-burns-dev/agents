import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stubBrowserEnvironment(rawState: string | null = null) {
  const storage = new Map<string, string>();
  if (rawState !== null) {
    storage.set("agents:project-archive:v1", rawState);
  }

  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });

  return { storage };
}

describe("projectArchiveSettings", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores archive state by project key", async () => {
    const { storage } = stubBrowserEnvironment();
    const { clearProjectArchivedForKey, isProjectArchivedForKey, setProjectArchivedForKey } =
      await import("./projectArchiveSettings");

    setProjectArchivedForKey("/repo");
    expect(isProjectArchivedForKey("/repo")).toBe(true);

    clearProjectArchivedForKey("/repo");
    expect(isProjectArchivedForKey("/repo")).toBe(false);

    expect(storage.get("agents:project-archive:v1")).toContain("archivedByProjectKey");
  });

  it("persists the show archived projects toggle", async () => {
    stubBrowserEnvironment();
    const { getProjectArchiveSettingsSnapshot, setShowArchivedProjects } =
      await import("./projectArchiveSettings");

    setShowArchivedProjects(true);
    expect(getProjectArchiveSettingsSnapshot().showArchivedProjects).toBe(true);

    setShowArchivedProjects(false);
    expect(getProjectArchiveSettingsSnapshot().showArchivedProjects).toBe(false);
  });
});
