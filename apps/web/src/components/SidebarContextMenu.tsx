import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type {
  ProjectContextMenuAction,
  ProjectContextMenuEntry,
  ProjectContextMenuRadioGroup,
} from "~/sidebarProjectContextMenu";

type Position = {
  x: number;
  y: number;
};

function MenuActionItem(props: {
  entry: ProjectContextMenuAction;
  onAction: (actionId: string) => void;
}) {
  return (
    <button
      type="button"
      disabled={props.entry.disabled}
      className={`flex min-h-8 w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm transition-colors ${
        props.entry.disabled
          ? "cursor-not-allowed opacity-50"
          : props.entry.destructive
            ? "text-destructive hover:bg-accent/90"
            : "text-foreground hover:bg-accent/90"
      }`}
      onClick={() => {
        if (!props.entry.disabled) {
          props.onAction(props.entry.id);
        }
      }}
    >
      {props.entry.label}
    </button>
  );
}

function MenuRadioGroupItem(props: {
  entry: ProjectContextMenuRadioGroup;
  onRadioGroupChange: (groupId: string, value: string) => void;
}) {
  return (
    <div className="space-y-1 px-1 py-1">
      <p className="px-2 pt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
        {props.entry.label}
      </p>
      {props.entry.options.map((option) => {
        const isSelected = option.value === props.entry.value;
        return (
          <button
            key={option.value}
            type="button"
            className="flex min-h-8 w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm text-foreground transition-colors hover:bg-accent/90"
            onClick={() => props.onRadioGroupChange(props.entry.id, option.value)}
          >
            <span className="inline-flex size-4 items-center justify-center text-primary">
              {isSelected ? <CheckIcon className="size-3.5" /> : null}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function MenuEntries(props: {
  entries: ReadonlyArray<ProjectContextMenuEntry>;
  onAction: (actionId: string) => void;
  onRadioGroupChange: (groupId: string, value: string) => void;
}) {
  return (
    <>
      {props.entries.map((entry) => {
        if (entry.kind === "action") {
          return <MenuActionItem key={entry.id} entry={entry} onAction={props.onAction} />;
        }

        if (entry.kind === "separator") {
          return <div key={entry.id} className="mx-2 my-1 h-px bg-border" />;
        }

        if (entry.kind === "radio-group") {
          return (
            <MenuRadioGroupItem
              key={entry.id}
              entry={entry}
              onRadioGroupChange={props.onRadioGroupChange}
            />
          );
        }

        return (
          <div key={entry.id} className="group/submenu relative">
            <button
              type="button"
              className="flex min-h-8 w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm text-foreground transition-colors hover:bg-accent/90"
            >
              {entry.label}
              <ChevronRightIcon className="ml-auto size-4 opacity-75" />
            </button>
            <div className="pointer-events-none absolute top-0 left-full hidden pl-1 group-hover/submenu:block group-focus-within/submenu:block">
              <div className="pointer-events-auto min-w-56 rounded-lg border border-border bg-popover p-1 shadow-xl">
                <MenuEntries
                  entries={entry.items}
                  onAction={props.onAction}
                  onRadioGroupChange={props.onRadioGroupChange}
                />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

export function SidebarContextMenu(props: {
  entries: ReadonlyArray<ProjectContextMenuEntry>;
  onAction: (actionId: string) => void;
  onClose: () => void;
  onRadioGroupChange: (groupId: string, value: string) => void;
  open: boolean;
  position: Position | null;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [resolvedPosition, setResolvedPosition] = useState<Position | null>(props.position);

  useEffect(() => {
    if (!props.open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [props.onClose, props.open]);

  useEffect(() => {
    if (!props.open) {
      setResolvedPosition(null);
      return;
    }
    setResolvedPosition(props.position);
  }, [props.open, props.position]);

  useLayoutEffect(() => {
    if (!props.open || !props.position || !menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const nextX = Math.min(props.position.x, Math.max(8, window.innerWidth - rect.width - 8));
    const nextY = Math.min(props.position.y, Math.max(8, window.innerHeight - rect.height - 8));

    if (nextX !== resolvedPosition?.x || nextY !== resolvedPosition?.y) {
      setResolvedPosition({ x: nextX, y: nextY });
    }
  }, [props.open, props.position, resolvedPosition?.x, resolvedPosition?.y]);

  const portalTarget = useMemo(() => (typeof document === "undefined" ? null : document.body), []);

  if (!props.open || !resolvedPosition || !portalTarget) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      onContextMenu={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
          props.onClose();
        }
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <div
        ref={menuRef}
        className="fixed min-w-56 rounded-lg border border-border bg-popover p-1 shadow-xl"
        style={{
          left: resolvedPosition.x,
          top: resolvedPosition.y,
        }}
        onContextMenu={(event) => {
          event.preventDefault();
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <MenuEntries
          entries={props.entries}
          onAction={props.onAction}
          onRadioGroupChange={props.onRadioGroupChange}
        />
      </div>
    </div>,
    portalTarget,
  );
}
