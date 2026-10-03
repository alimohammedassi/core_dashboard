"use client";

import { useState } from "react";
import { cn } from "cn";
import {
  AlertTriangle,
  CheckCircle2,
  Dumbbell,
  Info,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Target,
  UtensilsCrossed,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import type { TKey } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeError } from "@/lib/user-error";
import dynamic from "next/dynamic";
import type { AiAnalysisResult } from "@/lib/ai/contract";
import type { AiAnalysisMetrics } from "@/lib/ai/metrics";
// P-06: recharts loads as an async chunk — the metric chips above render
// immediately and the charts hydrate into a fixed-height placeholder
// (AiCharts renders two 140px charts plus labels, ~320 total).
const AiCharts = dynamic(() => import("./AiCharts").then((m) => m.AiCharts), {
  loading: () => <div style={{ height: 320 }} aria-hidden="true" />,
});
import { AiProposalCard } from "./AiProposalCard";

// "Analysis with AI" card (client component) — the visual, actionable version:
//   deterministic metric chips + charts (from the same payload the AI saw),
//   icon/color-coded analysis sections, and AI-proposed programs the coach can
//   review and apply. Applying is the ONLY write path (ProposalApplyDialog →
//   /api/ai/proposal-apply); the analysis itself is still strictly read-only.
//
// Request shape: only the coach-owned SUBSCRIPTION id is sent (matching the
// profile-page route convention). The route re-derives the client server-side
// and never trusts browser ids.

type Props = { subscriptionId: string };

type ErrorState = {
  title: string;
  detail: string;
};

// HTTP status → localized error copy. The AI result payload itself is never
// localized here (it comes from the API in English).
const ERROR_KEYS: Record<number, { title: TKey; detail: TKey }> = {
  400: {
    title: "subscribers.ai.errors.invalidRequest.title",
    detail: "subscribers.ai.errors.invalidRequest.detail",
  },
  401: { title: "subscribers.ai.errors.notSignedIn.title", detail: "subscribers.ai.errors.notSignedIn.detail" },
  403: {
    title: "subscribers.ai.errors.notAvailable.title",
    detail: "subscribers.ai.errors.notAvailable.detail",
  },
  404: {
    title: "subscribers.ai.errors.clientNotFound.title",
    detail: "subscribers.ai.errors.clientNotFound.detail",
  },
  422: {
    title: "subscribers.ai.errors.nothingToAnalyze.title",
    detail: "subscribers.ai.errors.nothingToAnalyze.detail",
  },
  429: { title: "subscribers.ai.errors.rateLimited.title", detail: "subscribers.ai.errors.rateLimited.detail" },
  500: {
    title: "subscribers.ai.errors.analysisFailed.title",
    detail: "subscribers.ai.errors.analysisFailed.detail",
  },
  502: {
    title: "subscribers.ai.errors.aiUnavailable.title",
    detail: "subscribers.ai.errors.aiUnavailable.detail",
  },
  503: {
    title: "subscribers.ai.errors.notConfigured.title",
    detail: "subscribers.ai.errors.notConfigured.detail",
  },
};

const FALLBACK_ERROR = {
  title: "subscribers.ai.errors.analysisFailed.title" as TKey,
  detail: "subscribers.ai.errors.analysisFailed.detail" as TKey,
};

// Long lists show the first few items with an explicit toggle — collapsed
// content costs no DOM and the coach is never forced to scroll a text wall.
function ShowMoreList({ items }: { items: string[] }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const visible = expanded || items.length <= 3 ? items : items.slice(0, 3);
  return (
    <div className="space-y-1">
      <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
        {visible.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      {items.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {expanded ? t("subscribers.ai.showLess") : t("subscribers.ai.showMore", { n: items.length })}
        </button>
      )}
    </div>
  );
}

function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-label-sm uppercase tracking-wider text-faint">
      <span className="text-primary">{icon}</span>
      {children}
    </p>
  );
}

// Bento tile: subtle secondary→accent wash, uppercase kicker + content.
function BentoTile({
  kicker,
  children,
  className,
}: {
  kicker: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-gradient-to-b from-secondary to-accent p-4",
        className
      )}
    >
      <p className="text-label-sm uppercase tracking-wider text-faint">{kicker}</p>
      {children}
    </div>
  );
}

function AnalysisSection({
  icon,
  title,
  summary,
  observations,
  weaknesses,
  ideas,
}: {
  icon: React.ReactNode;
  title: string;
  summary: string;
  observations: string[];
  weaknesses: string[];
  ideas: string[];
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-primary">{icon}</span>
        {title}
      </p>
      <p className="text-sm">{summary}</p>
      {observations.length > 0 && (
        <div className="space-y-1">
          <SectionHeading icon={<Info className="size-3.5" />}>{t("subscribers.ai.observations")}</SectionHeading>
          <ShowMoreList items={observations} />
        </div>
      )}
      {weaknesses.length > 0 && (
        <div className="space-y-1">
          <SectionHeading icon={<AlertTriangle className="size-3.5" />}>
            {t("subscribers.ai.weaknesses")}
          </SectionHeading>
          <ShowMoreList items={weaknesses} />
        </div>
      )}
      {ideas.length > 0 && (
        <div className="space-y-1">
          <SectionHeading icon={<Lightbulb className="size-3.5" />}>{t("subscribers.ai.ideas")}</SectionHeading>
          <ShowMoreList items={ideas} />
        </div>
      )}
    </div>
  );
}

