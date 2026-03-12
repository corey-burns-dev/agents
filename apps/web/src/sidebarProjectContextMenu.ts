import type { ProviderKind, ThreadId } from "@agents/contracts";

import {
  getCustomModelsForProvider,
  resolveAppModelSelection,
  type AppSettings,
} from "./appSettings";
import { type ProjectThreadArchiveActionId } from "./projectThreadArchiveActions";
import { PROVIDER_OPTIONS } from "./session-logic";
import type { ProjectFaviconDisplaySize } from "./uiSettings";

export type NewThreadWithProviderActionId = `new-thread-with:${ProviderKind}`;

export type ProjectContextMenuActionId =
  | ProjectThreadArchiveActionId
  | NewThreadWithProviderActionId
  | "choose-favicon"
  | "reset-favicon"
  | "archive-project"
  | "unarchive-project"
  | "copy-project-path"
  | "delete-project"
  | "toggle-archived-projects";

export interface ProjectContextMenuAction {
  kind: "action";
  id: ProjectContextMenuActionId;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
}

export interface ProjectContextMenuRadioGroup {
  kind: "radio-group";
  id: "favicon-size";
  label: string;
  value: ProjectFaviconDisplaySize;
  options: ReadonlyArray<{
    label: string;
    value: ProjectFaviconDisplaySize;
  }>;
}

export interface ProjectContextMenuSubmenu {
  kind: "submenu";
  id: string;
  label: string;
  items: ReadonlyArray<ProjectContextMenuEntry>;
}

export interface ProjectContextMenuSeparator {
  kind: "separator";
  id: string;
}

export type ProjectContextMenuEntry =
  | ProjectContextMenuAction
  | ProjectContextMenuRadioGroup
  | ProjectContextMenuSeparator
  | ProjectContextMenuSubmenu;

const ARCHIVE_LABEL_BY_ACTION_ID: Record<ProjectThreadArchiveActionId, string> = {
  "archive-all": "Archive all threads",
  "keep-3": "Keep 3 latest",
  "keep-5": "Keep 5 latest",
  "keep-8": "Keep 8 latest",
};

const PROJECT_CONTEXT_MENU_ARCHIVE_ORDER: ReadonlyArray<ProjectThreadArchiveActionId> = [
  "keep-3",
  "keep-5",
  "keep-8",
  "archive-all",
] as const;

const PROJECT_FAVICON_SIZE_MENU_OPTIONS: ReadonlyArray<{
  label: string;
  value: ProjectFaviconDisplaySize;
}> = [
  { label: "Small", value: "small" },
  { label: "Medium", value: "medium" },
  { label: "Large", value: "large" },
] as const;

export const PROJECT_CONTEXT_MENU_PROVIDER_ITEMS = PROVIDER_OPTIONS.filter(
  (option): option is (typeof PROVIDER_OPTIONS)[number] & { available: true } => option.available,
);

export function newThreadWithProviderActionId(
  provider: ProviderKind,
): NewThreadWithProviderActionId {
  return `new-thread-with:${provider}`;
}

export function isNewThreadWithProviderActionId(
  value: string | null | undefined,
): value is NewThreadWithProviderActionId {
  return PROJECT_CONTEXT_MENU_PROVIDER_ITEMS.some(
    (option) => value === newThreadWithProviderActionId(option.value),
  );
}

export function providerFromNewThreadActionId(
  actionId: NewThreadWithProviderActionId,
): ProviderKind {
  return actionId.slice("new-thread-with:".length) as ProviderKind;
}

export function buildProjectContextMenuEntries(input: {
  hasFaviconOverride: boolean;
  isArchived: boolean;
  projectFaviconSize: ProjectFaviconDisplaySize;
}): ReadonlyArray<ProjectContextMenuEntry> {
  return [
    {
      kind: "submenu",
      id: "archive-threads",
      label: "Archive threads",
      items: PROJECT_CONTEXT_MENU_ARCHIVE_ORDER.map((actionId) => ({
        kind: "action",
        id: actionId,
        label: ARCHIVE_LABEL_BY_ACTION_ID[actionId],
      })),
    },
    {
      kind: "submenu",
      id: "favicon",
      label: "Favicon",
      items: [
        {
          kind: "action",
          id: "choose-favicon",
          label: "Choose favicon...",
        },
        {
          kind: "action",
          id: "reset-favicon",
          label: "Use auto-detected favicon",
          disabled: !input.hasFaviconOverride,
        },
        {
          kind: "separator",
          id: "favicon-separator",
        },
        {
          kind: "radio-group",
          id: "favicon-size",
          label: "Favicon size",
          value: input.projectFaviconSize,
          options: PROJECT_FAVICON_SIZE_MENU_OPTIONS,
        },
      ],
    },
    {
      kind: "submenu",
      id: "new-thread-with",
      label: "Open new thread with...",
      items: PROJECT_CONTEXT_MENU_PROVIDER_ITEMS.map((option) => ({
        kind: "action",
        id: newThreadWithProviderActionId(option.value),
        label: option.label,
      })),
    },
    {
      kind: "action",
      id: "copy-project-path",
      label: "Copy project path",
    },
    {
      kind: "action",
      id: input.isArchived ? "unarchive-project" : "archive-project",
      label: input.isArchived ? "Unarchive project" : "Archive project",
    },
    {
      kind: "separator",
      id: "danger-separator",
    },
    {
      kind: "action",
      id: "delete-project",
      label: "Delete project",
      destructive: true,
    },
  ];
}

export function buildProjectsListContextMenuEntries(input: {
  showArchivedProjects: boolean;
}): ReadonlyArray<ProjectContextMenuEntry> {
  return [
    {
      kind: "action",
      id: "toggle-archived-projects",
      label: input.showArchivedProjects ? "Hide archived projects" : "Show archived projects",
    },
  ];
}

export function resolveProjectProviderShortcut(input: {
  provider: ProviderKind;
  existingDraftThreadId: ThreadId | null;
  newDraftThreadId: ThreadId;
  settings: AppSettings;
}): {
  provider: ProviderKind;
  model: string;
  shouldReuseExistingDraft: boolean;
  threadId: ThreadId;
} {
  return {
    provider: input.provider,
    model: resolveAppModelSelection(
      input.provider,
      getCustomModelsForProvider(input.settings, input.provider),
      null,
    ),
    shouldReuseExistingDraft: input.existingDraftThreadId !== null,
    threadId: input.existingDraftThreadId ?? input.newDraftThreadId,
  };
}
