"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function FavoriteStar({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={active ? "Quitar de favoritos" : "Marcar como favorito"}
      className="inline-flex shrink-0 text-muted-foreground/40 hover:text-amber-400 transition-colors"
    >
      <Star className={cn("h-4 w-4", active && "fill-amber-400 text-amber-400")} />
    </button>
  );
}
