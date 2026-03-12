import { ThreadId } from "@agents/contracts";
import { describe, expect, it } from "vitest";

import { getAppSettingsSnapshot } from "./appSettings";
import {
  buildProjectsListContextMenuEntries,
  buildProjectContextMenuEntries,
  resolveProjectProviderShortcut,
} from "./sidebarProjectContextMenu";

describe("sidebarProjectContextMenu", () => {
  it("builds the project menu in the expected section order", () => {
    const entries = buildProjectContextMenuEntries({
      hasFaviconOverride: true,
      isArchived: false,
      projectFaviconSize: "medium",
    });

    expect(entries.map((entry) => ("label" in entry ? entry.label : entry.kind))).toEqual([
      "Archive threads",
      "Favicon",
      "Open new thread with...",
      "Copy project path",
      "Archive project",
      "separator",
      "Delete project",
    ]);
  });

  it("includes the expected archive submenu items", () => {
    const entries = buildProjectContextMenuEntries({
      hasFaviconOverride: true,
      isArchived: false,
      projectFaviconSize: "medium",
    });
    const archiveSubmenu = entries.find(
      (entry) => entry.kind === "submenu" && entry.id === "archive-threads",
    );

    expect(archiveSubmenu?.kind).toBe("submenu");
    if (!archiveSubmenu || archiveSubmenu.kind !== "submenu") {
      throw new Error("Archive submenu missing");
    }

    expect(
      archiveSubmenu.items.filter((entry) => entry.kind === "action").map((entry) => entry.label),
    ).toEqual(["Keep 3 latest", "Keep 5 latest", "Keep 8 latest", "Archive all threads"]);
  });

  it("keeps delete project as the final destructive action", () => {
    const entries = buildProjectContextMenuEntries({
      hasFaviconOverride: true,
      isArchived: false,
      projectFaviconSize: "medium",
    });
    const finalEntry = entries.at(-1);

    expect(finalEntry).toMatchObject({
      kind: "action",
      id: "delete-project",
      destructive: true,
    });
  });

  it("disables favicon reset when no override exists", () => {
    const entries = buildProjectContextMenuEntries({
      hasFaviconOverride: false,
      isArchived: false,
      projectFaviconSize: "medium",
    });
    const faviconSubmenu = entries.find(
      (entry) => entry.kind === "submenu" && entry.id === "favicon",
    );

    expect(faviconSubmenu?.kind).toBe("submenu");
    if (!faviconSubmenu || faviconSubmenu.kind !== "submenu") {
      throw new Error("Favicon submenu missing");
    }

    const resetItem = faviconSubmenu.items.find(
      (entry) => entry.kind === "action" && entry.id === "reset-favicon",
    );

    expect(resetItem).toMatchObject({
      kind: "action",
      id: "reset-favicon",
      disabled: true,
    });
  });

  it("reuses the existing project draft for provider shortcuts", () => {
    const existingDraftThreadId = ThreadId.makeUnsafe("thread-existing");
    const unusedThreadId = ThreadId.makeUnsafe("thread-new");

    const result = resolveProjectProviderShortcut({
      provider: "gemini",
      existingDraftThreadId,
      newDraftThreadId: unusedThreadId,
      settings: getAppSettingsSnapshot(),
    });

    expect(result).toEqual({
      provider: "gemini",
      model: "gemini-2.5-pro",
      shouldReuseExistingDraft: true,
      threadId: existingDraftThreadId,
    });
  });

  it("creates a new draft target when no project draft exists", () => {
    const newDraftThreadId = ThreadId.makeUnsafe("thread-new");

    const result = resolveProjectProviderShortcut({
      provider: "claude-code",
      existingDraftThreadId: null,
      newDraftThreadId,
      settings: getAppSettingsSnapshot(),
    });

    expect(result).toEqual({
      provider: "claude-code",
      model: "claude-sonnet-4-6",
      shouldReuseExistingDraft: false,
      threadId: newDraftThreadId,
    });
  });

  it("switches between archive and unarchive labels", () => {
    const archivedEntries = buildProjectContextMenuEntries({
      hasFaviconOverride: true,
      isArchived: true,
      projectFaviconSize: "medium",
    });
    const activeEntries = buildProjectContextMenuEntries({
      hasFaviconOverride: true,
      isArchived: false,
      projectFaviconSize: "medium",
    });

    expect(
      archivedEntries.find((entry) => entry.kind === "action" && entry.id === "unarchive-project"),
    ).toBeTruthy();
    expect(
      activeEntries.find((entry) => entry.kind === "action" && entry.id === "archive-project"),
    ).toBeTruthy();
  });

  it("builds the projects list toggle entry", () => {
    expect(buildProjectsListContextMenuEntries({ showArchivedProjects: false })).toMatchObject([
      { kind: "action", id: "toggle-archived-projects", label: "Show archived projects" },
    ]);
    expect(buildProjectsListContextMenuEntries({ showArchivedProjects: true })).toMatchObject([
      { kind: "action", id: "toggle-archived-projects", label: "Hide archived projects" },
    ]);
  });
});