const PRIORITY_LABEL: Record<string, TKey> = {
  high: "subscribers.ai.priority.high",
  medium: "subscribers.ai.priority.medium",
  low: "subscribers.ai.priority.low",
};

// Color-coded priority: visual scan order without inventing "scores".
function PriorityBadge({ priority }: { priority: string }) {
  const { t } = useI18n();
  const cls =
    priority === "high"
      ? "border-red-300 bg-red-500/10 text-red-700 dark:text-red-400"
      : priority === "medium"
        ? "border-amber-300 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "";
  return (
    <Badge variant="outline" className={`mt-0.5 shrink-0 ${cls}`}>
      {PRIORITY_LABEL[priority] ? t(PRIORITY_LABEL[priority]) : priority}
    </Badge>
  );
}

export function AiAnalysisCard({ subscriptionId }: Props) {
  const { t, fmt } = useI18n();
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AiAnalysisResult | null>(null);
  const [metrics, setMetrics] = useState<AiAnalysisMetrics | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setAnalysis(null); // every run is a fresh, on-demand analysis
    setMetrics(null);
    try {
      const res = await fetch("/api/ai/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id: subscriptionId }),
      });
      if (res.ok) {
        const body = (await res.json()) as { analysis?: AiAnalysisResult; metrics?: AiAnalysisMetrics };
        if (body.analysis) {
          setAnalysis(body.analysis);
          setMetrics(body.metrics ?? null);
        } else {
          const keys = FALLBACK_ERROR;
          setError({ title: t(keys.title), detail: t(keys.detail) });
        }
      } else {
        const keys = ERROR_KEYS[res.status] ?? FALLBACK_ERROR;
        setError({ title: t(keys.title), detail: t(keys.detail) });
      }
    } catch (err) {
      console.error("[ui] ai-analysis fetch failed:", describeError(err, "network error"));
      setError({
        title: t("subscribers.ai.errors.network.title"),
        detail: t("subscribers.ai.errors.network.detail"),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Sparkles className="size-4" />
            </span>
            <CardTitle>{t("subscribers.ai.title")}</CardTitle>
          </div>
          <span className="text-label-sm text-faint">{t("subscribers.ai.onDemand")}</span>
        </div>
        <CardDescription>{t("subscribers.ai.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!analysis && !error && !loading && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{t("subscribers.ai.idleHint")}</p>
            <Button onClick={runAnalysis} disabled={loading}>
              <Sparkles className="size-4" /> {t("subscribers.ai.analyze")}
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <RefreshCw className="size-4 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("subscribers.ai.analyzing")}</p>
          </div>
        )}

        {error && (
          <div className="space-y-3">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-semibold">{error.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{error.detail}</p>
            </div>
            <Button variant="outline" size="sm" onClick={runAnalysis} disabled={loading}>
              <RefreshCw className="size-3.5" /> {t("common.actions.retry")}
            </Button>
          </div>
        )}

        {analysis && (
          <div className="space-y-4">
            {/* Bento summary — deterministic numbers only (metrics), never AI text */}
            {metrics && (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <BentoTile kicker={t("subscribers.ai.overall")}>
                  <p className="text-body-md leading-snug text-foreground">{analysis.overall_assessment}</p>
                </BentoTile>
                <BentoTile kicker={t("subscribers.ai.workoutMetrics")}>
                  <p className="font-display text-headline-sm tabular-nums text-foreground">
                    {metrics.workout.completion_pct != null
                      ? `${metrics.workout.completion_pct}%`
                      : t("subscribers.ai.metrics.noData")}
                  </p>
                  {metrics.workout.elapsed > 0 && (
                    <p className="text-body-sm text-muted-foreground">
                      {t("subscribers.ai.metrics.completedOf", {
                        done: metrics.workout.completed,
                        total: metrics.workout.elapsed,
                      })}
                    </p>
                  )}
                  <p className="text-body-sm text-muted-foreground">
                    {t("subscribers.ai.metrics.sessionsLast30")}:{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {metrics.workout.sessions_last_30 != null ? fmt.num(metrics.workout.sessions_last_30) : "—"}
                    </span>
                  </p>
                  <p className="text-body-sm text-muted-foreground">
                    {t("subscribers.ai.metrics.tonnage")}:{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {fmt.num(metrics.workout.weekly_volume.reduce((s, w) => s + w.volume, 0))}
                    </span>
                  </p>
                </BentoTile>
                {analysis.issues.length > 0 && (
                  <BentoTile
                    kicker={t("subscribers.ai.issues")}
                    className="border-destructive/30 bg-destructive/5"
                  >
                    <p className="font-display text-headline-sm tabular-nums text-destructive">
                      {analysis.issues.length}
                    </p>
                    <ul className="space-y-1">
                      {analysis.issues.slice(0, 2).map((issue, i) => (
                        <li key={i} className="text-body-sm text-muted-foreground">
                          {issue.title}
                        </li>
                      ))}
                    </ul>
                  </BentoTile>
                )}
                {analysis.coach_action_items.length > 0 && (
                  <BentoTile kicker={t("subscribers.ai.actionItemsTitle")}>
                    <ul className="space-y-2">
                      {analysis.coach_action_items.slice(0, 3).map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-label-sm font-bold text-primary">
                            {i + 1}
                          </span>
                          <p className="text-body-sm text-foreground">{item.action}</p>
                        </li>
                      ))}
                    </ul>
                  </BentoTile>
                )}
              </div>
            )}

            {metrics && <AiCharts metrics={metrics} />}

            <AnalysisSection
              icon={<Dumbbell className="size-4" />}
              title={t("subscribers.ai.workoutProgram")}
              summary={analysis.workout_analysis.summary}
              observations={analysis.workout_analysis.observations}
              weaknesses={analysis.workout_analysis.potential_weaknesses}
              ideas={analysis.workout_analysis.adjustment_ideas}
            />
            <AnalysisSection
              icon={<UtensilsCrossed className="size-4" />}
              title={t("subscribers.ai.nutritionProgram")}
              summary={analysis.nutrition_analysis.summary}
              observations={analysis.nutrition_analysis.observations}
              weaknesses={analysis.nutrition_analysis.potential_weaknesses}
              ideas={analysis.nutrition_analysis.adjustment_ideas}
            />

            {(analysis.program_proposal.workout || analysis.program_proposal.nutrition) && (
              <div className="space-y-2">
                <SectionHeading icon={<Target className="size-3.5" />}>
                  {t("subscribers.ai.proposal.sectionTitle")}
                </SectionHeading>
                <p className="text-xs text-muted-foreground">{t("subscribers.ai.proposal.sectionDesc")}</p>
                {analysis.program_proposal.workout && (
                  <AiProposalCard kind="workout" proposal={analysis.program_proposal.workout} subscriptionId={subscriptionId} />
                )}
                {analysis.program_proposal.nutrition && (
                  <AiProposalCard
                    kind="nutrition"
                    proposal={analysis.program_proposal.nutrition}
                    subscriptionId={subscriptionId}
                  />
                )}
              </div>
            )}

            {analysis.cross_program_analysis.conflicts.length > 0 && (
              <div className="rounded-lg border p-4 space-y-1">
                <p className="text-sm font-semibold">{t("subscribers.ai.crossProgram")}</p>
                <p className="text-sm">{analysis.cross_program_analysis.summary}</p>
                <ShowMoreList items={analysis.cross_program_analysis.conflicts} />
              </div>
            )}

            {analysis.strengths.length > 0 && (
              <div className="space-y-1">
                <SectionHeading icon={<CheckCircle2 className="size-3.5" />}>{t("subscribers.ai.strengths")}</SectionHeading>
                <ShowMoreList items={analysis.strengths} />
              </div>
            )}

            {analysis.issues.length > 0 && (
              <div className="space-y-2">
                <SectionHeading icon={<AlertTriangle className="size-3.5" />}>{t("subscribers.ai.issues")}</SectionHeading>
                {analysis.issues.map((issue, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <p className="text-sm font-medium">{issue.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{issue.detail}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("subscribers.ai.evidence", { evidence: issue.evidence })}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {analysis.improvements.length > 0 && (
              <div className="space-y-2">
                <SectionHeading icon={<Lightbulb className="size-3.5" />}>{t("subscribers.ai.improvements")}</SectionHeading>
                {analysis.improvements.map((imp, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{imp.title}</p>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {imp.target}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{imp.detail}</p>
                  </div>
                ))}
              </div>
            )}

            {analysis.missing_information.length > 0 && (
              <div className="rounded-lg border border-dashed p-4 space-y-1">
                <SectionHeading icon={<Info className="size-3.5" />}>{t("subscribers.ai.missingInfo")}</SectionHeading>
                <ShowMoreList items={analysis.missing_information} />
              </div>
            )}

            {analysis.coach_action_items.length > 0 && (
              <div className="space-y-2">
                <SectionHeading icon={<Target className="size-3.5" />}>{t("subscribers.ai.priorities")}</SectionHeading>
                {analysis.coach_action_items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border p-3">
                    <PriorityBadge priority={item.priority} />
                    <p className="text-sm">{item.action}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{analysis.disclaimer}</p>
              <Button variant="outline" size="sm" onClick={runAnalysis} disabled={loading}>
                <RefreshCw className="size-3.5" /> {t("subscribers.ai.runFresh")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
