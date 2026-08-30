import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-[#0D8267] text-white hover:bg-[#0B7058] active:scale-[0.98] shadow-xs hover:shadow-sm focus-visible:ring-teal-500",
        destructive:
          "bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98] shadow-xs focus-visible:ring-rose-500",
        outline:
          "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98] shadow-2xs focus-visible:ring-slate-400",
        secondary:
          "bg-slate-100 text-slate-800 hover:bg-slate-200/80 active:scale-[0.98] focus-visible:ring-slate-400",
        ghost:
          "text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400",
        link: "text-[#0D8267] underline-offset-4 hover:underline p-0 h-auto font-medium",
        emerald:
          "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] shadow-xs focus-visible:ring-emerald-500",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-xl px-6 text-base font-semibold",
        icon: "h-9 w-9 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
