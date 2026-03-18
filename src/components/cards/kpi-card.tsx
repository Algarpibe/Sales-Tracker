import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string;
  change?: number; // Percentage change
  icon: LucideIcon;
  description?: string;
  variant?: "standard" | "premium";
}

export function KPICard({ title, value, change, icon: Icon, description, variant = "standard" }: KPICardProps) {
  const isPositive = change && change > 0;
  const isNegative = change && change < 0;
  const isNeutral = !change || change === 0;

  const isPremium = variant === "premium";

  return (
    <Card className={cn(
      "transition-all duration-500 relative",
      isPremium 
        ? "border-t border-t-primary/30 bg-white/40 dark:bg-black/20 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.05)] ring-0 overflow-hidden hover:shadow-[0_20px_50px_rgba(0,0,0,0.1)] border-x border-b border-white/20 dark:border-white/5" 
        : "hover:shadow-md"
    )}>
      {isPremium && (
        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
      )}
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {change !== undefined && (
              <div className="flex items-center gap-1">
                {isPositive && (
                  <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                )}
                {isNegative && (
                  <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                )}
                {isNeutral && (
                  <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    "text-xs font-medium",
                    isPositive && "text-green-500",
                    isNegative && "text-red-500",
                    isNeutral && "text-muted-foreground"
                  )}
                >
                  {isPositive ? "+" : ""}
                  {change?.toFixed(1)}% vs. periodo anterior
                </span>
              </div>
            )}
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
