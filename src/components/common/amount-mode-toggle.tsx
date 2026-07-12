"use client";

import { cn } from "@/lib/utils";

export type AmountMode = "money" | "pct";

export function AmountModeToggle({
  value,
  onChange,
  className,
}: {
  value: AmountMode;
  onChange: (m: AmountMode) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center rounded-md border border-border/60 bg-muted/30 p-0.5 text-xs", className)}>
      {(["money", "pct"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={value === m}
          className={cn(
            "rounded-sm px-2 py-0.5 font-medium transition-colors",
            value === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {m === "money" ? "$" : "%"}
        </button>
      ))}
    </div>
  );
}
