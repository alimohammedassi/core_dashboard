import { Loader2 } from "lucide-react";
import { cn } from "cn";

const SPINNER_SIZES = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-6",
} as const;

/* Shared loading spinner — one visual language for buttons, inline states and
   panels. Decorative by default (aria-hidden): pair it with a text label or a
   button state change that conveys what is loading. */
export function Spinner({
  size = "md",
  className,
  ...props
}: React.ComponentProps<typeof Loader2> & { size?: keyof typeof SPINNER_SIZES }) {
  return (
    <Loader2
      aria-hidden="true"
      className={cn("animate-spin motion-reduce:animate-none", SPINNER_SIZES[size], className)}
      {...props}
    />
  );
}
