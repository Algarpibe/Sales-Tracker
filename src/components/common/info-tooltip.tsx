"use client";

import { Info } from "lucide-react";
import {
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from "@/components/ui/tooltip";

export function InfoTooltip({
  text,
  side = "top",
}: {
  text: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label="Más información"
          className="inline-flex shrink-0 items-center text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        >
          <Info className="h-3.5 w-3.5" />
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
