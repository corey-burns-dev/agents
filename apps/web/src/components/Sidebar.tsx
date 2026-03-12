import {
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_RUNTIME_MODE,
  type DesktopUpdateState,
  type GitStatusResult,
  type ProjectId,
  type ProviderKind,
  type ResolvedKeybindingsConfig,
  ThreadId,
} from "@agents/contracts";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { isNonEmpty as isNonEmptyString } from "effect/String";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  GitPullRequestIcon,
  PanelLeftCloseIcon,
  PanelLeftIcon,
  PlusIcon,
  RocketIcon,
  SettingsIcon,
  SquarePenIcon,
  TerminalIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppSettings } from "../appSettings";
import { APP_STAGE_LABEL } from "../branding";
import { type DraftThreadEnvMode, useComposerDraftStore } from "../composerDraftStore";
import { isDesktopShell } from "../env";
import { useProjectThreadArchiveActions } from "../hooks/useProjectThreadArchiveActions";
import { isChatNewLocalShortcut, isChatNewShortcut, shortcutLabelForCommand } from "../keybindings";
import { gitRemoveWorktreeMutationOptions, gitStatusQueryOptions } from "../lib/gitReactQuery";
import { serverConfigQueryOptions } from "../lib/serverReactQuery";
import { cn, newCommandId, newProjectId, newThreadId } from "../lib/utils";
import { readNativeApi } from "../nativeApi";
import { useProjectArchiveSettings } from "../projectArchiveSettings";
import {
  clearProjectFaviconOverrideForKey,
  getProjectFaviconOverrideForKey,
} from "../projectFaviconSettings";
import { isProjectThreadArchiveActionId } from "../projectThreadArchiveActions";
import { derivePendingApprovals } from "../session-logic";
import {
  buildProjectsListContextMenuEntries,
  buildProjectContextMenuEntries,
  isNewThreadWithProviderActionId,
  providerFromNewThreadActionId,
  resolveProjectProviderShortcut,
} from "../sidebarProjectContextMenu";
import { useStore } from "../store";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import {
  buildProjectDraftThreadMap,
  buildProjectThreadList,
  resolveProjectLatestThreadTarget,
} from "../threadDrafts";
import type { Thread } from "../types";
import {
  type ProjectFaviconDisplaySize,
  type SidebarSpacingOption,
  useUISettings,
} from "../uiSettings";
import { formatWorktreePathForDisplay, getOrphanedWorktreePathForThread } from "../worktreeCleanup";
import {
  getDesktopUpdateActionError,
  getDesktopUpdateButtonTooltip,
  isDesktopUpdateButtonDisabled,
  resolveDesktopUpdateButtonAction,
  shouldHighlightDesktopUpdateError,
  shouldShowDesktopUpdateButton,
  shouldToastDesktopUpdateActionResult,
} from "./desktopUpdate.logic";
import { ProjectFavicon } from "./ProjectFavicon";
import { ProjectFaviconPickerDialog } from "./ProjectFaviconPickerDialog";
import { SidebarContextMenu } from "./SidebarContextMenu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";
import { toastManager } from "./ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const EMPTY_KEYBINDINGS: ResolvedKeybindingsConfig = [];
const THREAD_PREVIEW_LIMIT = 10;

const SIDEBAR_PROJECT_ROW_PY: Record<SidebarSpacingOption, string> = {
  compact: "py-0.5",
  default: "py-1.5",
  spacious: "py-2.5",
};

const SIDEBAR_THREAD_ROW_H: Record<SidebarSpacingOption, string> = {
  compact: "h-6",
  default: "h-7",
  spacious: "h-9",
};

const SIDEBAR_THREAD_GAP: Record<SidebarSpacingOption, string> = {
  compact: "gap-0",
  default: "gap-0",
  spacious: "gap-0.5",
};

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator === "undefined" || navigator.clipboard?.writeText === undefined) {
    throw new Error("Clipboard API unavailable.");
  }
  await navigator.clipboard.writeText(text);
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface ThreadStatusPill {
  label: "Working" | "Connecting" | "Completed" | "Pending Approval";
  colorClass: string;
  dotClass: string;
  pulse: boolean;
}

interface TerminalStatusIndicator {
  label: "Terminal process running";
  colorClass: string;
  pulse: boolean;
}

interface PrStatusIndicator {
  label: "PR open" | "PR closed" | "PR merged";
  colorClass: string;
  tooltip: string;
  url: string;
}

type ThreadPr = GitStatusResult["pr"];

function hasUnseenCompletion(thread: Thread): boolean {
  if (!thread.latestTurn?.completedAt) return false;
  const completedAt = Date.parse(thread.latestTurn.completedAt);
  if (Number.isNaN(completedAt)) return false;
  if (!thread.lastVisitedAt) return true;

  const lastVisitedAt = Date.parse(thread.lastVisitedAt);
  if (Number.isNaN(lastVisitedAt)) return true;
  return completedAt > lastVisitedAt;
}

function threadStatusPill(thread: Thread, hasPendingApprovals: boolean): ThreadStatusPill | null {
  if (hasPendingApprovals) {
    return {
      label: "Pending Approval",
      colorClass: "text-amber-600 dark:text-amber-300/90",
      dotClass: "bg-amber-500 dark:bg-amber-300/90",
      pulse: false,
    };
  }

  if (thread.session?.status === "running") {
    const provider = thread.session.provider;
    const dotClass =
      provider === "gemini"
        ? "bg-sky-400/90"
        : provider === "claude-code"
          ? "bg-amber-400/90"
          : "bg-slate-300/85";
    return {
      label: "Working",
      colorClass: "text-sky-600 dark:text-sky-300/80",
      dotClass,
      pulse: true,
    };
  }

  if (thread.session?.status === "connecting") {
    const provider = thread.session.provider;
    const dotClass =
      provider === "gemini"
        ? "bg-sky-400/90"
        : provider === "claude-code"
          ? "bg-amber-400/90"
          : "bg-slate-300/85";
    return {
      label: "Connecting",
      colorClass: "text-sky-600 dark:text-sky-300/80",
      dotClass,
      pulse: true,
    };
  }

  if (hasUnseenCompletion(thread)) {
    return {
      label: "Completed",
      colorClass: "text-emerald-600 dark:text-emerald-300/90",
      dotClass: "bg-emerald-500 dark:bg-emerald-300/90",
      pulse: false,
    };
  }

  return null;
}

const PROVIDER_TITLE_ANIM: Record<ProviderKind, string> = {
  gemini: "animate-provider-gemini",
  "claude-code": "animate-provider-claude",
  codex: "animate-provider-codex",
};

function getActiveProvider(threads: Thread[]): ProviderKind | null {
  for (const thread of threads) {
    const status = thread.session?.status;
    if (status === "running" || status === "connecting") {
      return thread.session!.provider;
    }
  }
  return null;
}

function terminalStatusFromRunningIds(
  runningTerminalIds: string[],
): TerminalStatusIndicator | null {
  if (runningTerminalIds.length === 0) {
    return null;
  }
  return {
    label: "Terminal process running",
    colorClass: "text-teal-600 dark:text-teal-300/90",
    pulse: true,
  };
}

function prStatusIndicator(pr: ThreadPr): PrStatusIndicator | null {
  if (!pr) return null;

  if (pr.state === "open") {
    return {
      label: "PR open",
      colorClass: "text-emerald-600 dark:text-emerald-300/90",
      tooltip: `#${pr.number} PR open: ${pr.title}`,
      url: pr.url,
    };
  }
  if (pr.state === "closed") {
    return {
      label: "PR closed",
      colorClass: "text-zinc-500 dark:text-zinc-400/80",
      tooltip: `#${pr.number} PR closed: ${pr.title}`,
      url: pr.url,
    };
  }
  if (pr.state === "merged") {
    return {
      label: "PR merged",
      colorClass: "text-violet-600 dark:text-violet-300/90",
      tooltip: `#${pr.number} PR merged: ${pr.title}`,
      url: pr.url,
    };
  }
  return null;
}

