"use client";

/* Drop-in replacement for next/link that shows the global RouteProgress bar
   while THIS link's navigation is pending (Next.js useLinkStatus pattern —
   the hook must be read inside the Link's subtree).

   Only dashboard-area navigation uses this; landing/auth/public links keep
   plain next/link. All Link props (href, replace, scroll, prefetch, onClick,
   className, …) and the anchor ref are forwarded untouched. */

import * as React from "react";
import Link from "next/link";
import { RouteProgress } from "./route-progress";

type GlobalLinkProps = React.ComponentProps<typeof Link>;

export function GlobalLink({ children, ref, ...rest }: GlobalLinkProps) {
  return (
    <Link ref={ref} {...rest}>
      {children}
      <RouteProgress />
    </Link>
  );
}
