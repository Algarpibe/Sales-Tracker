"use client";

import { GripVertical, X } from "lucide-react";

export function WidgetFrame({
  title, editing, onRemove, children,
}: {
  title: string;
  editing: boolean;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {editing && (
        <div className="widget-drag-handle flex cursor-move items-center justify-between gap-2 rounded-t-lg border border-b-0 border-primary/30 bg-primary/10 px-2 py-1">
          <span className="flex items-center gap-1.5 text-xs font-medium truncate">
            <GripVertical className="h-3.5 w-3.5 shrink-0" />
            {title}
          </span>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Quitar ${title}`}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