function _AgentsWordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("h-6 w-auto shrink-0 fill-current", className)}
      aria-label="Agents"
    >
      <g>
        {/* Top Hat */}
        <rect x="30" y="10" width="40" height="22" rx="2" />
        <rect x="22" y="32" width="56" height="6" rx="3" />

        {/* The Letter A */}
        <path
          d="M 28 85 L 50 40 L 72 85"
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Monocle */}
        <circle cx="41" cy="60" r="7" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M 48 60 L 52 60" fill="none" stroke="currentColor" strokeWidth="1.5" />

        {/* Bow Tie */}
        <path d="M 40 78 L 47 81 L 40 84 Z" />
        <path d="M 60 78 L 53 81 L 60 84 Z" />
        <circle cx="50" cy="81" r="2.5" />
      </g>
    </svg>
  );
}

export default function Sidebar() {
  const projects = useStore((store) => store.projects);
  const threads = useStore((store) => store.threads);
  const markThreadUnread = useStore((store) => store.markThreadUnread);
  const setProjectExpanded = useStore((store) => store.setProjectExpanded);
  const toggleProject = useStore((store) => store.toggleProject);
  const clearComposerDraftForThread = useComposerDraftStore((store) => store.clearThreadDraft);
  const getDraftThreadByProjectId = useComposerDraftStore(
    (store) => store.getDraftThreadByProjectId,
  );
  const getDraftThread = useComposerDraftStore((store) => store.getDraftThread);
  const setComposerDraftProvider = useComposerDraftStore((store) => store.setProvider);
  const setComposerDraftModel = useComposerDraftStore((store) => store.setModel);
  const terminalStateByThreadId = useTerminalStateStore((state) => state.terminalStateByThreadId);
  const clearTerminalState = useTerminalStateStore((state) => state.clearTerminalState);
  const setProjectDraftThreadId = useComposerDraftStore((store) => store.setProjectDraftThreadId);
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const clearProjectDraftThreadId = useComposerDraftStore(
    (store) => store.clearProjectDraftThreadId,
  );
  const clearProjectDraftThreadById = useComposerDraftStore(
    (store) => store.clearProjectDraftThreadById,
  );
  const draftThreadsByThreadId = useComposerDraftStore((store) => store.draftThreadsByThreadId);
  const projectDraftThreadIdByProjectId = useComposerDraftStore(
    (store) => store.projectDraftThreadIdByProjectId,
  );
  const navigate = useNavigate();
  const isOnSettings = useLocation({
    select: (location) => location.pathname === "/settings",
  });
  const { settings: appSettings } = useAppSettings();
  const { settings: uiSettings, updateUISettings } = useUISettings();
  const {
    archivedByProjectKey,
    archiveProject,
    setShowArchivedProjects,
    showArchivedProjects,
    unarchiveProject,
  } = useProjectArchiveSettings();
  const { isMobile, state: sidebarState, toggleSidebar } = useSidebar();
  const routeThreadId = useParams({
    strict: false,
    select: (params) => (params.threadId ? ThreadId.makeUnsafe(params.threadId) : null),
  });
  const { data: keybindings = EMPTY_KEYBINDINGS } = useQuery({
    ...serverConfigQueryOptions(),
    select: (config) => config.keybindings,
  });
  const queryClient = useQueryClient();
  const removeWorktreeMutation = useMutation(gitRemoveWorktreeMutationOptions({ queryClient }));
  const { runProjectThreadArchiveAction } = useProjectThreadArchiveActions();
  const [addingProject, setAddingProject] = useState(false);
  const [newCwd, setNewCwd] = useState("");
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [isImportingFolder, setIsImportingFolder] = useState(false);
  const [faviconPickerProjectId, setFaviconPickerProjectId] = useState<ProjectId | null>(null);
  const [sidebarContextMenuState, setSidebarContextMenuState] = useState<
    | {
        kind: "project";
        projectId: ProjectId;
        x: number;
        y: number;
      }
    | {
        kind: "projects";
        x: number;
        y: number;
      }
    | null
  >(null);
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [addProjectError, setAddProjectError] = useState<string | null>(null);
  const [renamingThreadId, setRenamingThreadId] = useState<ThreadId | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [expandedThreadListsByProject, setExpandedThreadListsByProject] = useState<
    ReadonlySet<ProjectId>
  >(() => new Set());
  const renamingCommittedRef = useRef(false);
  const renamingInputRef = useRef<HTMLInputElement | null>(null);
  const addProjectInputRef = useRef<HTMLInputElement | null>(null);
  const [desktopUpdateState, setDesktopUpdateState] = useState<DesktopUpdateState | null>(null);
  const pendingApprovalByThreadId = useMemo(() => {
    const map = new Map<ThreadId, boolean>();
    for (const thread of threads) {
      map.set(thread.id, derivePendingApprovals(thread.activities).length > 0);
    }
    return map;
  }, [threads]);
  const persistedThreadIds = useMemo(() => new Set(threads.map((thread) => thread.id)), [threads]);
  const activePersistedThread = useMemo(
    () => (routeThreadId ? (threads.find((thread) => thread.id === routeThreadId) ?? null) : null),
    [routeThreadId, threads],
  );
  const activeDraftThread = routeThreadId ? getDraftThread(routeThreadId) : null;
  const activeProjectId = activePersistedThread?.projectId ?? activeDraftThread?.projectId ?? null;
  const isSidebarCollapsed = !isMobile && sidebarState === "collapsed";
  const projectDraftThreads = useMemo(
    () =>
      buildProjectDraftThreadMap({
        draftThreadsByThreadId,
        projectDraftThreadIdByProjectId,
      }),
    [draftThreadsByThreadId, projectDraftThreadIdByProjectId],
  );
  const faviconPickerProject =
    faviconPickerProjectId === null
      ? null
      : (projects.find((project) => project.id === faviconPickerProjectId) ?? null);
  const projectContextMenuProject =
    sidebarContextMenuState === null || sidebarContextMenuState.kind !== "project"
      ? null
      : (projects.find((project) => project.id === sidebarContextMenuState.projectId) ?? null);
  const sidebarContextMenuEntries = useMemo(
    () =>
      projectContextMenuProject
        ? buildProjectContextMenuEntries({
            hasFaviconOverride:
              getProjectFaviconOverrideForKey(projectContextMenuProject.cwd) !== null,
            isArchived: archivedByProjectKey[projectContextMenuProject.cwd] === true,
            projectFaviconSize: uiSettings.projectFaviconSize,
          })
        : buildProjectsListContextMenuEntries({
            showArchivedProjects,
          }),
    [
      archivedByProjectKey,
      projectContextMenuProject,
      showArchivedProjects,
      uiSettings.projectFaviconSize,
    ],
  );
  const activeProjects = useMemo(
    () => projects.filter((project) => archivedByProjectKey[project.cwd] !== true),
    [archivedByProjectKey, projects],
  );
  const archivedProjects = useMemo(
    () => projects.filter((project) => archivedByProjectKey[project.cwd] === true),
    [archivedByProjectKey, projects],
  );
  const projectCwdById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.cwd] as const)),
    [projects],
  );
  const threadGitTargets = useMemo(
    () =>
      threads.map((thread) => ({
        threadId: thread.id,
        branch: thread.branch,
        cwd: thread.worktreePath ?? projectCwdById.get(thread.projectId) ?? null,
      })),
    [projectCwdById, threads],
  );
  const threadGitStatusCwds = useMemo(
    () => [
      ...new Set(
        threadGitTargets
          .filter((target) => target.branch !== null)
          .map((target) => target.cwd)
          .filter((cwd): cwd is string => cwd !== null),
      ),
    ],
    [threadGitTargets],
  );
  const threadGitStatusQueries = useQueries({
    queries: threadGitStatusCwds.map((cwd) => ({
      ...gitStatusQueryOptions(cwd),
      staleTime: 30_000,
      refetchInterval: 60_000,
    })),
  });
  const prByThreadId = useMemo(() => {
    const statusByCwd = new Map<string, GitStatusResult>();
    for (let index = 0; index < threadGitStatusCwds.length; index += 1) {
      const cwd = threadGitStatusCwds[index];
      if (!cwd) continue;
      const status = threadGitStatusQueries[index]?.data;
      if (status) {
        statusByCwd.set(cwd, status);
      }
    }

    const map = new Map<ThreadId, ThreadPr>();
    for (const target of threadGitTargets) {
      const status = target.cwd ? statusByCwd.get(target.cwd) : undefined;
      const branchMatches =
        target.branch !== null && status?.branch !== null && status?.branch === target.branch;
      map.set(target.threadId, branchMatches ? (status?.pr ?? null) : null);
    }
    return map;
  }, [threadGitStatusCwds, threadGitStatusQueries, threadGitTargets]);

  const openPrLink = useCallback((event: React.MouseEvent<HTMLElement>, prUrl: string) => {
    event.preventDefault();
    event.stopPropagation();

    const api = readNativeApi();
    if (!api) {
      toastManager.add({
        type: "error",
        title: "Link opening is unavailable.",
      });
      return;
    }

    void api.shell.openExternal(prUrl).catch((error) => {
      toastManager.add({
        type: "error",
        title: "Unable to open PR link",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    });
  }, []);

  const closeProjectContextMenu = useCallback(() => {
    setSidebarContextMenuState(null);
  }, []);

  const handleNewThread = useCallback(
    (
      projectId: ProjectId,
      options?: {
        branch?: string | null;
        worktreePath?: string | null;
        envMode?: DraftThreadEnvMode;
      },
    ): Promise<ThreadId> => {
      const hasBranchOption = options?.branch !== undefined;
      const hasWorktreePathOption = options?.worktreePath !== undefined;
      const hasEnvModeOption = options?.envMode !== undefined;
      const storedDraftThread = getDraftThreadByProjectId(projectId);
      if (storedDraftThread) {
        return (async () => {
          setProjectExpanded(projectId, true);
          if (hasBranchOption || hasWorktreePathOption || hasEnvModeOption) {
            setDraftThreadContext(storedDraftThread.threadId, {
              ...(hasBranchOption ? { branch: options?.branch ?? null } : {}),
              ...(hasWorktreePathOption ? { worktreePath: options?.worktreePath ?? null } : {}),
              ...(hasEnvModeOption ? { envMode: options?.envMode } : {}),
            });
          }
          setProjectDraftThreadId(projectId, storedDraftThread.threadId);
          if (routeThreadId === storedDraftThread.threadId) {
            return storedDraftThread.threadId;
          }
          await navigate({
            to: "/$threadId",
            params: { threadId: storedDraftThread.threadId },
          });
          return storedDraftThread.threadId;
        })();
      }
      clearProjectDraftThreadId(projectId);

      const activeDraftThread = routeThreadId ? getDraftThread(routeThreadId) : null;
      if (activeDraftThread && routeThreadId && activeDraftThread.projectId === projectId) {
        if (hasBranchOption || hasWorktreePathOption || hasEnvModeOption) {
          setDraftThreadContext(routeThreadId, {
            ...(hasBranchOption ? { branch: options?.branch ?? null } : {}),
            ...(hasWorktreePathOption ? { worktreePath: options?.worktreePath ?? null } : {}),
            ...(hasEnvModeOption ? { envMode: options?.envMode } : {}),
          });
        }
        setProjectExpanded(projectId, true);
        setProjectDraftThreadId(projectId, routeThreadId);
        return Promise.resolve(routeThreadId);
      }
      const threadId = newThreadId();
      const createdAt = new Date().toISOString();
      return (async () => {
        setProjectExpanded(projectId, true);
        setProjectDraftThreadId(projectId, threadId, {
          createdAt,
          branch: options?.branch ?? null,
          worktreePath: options?.worktreePath ?? null,
          envMode: options?.envMode ?? "local",
          runtimeMode: DEFAULT_RUNTIME_MODE,
        });

        await navigate({
          to: "/$threadId",
          params: { threadId },
        });
        return threadId;
      })();
    },
    [
      clearProjectDraftThreadId,
      getDraftThreadByProjectId,
      navigate,
      getDraftThread,
      routeThreadId,
      setProjectExpanded,
      setDraftThreadContext,
      setProjectDraftThreadId,
    ],
  );

  const focusMostRecentThreadForProject = useCallback(
    (projectId: ProjectId) => {
      const project = projects.find((entry) => entry.id === projectId);
      if (!project) return;

      const target = resolveProjectLatestThreadTarget({
        project,
        threads,
        projectDraftThread: projectDraftThreads.get(projectId) ?? null,
      });

      if (target.kind === "create") {
        void handleNewThread(projectId);
        return;
      }

      void navigate({
        to: "/$threadId",
        params: { threadId: target.threadId },
      });
    },
    [handleNewThread, navigate, projectDraftThreads, projects, threads],
  );

  const addProjectFromPath = useCallback(
    async (rawCwd: string) => {
      const cwd = rawCwd.trim();
      if (!cwd || isAddingProject) return;
      const api = readNativeApi();
      if (!api) return;

      setIsAddingProject(true);
      const finishAddingProject = () => {
        setIsAddingProject(false);
        setNewCwd("");
        setAddProjectError(null);
        setAddingProject(false);
      };

      const existing = projects.find((project) => project.cwd === cwd);
      if (existing) {
        focusMostRecentThreadForProject(existing.id);
        finishAddingProject();
        return;
      }

      const projectId = newProjectId();
      const createdAt = new Date().toISOString();
      const title = cwd.split(/[/\\]/).findLast(isNonEmptyString) ?? cwd;
      try {
        await api.orchestration.dispatchCommand({
          type: "project.create",
          commandId: newCommandId(),
          projectId,
          title,
          workspaceRoot: cwd,
          defaultModel: DEFAULT_MODEL_BY_PROVIDER.codex,
          createdAt,
        });
        await handleNewThread(projectId).catch(() => undefined);
      } catch (error) {
        setIsAddingProject(false);
        setAddProjectError(
          error instanceof Error ? error.message : "An error occurred while adding the project.",
        );
        return;
      }
      finishAddingProject();
    },
    [focusMostRecentThreadForProject, handleNewThread, isAddingProject, projects],
  );

  const handleAddProject = () => {
    void addProjectFromPath(newCwd);
  };

  const handlePickFolder = async () => {
    const api = readNativeApi();
    if (!api || isPickingFolder) return;
    setIsPickingFolder(true);
    let pickedPath: string | null = null;
    try {
      pickedPath = await api.dialogs.pickFolder();
    } catch {
      // Ignore picker failures and leave the current thread selection unchanged.
    }
    if (pickedPath) {
      await addProjectFromPath(pickedPath);
    } else {
      addProjectInputRef.current?.focus();
    }
    setIsPickingFolder(false);
  };

  const handleImportFolderOfProjects = useCallback(async () => {
    const api = readNativeApi();
    if (!api || isImportingFolder || !isDesktopShell) return;
    setIsImportingFolder(true);
    setAddProjectError(null);
    try {
      const pickedPath = await api.dialogs.pickFolder();
      if (!pickedPath) {
        setIsImportingFolder(false);
        return;
      }
      const childPaths = await api.dialogs.listChildDirectories(pickedPath);
      let added = 0;
      let skipped = 0;
      let firstAddedProjectId: ProjectId | null = null;
      for (const cwd of childPaths) {
        if (projects.some((p) => p.cwd === cwd)) {
          skipped += 1;
          continue;
        }
        const projectId = newProjectId();
        const createdAt = new Date().toISOString();
        const title = cwd.split(/[/\\]/).findLast(isNonEmptyString) ?? cwd;
        try {
          await api.orchestration.dispatchCommand({
            type: "project.create",
            commandId: newCommandId(),
            projectId,
            title,
            workspaceRoot: cwd,
            defaultModel: DEFAULT_MODEL_BY_PROVIDER.codex,
            createdAt,
          });
          await handleNewThread(projectId).catch(() => undefined);
          added += 1;
          if (!firstAddedProjectId) firstAddedProjectId = projectId;
        } catch {
          // Continue with other projects; toast summary at the end
        }
      }
      if (firstAddedProjectId) {
        focusMostRecentThreadForProject(firstAddedProjectId);
      }
      if (added > 0) {
        toastManager.add({
          type: "success",
          title:
            skipped > 0
              ? `Added ${added} project${added === 1 ? "" : "s"}, ${skipped} already present`
              : `Added ${added} project${added === 1 ? "" : "s"}`,
        });
      } else if (childPaths.length === 0) {
        toastManager.add({
          type: "info",
          title: "No subfolders found",
          description: "The selected folder has no immediate subdirectories.",
        });
      } else if (skipped === childPaths.length) {
        toastManager.add({
          type: "info",
          title: "All projects already added",
          description: `${skipped} folder${skipped === 1 ? "" : "s"} already in the list.`,
        });
      } else {
        toastManager.add({
          type: "error",
          title: "Could not add projects",
          description: "Adding one or more projects failed. Try adding them individually.",
        });
      }
    } finally {
      setIsImportingFolder(false);
    }
  }, [focusMostRecentThreadForProject, handleNewThread, isImportingFolder, projects]);

  const cancelRename = useCallback(() => {
    setRenamingThreadId(null);
    renamingInputRef.current = null;
  }, []);

  const commitRename = useCallback(
    async (threadId: ThreadId, newTitle: string, originalTitle: string) => {
      const finishRename = () => {
        setRenamingThreadId((current) => {
          if (current !== threadId) return current;
          renamingInputRef.current = null;
          return null;
        });
      };

      const trimmed = newTitle.trim();
      if (trimmed.length === 0) {
        toastManager.add({
          type: "warning",
          title: "Thread title cannot be empty",
        });
        finishRename();
        return;
      }
      if (trimmed === originalTitle) {
        finishRename();
        return;
      }
      const api = readNativeApi();
      if (!api) {
        finishRename();
        return;
      }
      try {
        await api.orchestration.dispatchCommand({
          type: "thread.meta.update",
          commandId: newCommandId(),
          threadId,
          title: trimmed,
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Failed to rename thread",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      }
      finishRename();
    },
    [],
  );

  const handleThreadContextMenu = useCallback(
    async (threadId: ThreadId, position: { x: number; y: number }) => {
      const api = readNativeApi();
      if (!api) return;
      const clicked = await api.contextMenu.show(
        [
          { id: "rename", label: "Rename thread" },
          { id: "mark-unread", label: "Mark unread" },
          { id: "copy-thread-id", label: "Copy Thread ID" },
          { id: "delete", label: "Delete", destructive: true },
        ],
        position,
      );
      const thread = threads.find((t) => t.id === threadId);
      if (!thread) return;

      if (clicked === "rename") {
        setRenamingThreadId(threadId);
        setRenamingTitle(thread.title);
        renamingCommittedRef.current = false;
        return;
      }

      if (clicked === "mark-unread") {
        markThreadUnread(threadId);
        return;
      }
      if (clicked === "copy-thread-id") {
        try {
          await copyTextToClipboard(threadId);
          toastManager.add({
            type: "success",
            title: "Thread ID copied",
            description: threadId,
          });
        } catch (error) {
          toastManager.add({
            type: "error",
            title: "Failed to copy thread ID",
            description: error instanceof Error ? error.message : "An error occurred.",
          });
        }
        return;
      }
      if (clicked !== "delete") return;
      if (appSettings.confirmThreadDelete) {
        const confirmed = await api.dialogs.confirm(
          [
            `Delete thread "${thread.title}"?`,
            "This permanently clears conversation history for this thread.",
          ].join("\n"),
        );
        if (!confirmed) {
          return;
        }
      }
      const threadProject = projects.find((project) => project.id === thread.projectId);
      const orphanedWorktreePath = getOrphanedWorktreePathForThread(threads, threadId);
      const displayWorktreePath = orphanedWorktreePath
        ? formatWorktreePathForDisplay(orphanedWorktreePath)
        : null;
      const canDeleteWorktree = orphanedWorktreePath !== null && threadProject !== undefined;
      const shouldDeleteWorktree =
        canDeleteWorktree &&
        (await api.dialogs.confirm(
          [
            "This thread is the only one linked to this worktree:",
            displayWorktreePath ?? orphanedWorktreePath,
            "",
            "Delete the worktree too?",
          ].join("\n"),
        ));

      if (thread.session && thread.session.status !== "closed") {
        await api.orchestration
          .dispatchCommand({
            type: "thread.session.stop",
            commandId: newCommandId(),
            threadId,
            createdAt: new Date().toISOString(),
          })
          .catch(() => undefined);
      }

      try {
        await api.terminal.close({
          threadId,
          deleteHistory: true,
        });
      } catch {
        // Terminal may already be closed
      }

      const shouldNavigateToFallback = routeThreadId === threadId;
      const fallbackThreadId = threads.find((entry) => entry.id !== threadId)?.id ?? null;
      await api.orchestration.dispatchCommand({
        type: "thread.delete",
        commandId: newCommandId(),
        threadId,
      });
      clearComposerDraftForThread(threadId);
      clearProjectDraftThreadById(thread.projectId, thread.id);
      clearTerminalState(threadId);
      if (shouldNavigateToFallback) {
        if (fallbackThreadId) {
          void navigate({
            to: "/$threadId",
            params: { threadId: fallbackThreadId },
            replace: true,
          });
        } else {
          void navigate({ to: "/", replace: true });
        }
      }

      if (!shouldDeleteWorktree || !orphanedWorktreePath || !threadProject) {
        return;
      }

      try {
        await removeWorktreeMutation.mutateAsync({
          cwd: threadProject.cwd,
          path: orphanedWorktreePath,
          force: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error removing worktree.";
        console.error("Failed to remove orphaned worktree after thread deletion", {
          threadId,
          projectCwd: threadProject.cwd,
          worktreePath: orphanedWorktreePath,
          error,
        });
        toastManager.add({
          type: "error",
          title: "Thread deleted, but worktree removal failed",
          description: `Could not remove ${displayWorktreePath ?? orphanedWorktreePath}. ${message}`,
        });
      }
    },
    [
      appSettings.confirmThreadDelete,
      clearComposerDraftForThread,
      clearProjectDraftThreadById,
      clearTerminalState,
      markThreadUnread,
      navigate,
      projects,
      removeWorktreeMutation,
      routeThreadId,
      threads,
    ],
  );

  const openProjectContextMenu = useCallback(
    (projectId: ProjectId, position: { x: number; y: number }) => {
      setSidebarContextMenuState({
        kind: "project",
        projectId,
        x: position.x,
        y: position.y,
      });
    },
    [],
  );

  const openProjectsListContextMenu = useCallback((position: { x: number; y: number }) => {
    setSidebarContextMenuState({
      kind: "projects",
      x: position.x,
      y: position.y,
    });
  }, []);

  const handleProjectContextMenuAction = useCallback(
    async (actionId: string) => {
      closeProjectContextMenu();

      if (actionId === "toggle-archived-projects") {
        setShowArchivedProjects(!showArchivedProjects);
        return;
      }

      if (!projectContextMenuProject) return;
      const project = projectContextMenuProject;

      if (actionId === "choose-favicon") {
        setFaviconPickerProjectId(project.id);
        return;
      }

      if (actionId === "reset-favicon") {
        clearProjectFaviconOverrideForKey(project.cwd);
        toastManager.add({
          type: "success",
          title: `Reset favicon for "${project.name}"`,
          description: "The sidebar will use automatic favicon detection again.",
        });
        return;
      }

      if (actionId === "copy-project-path") {
        try {
          await copyTextToClipboard(project.cwd);
          toastManager.add({
            type: "success",
            title: "Project path copied",
            description: project.cwd,
          });
        } catch (error) {
          toastManager.add({
            type: "error",
            title: "Failed to copy project path",
            description: error instanceof Error ? error.message : "An error occurred.",
          });
        }
        return;
      }

      if (actionId === "archive-project") {
        archiveProject(project.cwd);
        toastManager.add({
          type: "success",
          title: `Archived "${project.name}"`,
          description: "Turn on archived projects to view or restore it later.",
        });
        return;
      }

      if (actionId === "unarchive-project") {
        unarchiveProject(project.cwd);
        toastManager.add({
          type: "success",
          title: `Unarchived "${project.name}"`,
        });
        return;
      }

      if (isNewThreadWithProviderActionId(actionId)) {
        const provider = providerFromNewThreadActionId(actionId);
        const existingDraftThread = getDraftThreadByProjectId(project.id);
        const activeProjectDraftThread =
          routeThreadId !== null ? getDraftThread(routeThreadId) : null;
        const existingProjectDraftThreadId =
          existingDraftThread?.threadId ??
          (activeProjectDraftThread &&
          routeThreadId &&
          activeProjectDraftThread.projectId === project.id
            ? routeThreadId
            : null);
        const threadId = await handleNewThread(project.id);
        const nextDraft = resolveProjectProviderShortcut({
          provider,
          existingDraftThreadId: existingProjectDraftThreadId,
          newDraftThreadId: threadId,
          settings: appSettings,
        });
        setComposerDraftProvider(nextDraft.threadId, nextDraft.provider);
        setComposerDraftModel(nextDraft.threadId, nextDraft.model);
        return;
      }

      if (isProjectThreadArchiveActionId(actionId)) {
        await runProjectThreadArchiveAction(project, actionId);
        return;
      }

      if (actionId !== "delete-project") return;
      const api = readNativeApi();
      if (!api) return;

      const projectThreads = threads.filter((thread) => thread.projectId === project.id);
      if (projectThreads.length > 0) {
        toastManager.add({
          type: "warning",
          title: "Project is not empty",
          description: "Delete all threads in this project before deleting it.",
        });
        return;
      }

      const confirmed = await api.dialogs.confirm(
        [`Delete project "${project.name}"?`, "This action cannot be undone."].join("\n"),
      );
      if (!confirmed) return;

      try {
        const projectDraftThread = getDraftThreadByProjectId(project.id);
        if (projectDraftThread) {
          clearComposerDraftForThread(projectDraftThread.threadId);
        }
        clearProjectDraftThreadId(project.id);
        await api.orchestration.dispatchCommand({
          type: "project.delete",
          commandId: newCommandId(),
          projectId: project.id,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error deleting project.";
        console.error("Failed to remove project", { projectId: project.id, error });
        toastManager.add({
          type: "error",
          title: `Failed to delete "${project.name}"`,
          description: message,
        });
      }
    },
    [
      archiveProject,
      appSettings,
      clearComposerDraftForThread,
      clearProjectDraftThreadId,
      closeProjectContextMenu,
      getDraftThreadByProjectId,
      getDraftThread,
      handleNewThread,
      projectContextMenuProject,
      routeThreadId,
      runProjectThreadArchiveAction,
      setShowArchivedProjects,
      setComposerDraftModel,
      setComposerDraftProvider,
      showArchivedProjects,
      threads,
      unarchiveProject,
    ],
  );

  const handleProjectContextFaviconSizeChange = useCallback(
    (_groupId: string, size: string) => {
      closeProjectContextMenu();
      updateUISettings({
        projectFaviconSize: size as ProjectFaviconDisplaySize,
      });
    },
    [closeProjectContextMenu, updateUISettings],
  );

  useEffect(() => {
    if (!addingProject) return;
    const animationFrame = window.requestAnimationFrame(() => {
      addProjectInputRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [addingProject]);

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      const activeThread = routeThreadId
        ? threads.find((thread) => thread.id === routeThreadId)
        : undefined;
      const activeDraftThread = routeThreadId ? getDraftThread(routeThreadId) : null;
      if (isChatNewLocalShortcut(event, keybindings)) {
        const projectId =
          activeThread?.projectId ?? activeDraftThread?.projectId ?? projects[0]?.id;
        if (!projectId) return;
        event.preventDefault();
        void handleNewThread(projectId);
        return;
      }

      if (!isChatNewShortcut(event, keybindings)) return;
      const projectId = activeThread?.projectId ?? activeDraftThread?.projectId ?? projects[0]?.id;
      if (!projectId) return;
      event.preventDefault();
      void handleNewThread(projectId, {
        branch: activeThread?.branch ?? activeDraftThread?.branch ?? null,
        worktreePath: activeThread?.worktreePath ?? activeDraftThread?.worktreePath ?? null,
        envMode: activeDraftThread?.envMode ?? (activeThread?.worktreePath ? "worktree" : "local"),
      });
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [getDraftThread, handleNewThread, keybindings, projects, routeThreadId, threads]);

  useEffect(() => {
    if (!isDesktopShell) return;
    const bridge = window.desktopBridge;
    if (
      !bridge ||
      typeof bridge.getUpdateState !== "function" ||
      typeof bridge.onUpdateState !== "function"
    ) {
      return;
    }

    let disposed = false;
    let receivedSubscriptionUpdate = false;
    const unsubscribe = bridge.onUpdateState((nextState) => {
      if (disposed) return;
      receivedSubscriptionUpdate = true;
      setDesktopUpdateState(nextState);
    });

    void bridge
      .getUpdateState()
      .then((nextState) => {
        if (disposed || receivedSubscriptionUpdate) return;
        setDesktopUpdateState(nextState);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const showDesktopUpdateButton =
    isDesktopShell && shouldShowDesktopUpdateButton(desktopUpdateState);

  const desktopUpdateTooltip = desktopUpdateState
    ? getDesktopUpdateButtonTooltip(desktopUpdateState)
    : "Update available";

  const desktopUpdateButtonDisabled = isDesktopUpdateButtonDisabled(desktopUpdateState);
  const desktopUpdateButtonAction = desktopUpdateState
    ? resolveDesktopUpdateButtonAction(desktopUpdateState)
    : "none";
  const desktopUpdateButtonInteractivityClasses = desktopUpdateButtonDisabled
    ? "cursor-not-allowed opacity-60"
    : "hover:bg-accent hover:text-foreground";
  const desktopUpdateButtonClasses =
    desktopUpdateState?.status === "downloaded"
      ? "text-emerald-500"
      : desktopUpdateState?.status === "downloading"
        ? "text-sky-400"
        : shouldHighlightDesktopUpdateError(desktopUpdateState)
          ? "text-rose-500 animate-pulse"
          : "text-amber-500 animate-pulse";
  const newThreadShortcutLabel = useMemo(
    () =>
      shortcutLabelForCommand(keybindings, "chat.newLocal") ??
      shortcutLabelForCommand(keybindings, "chat.new"),
    [keybindings],
  );

  const handleDesktopUpdateButtonClick = useCallback(() => {
    const bridge = window.desktopBridge;
    if (!bridge || !desktopUpdateState) return;
    if (desktopUpdateButtonDisabled || desktopUpdateButtonAction === "none") return;

    if (desktopUpdateButtonAction === "download") {
      void bridge
        .downloadUpdate()
        .then((result) => {
          if (result.completed) {
            toastManager.add({
              type: "success",
              title: "Update downloaded",
              description: "Restart the app from the update button to install it.",
            });
          }
          if (!shouldToastDesktopUpdateActionResult(result)) return;
          const actionError = getDesktopUpdateActionError(result);
          if (!actionError) return;
          toastManager.add({
            type: "error",
            title: "Could not download update",
            description: actionError,
          });
        })
        .catch((error) => {
          toastManager.add({
            type: "error",
            title: "Could not start update download",
            description: error instanceof Error ? error.message : "An unexpected error occurred.",
          });
        });
      return;
    }

    if (desktopUpdateButtonAction === "install") {
      void bridge
        .installUpdate()
        .then((result) => {
          if (!shouldToastDesktopUpdateActionResult(result)) return;
          const actionError = getDesktopUpdateActionError(result);
          if (!actionError) return;
          toastManager.add({
            type: "error",
            title: "Could not install update",
            description: actionError,
          });
        })
        .catch((error) => {
          toastManager.add({
            type: "error",
            title: "Could not install update",
            description: error instanceof Error ? error.message : "An unexpected error occurred.",
          });
        });
    }
  }, [desktopUpdateButtonAction, desktopUpdateButtonDisabled, desktopUpdateState]);

  const expandThreadListForProject = useCallback((projectId: ProjectId) => {
    setExpandedThreadListsByProject((current) => {
      if (current.has(projectId)) return current;
      const next = new Set(current);
      next.add(projectId);
      return next;
    });
  }, []);

  const collapseThreadListForProject = useCallback((projectId: ProjectId) => {
    setExpandedThreadListsByProject((current) => {
      if (!current.has(projectId)) return current;
      const next = new Set(current);
      next.delete(projectId);
      return next;
    });
  }, []);

  const handleCollapsedProjectNavigation = useCallback(
    async (projectId: ProjectId) => {
      const project = projects.find((entry) => entry.id === projectId);
      if (!project) return;

      const target = resolveProjectLatestThreadTarget({
        project,
        threads,
        projectDraftThread: projectDraftThreads.get(projectId) ?? null,
      });

      if (target.kind === "create") {
        await handleNewThread(projectId);
        return;
      }

      if (routeThreadId === target.threadId) {
        return;
      }

      await navigate({
        to: "/$threadId",
        params: { threadId: target.threadId },
      });
    },
    [handleNewThread, navigate, projectDraftThreads, projects, routeThreadId, threads],
  );

  const wordmark = (
    <div className="flex items-center gap-2">
      <SidebarTrigger className="shrink-0 md:hidden" />
      <div className="flex min-w-0 flex-1 items-center gap-2 mt-2 ml-1">
        <_AgentsWordmark />
        <span className="rounded-full bg-muted/50 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
          {APP_STAGE_LABEL}
        </span>
      </div>
    </div>
  );
  const desktopSidebarToggleTooltip = isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
  const hasArchivedProjects = archivedProjects.length > 0;
  const archivedToggleTooltip = showArchivedProjects
    ? "Hide archived projects"
    : "Show archived projects";

  const renderProjectMenuItems = useCallback(
    (projectList: readonly (typeof projects)[number][]) =>
      projectList.map((project) => {
        const isArchivedProject = archivedByProjectKey[project.cwd] === true;
        const projectDraftThread = projectDraftThreads.get(project.id) ?? null;
        const projectThreads = buildProjectThreadList({
          project,
          threads,
          projectDraftThread,
        });
        const isThreadListExpanded = expandedThreadListsByProject.has(project.id);
        const unseenCompletionCount = projectThreads.filter((t) => hasUnseenCompletion(t)).length;
        const activeProvider = !project.expanded ? getActiveProvider(projectThreads) : null;
        const hasHiddenThreads = projectThreads.length > THREAD_PREVIEW_LIMIT;
        const isProjectActive = activeProjectId === project.id;
        const visibleThreads =
          hasHiddenThreads && !isThreadListExpanded
            ? projectThreads.slice(0, THREAD_PREVIEW_LIMIT)
            : projectThreads;

        if (isSidebarCollapsed) {
          return (
            <SidebarMenuItem key={project.id}>
              <SidebarMenuButton
                size="lg"
                tooltip={project.name}
                isActive={isProjectActive}
                className={`justify-center px-0 text-muted-foreground/70 hover:text-foreground group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:rounded-xl group-data-[collapsible=icon]:p-0! ${
                  isArchivedProject ? "opacity-55" : ""
                }`}
                aria-label={`Open latest thread in ${project.name}`}
                onClick={() => {
                  void handleCollapsedProjectNavigation(project.id);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  openProjectContextMenu(project.id, {
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
              >
                <ProjectFavicon
                  cwd={project.cwd}
                  projectName={project.name}
                  sizeClassName="size-8"
                />
                <span className="sr-only">{project.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        }

        return (
          <Collapsible
            key={project.id}
            className="group/collapsible"
            open={project.expanded}
            onOpenChange={(open) => {
              if (open === project.expanded) return;
              toggleProject(project.id);
            }}
          >
            <SidebarMenuItem>
              <div
                className={`group/project-header relative ${isArchivedProject ? "opacity-70" : ""}`}
              >
                <CollapsibleTrigger
                  render={
                    <SidebarMenuButton
                      size="sm"
                      className={`gap-2 px-2 ${SIDEBAR_PROJECT_ROW_PY[uiSettings.sidebarSpacing]} text-left hover:bg-transparent! hover:text-sidebar-foreground! group-hover/project-header:bg-transparent! group-hover/project-header:text-sidebar-foreground!`}
                    />
                  }
                  onContextMenu={(event) => {
                    event.preventDefault();
                    openProjectContextMenu(project.id, {
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                >
                  <ChevronRightIcon
                    className={`-ml-0.5 size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150 ${
                      project.expanded ? "rotate-90" : ""
                    }`}
                  />
                  <ProjectFavicon cwd={project.cwd} projectName={project.name} />
                  <span
                    className={`flex-1 truncate text-xs font-medium transition-colors${
                      activeProvider !== null
                        ? ` ${PROVIDER_TITLE_ANIM[activeProvider]}`
                        : " text-foreground/90"
                    }`}
                  >
                    {project.name}
                  </span>
                  {isArchivedProject && (
                    <span className="rounded-full bg-muted/70 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground/75">
                      Archived
                    </span>
                  )}
                  {!project.expanded && unseenCompletionCount > 0 && (
                    <span
                      role="img"
                      className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[9px] font-semibold tabular-nums text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300/90"
                      aria-label={`${unseenCompletionCount} finished thread${unseenCompletionCount === 1 ? "" : "s"}`}
                    >
                      {unseenCompletionCount}
                    </span>
                  )}
                </CollapsibleTrigger>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <SidebarMenuAction
                        render={
                          <button
                            type="button"
                            aria-label={`Create new thread in ${project.name}`}
                          />
                        }
                        showOnHover
                        className="top-1 right-1 size-5 rounded-md p-0 text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleNewThread(project.id);
                        }}
                      >
                        <SquarePenIcon className="size-3.5" />
                      </SidebarMenuAction>
                    }
                  />
                  <TooltipPopup side="top">
                    {newThreadShortcutLabel
                      ? `New thread (${newThreadShortcutLabel})`
                      : "New thread"}
                  </TooltipPopup>
                </Tooltip>
              </div>

              <CollapsibleContent>
                <SidebarMenuSub
                  className={`mx-1 my-0 w-full translate-x-0 ${SIDEBAR_THREAD_GAP[uiSettings.sidebarSpacing]} px-1.5 py-0`}
                >
                  {visibleThreads.map((thread) => {
                    const isActive = routeThreadId === thread.id;
                    const isPersistedThread = persistedThreadIds.has(thread.id);
                    const threadStatus = threadStatusPill(
                      thread,
                      pendingApprovalByThreadId.get(thread.id) === true,
                    );
                    const prStatus = prStatusIndicator(prByThreadId.get(thread.id) ?? null);
                    const terminalStatus = terminalStatusFromRunningIds(
                      selectThreadTerminalState(terminalStateByThreadId, thread.id)
                        .runningTerminalIds,
                    );

                    return (
                      <SidebarMenuSubItem key={thread.id} className="w-full">
                        <SidebarMenuSubButton
                          render={<button type="button" />}
                          size="sm"
                          isActive={isActive}
                          className={`${SIDEBAR_THREAD_ROW_H[uiSettings.sidebarSpacing]} w-full translate-x-0 cursor-default justify-start px-2 text-left ${
                            isActive
                              ? "bg-accent/85 text-foreground font-medium ring-1 ring-border/70 hover:bg-accent/85! hover:text-foreground! dark:bg-accent/55 dark:ring-border/50"
                              : "text-muted-foreground hover:bg-transparent! hover:text-muted-foreground!"
                          }`}
                          onClick={() => {
                            void navigate({
                              to: "/$threadId",
                              params: { threadId: thread.id },
                            });
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            void navigate({
                              to: "/$threadId",
                              params: { threadId: thread.id },
                            });
                          }}
                          onContextMenu={(event) => {
                            if (!isPersistedThread) {
                              return;
                            }
                            event.preventDefault();
                            void handleThreadContextMenu(thread.id, {
                              x: event.clientX,
                              y: event.clientY,
                            });
                          }}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                            {prStatus && (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <button
                                      type="button"
                                      aria-label={prStatus.tooltip}
                                      className={`inline-flex items-center justify-center ${prStatus.colorClass} cursor-pointer rounded-sm outline-hidden focus-visible:ring-1 focus-visible:ring-ring`}
                                      onClick={(event) => {
                                        openPrLink(event, prStatus.url);
                                      }}
                                    >
                                      <GitPullRequestIcon className="size-3" />
                                    </button>
                                  }
                                />
                                <TooltipPopup side="top">{prStatus.tooltip}</TooltipPopup>
                              </Tooltip>
                            )}
                            {threadStatus && (
                              <span
                                className={`inline-flex items-center gap-1 text-2xs ${threadStatus.colorClass}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${threadStatus.dotClass} ${
                                    threadStatus.pulse ? "animate-pulse" : ""
                                  }`}
                                />
                                {!threadStatus.pulse && (
                                  <span className="hidden md:inline">{threadStatus.label}</span>
                                )}
                              </span>
                            )}
                            {renamingThreadId === thread.id ? (
                              <input
                                ref={(el) => {
                                  if (el && renamingInputRef.current !== el) {
                                    renamingInputRef.current = el;
                                    el.focus();
                                    el.select();
                                  }
                                }}
                                className="min-w-0 flex-1 truncate rounded border border-ring bg-transparent px-0.5 text-xs outline-none"
                                value={renamingTitle}
                                onChange={(e) => setRenamingTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  e.stopPropagation();
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    renamingCommittedRef.current = true;
                                    void commitRename(thread.id, renamingTitle, thread.title);
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    renamingCommittedRef.current = true;
                                    cancelRename();
                                  }
                                }}
                                onBlur={() => {
                                  if (!renamingCommittedRef.current) {
                                    void commitRename(thread.id, renamingTitle, thread.title);
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <span className="min-w-0 flex-1 truncate text-xs">
                                {isPersistedThread ? thread.title : "New thread"}
                              </span>
                            )}
                          </div>
                          <div className="ml-auto flex shrink-0 items-center gap-1.5">
                            {terminalStatus && (
                              <span
                                role="img"
                                aria-label={terminalStatus.label}
                                title={terminalStatus.label}
                                className={`inline-flex items-center justify-center ${terminalStatus.colorClass}`}
                              >
                                <TerminalIcon
                                  className={`size-3 ${terminalStatus.pulse ? "animate-pulse" : ""}`}
                                />
                              </span>
                            )}
                            <span
                              className={`text-2xs ${
                                isActive ? "text-foreground/65" : "text-muted-foreground/40"
                              }`}
                            >
                              {formatRelativeTime(thread.createdAt)}
                            </span>
                          </div>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    );
                  })}

                  {hasHiddenThreads && !isThreadListExpanded && (
                    <SidebarMenuSubItem className="w-full">
                      <SidebarMenuSubButton
                        render={<button type="button" />}
                        size="sm"
                        className="h-6 w-full translate-x-0 justify-start px-2 text-left text-2xs text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground/80"
                        onClick={() => {
                          expandThreadListForProject(project.id);
                        }}
                      >
                        <span>Show more</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  )}
                  {hasHiddenThreads && isThreadListExpanded && (
                    <SidebarMenuSubItem className="w-full">
                      <SidebarMenuSubButton
                        render={<button type="button" />}
                        size="sm"
                        className="h-6 w-full translate-x-0 justify-start px-2 text-left text-2xs text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground/80"
                        onClick={() => {
                          collapseThreadListForProject(project.id);
                        }}
                      >
                        <span>Show less</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  )}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        );
      }),
    [
      activeProjectId,
      archivedByProjectKey,
      cancelRename,
      collapseThreadListForProject,
      commitRename,
      expandedThreadListsByProject,
      handleCollapsedProjectNavigation,
      handleNewThread,
      handleThreadContextMenu,
      navigate,
      newThreadShortcutLabel,
      openPrLink,
      openProjectContextMenu,
      pendingApprovalByThreadId,
      persistedThreadIds,
      prByThreadId,
      projectDraftThreads,
      projects,
      renamingThreadId,
      renamingTitle,
      routeThreadId,
      terminalStateByThreadId,
      threads,
      toggleProject,
      uiSettings.sidebarSpacing,
      expandThreadListForProject,
    ],
  );

  return (
    <>
      {isDesktopShell ? (
        <SidebarHeader
          className={`h-13 flex-row items-center gap-2 py-0 cursor-default select-none ${
            isSidebarCollapsed ? "justify-center px-2" : "px-4 pl-20.5"
          }`}
          data-tauri-drag-region
        >
          <SidebarTrigger className="shrink-0 md:hidden" />
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={desktopSidebarToggleTooltip}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
                  onClick={toggleSidebar}
                >
                  {isSidebarCollapsed ? (
                    <PanelLeftIcon className="size-3.5" />
                  ) : (
                    <PanelLeftCloseIcon className="size-3.5" />
                  )}
                </button>
              }
            />
            <TooltipPopup side="bottom">{desktopSidebarToggleTooltip}</TooltipPopup>
          </Tooltip>
          <div className="drag-region flex min-w-0 flex-1 items-center gap-2 pointer-events-none">
            {!isSidebarCollapsed && (
              <div className="flex min-w-0 flex-1 items-center gap-2 mt-2 ml-1">
                <_AgentsWordmark />
                <span className="rounded-full bg-muted/50 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
                  {APP_STAGE_LABEL}
                </span>
              </div>
            )}
          </div>
          {!isSidebarCollapsed && showDesktopUpdateButton && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={desktopUpdateTooltip}
                    aria-disabled={desktopUpdateButtonDisabled || undefined}
                    disabled={desktopUpdateButtonDisabled}
                    className={`inline-flex size-7 ml-auto mt-2 items-center justify-center rounded-md text-muted-foreground transition-colors ${desktopUpdateButtonInteractivityClasses} ${desktopUpdateButtonClasses}`}
                    onClick={handleDesktopUpdateButtonClick}
                  >
                    <RocketIcon className="size-3.5" />
                  </button>
                }
              />
              <TooltipPopup side="bottom">{desktopUpdateTooltip}</TooltipPopup>
            </Tooltip>
          )}
        </SidebarHeader>
      ) : (
        <SidebarHeader className="gap-3 px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-3">
          {wordmark}
        </SidebarHeader>
      )}

      <SidebarContent className="gap-0">
        <SidebarGroup className="px-2 py-2">
          {isDesktopShell && isSidebarCollapsed && (
            <div className="mb-2 flex flex-col items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label="Expand projects sidebar"
                      className="inline-flex size-8 items-center justify-center rounded-lg border border-border/60 bg-background/80 text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
                      onClick={toggleSidebar}
                    >
                      <PanelLeftIcon className="size-4" />
                    </button>
                  }
                />
                <TooltipPopup side="right">Expand projects sidebar</TooltipPopup>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={archivedToggleTooltip}
                      className="inline-flex size-8 items-center justify-center rounded-lg border border-border/60 bg-background/80 text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
                      onClick={() => {
                        setShowArchivedProjects(!showArchivedProjects);
                      }}
                    >
                      {showArchivedProjects ? (
                        <EyeOffIcon className="size-4" />
                      ) : (
                        <EyeIcon className="size-4" />
                      )}
                    </button>
                  }
                />
                <TooltipPopup side="right">{archivedToggleTooltip}</TooltipPopup>
              </Tooltip>
            </div>
          )}

          {!isSidebarCollapsed && (
            <div
              className="mb-1 flex items-center justify-between px-2"
              onContextMenu={(event) => {
                event.preventDefault();
                openProjectsListContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
            >
              <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground/60">
                Projects
              </span>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label={archivedToggleTooltip}
                        className="inline-flex size-6 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        onClick={() => {
                          setShowArchivedProjects(!showArchivedProjects);
                        }}
                      />
                    }
                  >
                    {showArchivedProjects ? (
                      <EyeOffIcon className="size-3.5" />
                    ) : (
                      <EyeIcon className="size-3.5" />
                    )}
                  </TooltipTrigger>
                  <TooltipPopup side="right">{archivedToggleTooltip}</TooltipPopup>
                </Tooltip>
                {isDesktopShell && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          aria-label={desktopSidebarToggleTooltip}
                          className="inline-flex size-6 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          onClick={toggleSidebar}
                        >
                          <PanelLeftCloseIcon className="size-3.5" />
                        </button>
                      }
                    />
                    <TooltipPopup side="right">{desktopSidebarToggleTooltip}</TooltipPopup>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Add project"
                        className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                        onClick={() => {
                          setAddingProject((previous) => !previous);
                          setAddProjectError(null);
                        }}
                      />
                    }
                  >
                    <PlusIcon className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipPopup side="right">Add project</TooltipPopup>
                </Tooltip>
              </div>
            </div>
          )}

          {addingProject && !isSidebarCollapsed && (
            <div className="mb-2 px-1">
              {isDesktopShell && (
                <div className="mb-1.5 flex gap-1.5">
                  <button
                    type="button"
                    className="flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-secondary py-1.5 text-xs text-foreground/80 transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void handlePickFolder()}
                    disabled={isPickingFolder || isAddingProject || isImportingFolder}
                  >
                    <FolderIcon className="size-3.5" />
                    {isPickingFolder ? "Picking folder..." : "Browse for folder"}
                  </button>
                  <button
                    type="button"
                    className="flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-secondary py-1.5 text-xs text-foreground/80 transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void handleImportFolderOfProjects()}
                    disabled={isPickingFolder || isAddingProject || isImportingFolder}
                  >
                    <FolderIcon className="size-3.5" />
                    {isImportingFolder ? "Importing..." : "Import folder of projects"}
                  </button>
                </div>
              )}
              <div className="flex gap-1.5">
                <input
                  ref={addProjectInputRef}
                  className={`min-w-0 flex-1 rounded-md border bg-secondary px-2 py-1 font-mono text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none ${
                    addProjectError
                      ? "border-red-500/70 focus:border-red-500"
                      : "border-border focus:border-ring"
                  }`}
                  placeholder="/path/to/project"
                  value={newCwd}
                  onChange={(event) => {
                    setNewCwd(event.target.value);
                    setAddProjectError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleAddProject();
                    if (event.key === "Escape") {
                      setAddingProject(false);
                      setAddProjectError(null);
                    }
                  }}
                />
                <button
                  type="button"
                  className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 disabled:opacity-60"
                  onClick={handleAddProject}
                  disabled={isAddingProject}
                >
                  {isAddingProject ? "Adding..." : "Add"}
                </button>
              </div>
              {addProjectError && (
                <p className="mt-1 px-0.5 text-[11px] leading-tight text-red-400">
                  {addProjectError}
                </p>
              )}
              <div className="mt-1.5 px-0.5">
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                  onClick={() => {
                    setAddingProject(false);
                    setAddProjectError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <SidebarMenu>
            {renderProjectMenuItems(activeProjects)}
            {showArchivedProjects && archivedProjects.length > 0 && !isSidebarCollapsed && (
              <div className="px-2 pt-3 pb-1">
                <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground/45">
                  Archived
                </p>
              </div>
            )}
            {showArchivedProjects ? renderProjectMenuItems(archivedProjects) : null}
          </SidebarMenu>

          {activeProjects.length === 0 && !addingProject && !isSidebarCollapsed ? (
            hasArchivedProjects && !showArchivedProjects ? (
              <div className="px-2 pt-4 text-center text-xs text-muted-foreground/60">
                All visible projects are archived.
                <br />
                Use the eye button to show them.
              </div>
            ) : (
              <div className="px-2 pt-4 text-center text-xs text-muted-foreground/60">
                No projects yet.
                <br />
                Add one to get started.
              </div>
            )
          ) : null}
        </SidebarGroup>
      </SidebarContent>

      <SidebarContextMenu
        entries={sidebarContextMenuEntries}
        onAction={handleProjectContextMenuAction}
        onClose={closeProjectContextMenu}
        onRadioGroupChange={handleProjectContextFaviconSizeChange}
        open={sidebarContextMenuState !== null}
        position={
          sidebarContextMenuState
            ? { x: sidebarContextMenuState.x, y: sidebarContextMenuState.y }
            : null
        }
      />

      <SidebarSeparator />
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="sm"
              className="gap-2 px-2 py-1.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
              tooltip={isOnSettings ? "Back" : "Settings"}
              onClick={() => {
                if (isOnSettings) {
                  if (window.history.length > 1) {
                    window.history.back();
                  } else {
                    void navigate({ to: "/" });
                  }
                  return;
                }
                void navigate({
                  to: "/settings",
                  search: { tab: "appearance" },
                });
              }}
            >
              {isOnSettings ? (
                <ArrowLeftIcon className="size-3.5" />
              ) : (
                <SettingsIcon className="size-3.5" />
              )}
              <span className="text-xs">{isOnSettings ? "Back" : "Settings"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <ProjectFaviconPickerDialog
        project={faviconPickerProject}
        open={faviconPickerProject !== null}
        onOpenChange={(open) => {
          if (!open) {
            setFaviconPickerProjectId(null);
          }
        }}
        onClearOverride={() => {
          if (!faviconPickerProject) return;
          clearProjectFaviconOverrideForKey(faviconPickerProject.cwd);
          setFaviconPickerProjectId(null);
        }}
      />
    </>
  );
}
