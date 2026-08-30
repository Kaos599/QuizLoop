import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-slate-900 text-white shadow-xs",
        secondary:
          "border-transparent bg-slate-100 text-slate-900",
        destructive:
          "border-transparent bg-rose-500 text-white",
        outline: "text-slate-700 border-slate-200 bg-white",
        teal: "border-teal-200 bg-teal-50 text-teal-800",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
        amber: "border-amber-200 bg-amber-50 text-amber-800",
        rose: "border-rose-200 bg-rose-50 text-rose-800",
        blue: "border-blue-200 bg-blue-50 text-blue-800",
        purple: "border-purple-200 bg-purple-50 text-purple-800",
        indigo: "border-indigo-200 bg-indigo-50 text-indigo-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
