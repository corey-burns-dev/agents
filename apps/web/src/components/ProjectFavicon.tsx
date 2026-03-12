import { FolderIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { buildProjectFaviconUrl } from "~/projectFavicon";
import { useProjectFaviconOverride } from "~/projectFaviconSettings";
import { type ProjectFaviconDisplaySize, useUISettings } from "~/uiSettings";

const FAVICON_SIZE_CLASS_NAMES: Record<ProjectFaviconDisplaySize, string> = {
  small: "size-3",
  medium: "size-3.5",
  large: "size-4.5",
};

export function getProjectAvatarInitials(projectName: string): string {
  const normalized = [...projectName.trim()]
    .filter((char) => /[\p{L}\p{N}]/u.test(char))
    .slice(0, 2)
    .join("");

  return normalized.length > 0 ? normalized.toUpperCase() : "??";
}

function ProjectFaviconFallback({
  projectName,
  sizeClassName,
}: {
  projectName: string;
  sizeClassName: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`${sizeClassName} inline-flex shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/70 font-semibold text-[0.55rem] tracking-[0.08em] text-muted-foreground/90 uppercase shadow-xs/5`}
    >
      {getProjectAvatarInitials(projectName)}
    </span>
  );
}

function ProjectFaviconImage({
  cwd,
  projectName,
  sizeClassName,
  overridePath,
  overrideSetAt,
}: {
  cwd: string;
  projectName: string;
  sizeClassName: string;
  overridePath: string | null;
  overrideSetAt: number;
}) {
  const sources = useMemo(() => {
    if (overridePath) {
      return [
        buildProjectFaviconUrl({
          cwd,
          relativePath: overridePath,
          cacheBust: overrideSetAt,
        }),
        buildProjectFaviconUrl({ cwd }),
      ];
    }
    return [buildProjectFaviconUrl({ cwd })];
  }, [cwd, overridePath, overrideSetAt]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  if (status === "error") {
    return <ProjectFaviconFallback projectName={projectName} sizeClassName={sizeClassName} />;
  }

  return (
    <span className={`${sizeClassName} relative shrink-0`}>
      <FolderIcon
        className={`absolute inset-0 ${sizeClassName} text-muted-foreground/50 transition-opacity ${
          status === "loaded" ? "opacity-0" : "opacity-100"
        }`}
      />
      <img
        key={sources[sourceIndex]}
        src={sources[sourceIndex]}
        alt=""
        className={`${sizeClassName} rounded-sm object-contain transition-opacity ${
          status === "loaded" ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setStatus("loaded")}
        onError={() => {
          setSourceIndex((currentSourceIndex) => {
            if (currentSourceIndex + 1 < sources.length) {
              setStatus("loading");
              return currentSourceIndex + 1;
            }
            setStatus("error");
            return currentSourceIndex;
          });
        }}
      />
    </span>
  );
}

export function ProjectFavicon({
  cwd,
  displaySize,
  projectName,
  relativePathOverride,
  sizeClassName,
}: {
  cwd: string;
  displaySize?: ProjectFaviconDisplaySize;
  projectName?: string;
  relativePathOverride?: string | null;
  sizeClassName?: string;
}) {
  const { settings } = useUISettings();
  const { relativePath: storedOverride, setAt: storedSetAt } = useProjectFaviconOverride(cwd);
  const effectiveOverride = relativePathOverride ?? storedOverride ?? null;
  const effectiveSize = displaySize ?? settings.projectFaviconSize;
  const resolvedSizeClassName = sizeClassName ?? FAVICON_SIZE_CLASS_NAMES[effectiveSize];
  const effectiveProjectName = projectName?.trim() || cwd;

  return (
    <ProjectFaviconImage
      key={`${cwd}:${effectiveOverride ?? "__auto__"}:${storedSetAt}:${effectiveProjectName}`}
      cwd={cwd}
      projectName={effectiveProjectName}
      sizeClassName={resolvedSizeClassName}
      overridePath={effectiveOverride}
      overrideSetAt={storedSetAt}
    />
  );
}
