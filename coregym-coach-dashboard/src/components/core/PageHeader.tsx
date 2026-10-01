import { cn } from "cn";

/**
 * Stitch-style page header: display headline + optional uppercase kicker chip,
 * optional description line, and a right-aligned action cluster.
 * Server-safe (no hooks) so server pages can render it directly.
 */
export function PageHeader({
  title,
  chip,
  description,
  meta,
  actions,
  className,
}: {
  title: React.ReactNode;
  chip?: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Stitch headline scale: 24px mobile → 32px desktop (headline-lg). */}
          <h1 className="font-display text-[1.5rem] leading-8 tracking-tight text-foreground lg:text-headline-lg lg:leading-10">
            {title}
          </h1>
          {chip ? (
            <span className="rounded-md bg-accent px-2 py-0.5 text-label-sm uppercase tracking-wider text-primary">
              {chip}
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="max-w-2xl text-body-md text-muted-foreground">{description}</p>
        ) : null}
        {meta ? <div className="flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">{meta}</div> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}
