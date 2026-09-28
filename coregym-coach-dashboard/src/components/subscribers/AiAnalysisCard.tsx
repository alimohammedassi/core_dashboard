"use client";

import { useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeError } from "@/lib/user-error";
import type { AiAnalysisResult } from "@/lib/ai/contract";

// "Analysis with AI" card (client component). Renders the structured AI
// analysis for one client. Strictly read-only: the coach reviews the result
// and decides what to do — nothing is saved, applied or sent anywhere (§23).
//
// Request shape: only the coach-owned SUBSCRIPTION id is sent (matching the
// profile-page route convention). The route re-derives the client server-side
// and never trusts browser ids (route header comment documents the flow).

type Props = { subscriptionId: string };

type ErrorState = {
  title: string;
  detail: string;
};

const STATUS_ERRORS: Record<number, ErrorState> = {
  400: { title: "Invalid request", detail: "The analysis request was not valid. Refresh the page and try again." },
  401: { title: "Not signed in", detail: "Your session expired. Please sign in again." },
  403: { title: "Not available", detail: "AI analysis is not available for this client (requires an active subscription)." },
  404: { title: "Client not found", detail: "This client could not be found for your coach profile." },
  422: { title: "Nothing to analyze", detail: "No assigned workout or nutrition program was found for this client." },
  429: { title: "Rate limited", detail: "Too many analyses in a short period — please try again later." },
  500: { title: "Analysis failed", detail: "Something went wrong while preparing the analysis. Please try again." },
  502: { title: "AI unavailable", detail: "The AI service could not produce a valid analysis. Please try again later." },
  503: { title: "Not configured", detail: "AI analysis is not configured for this environment. Contact support." },
};

function SectionList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function AnalysisSection({
  title,
  summary,
  observations,
  weaknesses,
  ideas,
}: {
  title: string;
  summary: string;
  observations: string[];
  weaknesses: string[];
  ideas: string[];
}) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-sm">{summary}</p>
      {observations.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Observations</p>
          <SectionList items={observations} />
        </div>
      )}
      {weaknesses.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Potential weaknesses</p>
          <SectionList items={weaknesses} />
        </div>
      )}
      {ideas.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Adjustment ideas</p>
          <SectionList items={ideas} />
        </div>
      )}
    </div>
  );
}

const PRIORITY_LABEL: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };

export function AiAnalysisCard({ subscriptionId }: Props) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AiAnalysisResult | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setAnalysis(null); // every run is a fresh, on-demand analysis (§1.1, §23)
    try {
      const res = await fetch("/api/ai/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id: subscriptionId }),
      });
      if (res.ok) {
        const body = (await res.json()) as { analysis?: AiAnalysisResult };
        if (body.analysis) {
          setAnalysis(body.analysis);
        } else {
          setError(STATUS_ERRORS[500]);
        }
      } else {
        setError(STATUS_ERRORS[res.status] ?? STATUS_ERRORS[500]);
      }
    } catch (err) {
      console.error("[ui] ai-analysis fetch failed:", describeError(err, "network error"));
      setError({ title: "Analysis failed", detail: "Could not reach the analysis service. Check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" /> Analysis with AI
        </CardTitle>
        <CardDescription>
          An educational review of this client&apos;s currently assigned workout and nutrition programs, based on the
          data in CoreGym. The coach decides what to act on — the AI never changes anything.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!analysis && !error && !loading && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Runs a fresh analysis of the current assignment state. Limited to a few runs per hour.
            </p>
            <Button onClick={runAnalysis} disabled={loading}>
              <Sparkles className="size-4" /> Analyze with AI
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 rounded-lg border p-4">
            <RefreshCw className="size-4 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Analyzing the assigned workout and nutrition programs — this can take up to 30 seconds.
            </p>
          </div>
        )}

        {error && (
          <div className="space-y-3">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-semibold">{error.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{error.detail}</p>
            </div>
            <Button variant="outline" size="sm" onClick={runAnalysis} disabled={loading}>
              <RefreshCw className="size-3.5" /> Try again
            </Button>
          </div>
        )}

        {analysis && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Overall assessment</p>
              <p className="mt-1 text-sm">{analysis.overall_assessment}</p>
            </div>

            <AnalysisSection
              title="Workout program"
              summary={analysis.workout_analysis.summary}
              observations={analysis.workout_analysis.observations}
              weaknesses={analysis.workout_analysis.potential_weaknesses}
              ideas={analysis.workout_analysis.adjustment_ideas}
            />
            <AnalysisSection
              title="Nutrition program"
              summary={analysis.nutrition_analysis.summary}
              observations={analysis.nutrition_analysis.observations}
              weaknesses={analysis.nutrition_analysis.potential_weaknesses}
              ideas={analysis.nutrition_analysis.adjustment_ideas}
            />

            {analysis.cross_program_analysis.conflicts.length > 0 && (
              <div className="rounded-lg border p-4 space-y-1">
                <p className="text-sm font-semibold">Cross-program observations</p>
                <p className="text-sm">{analysis.cross_program_analysis.summary}</p>
                <SectionList items={analysis.cross_program_analysis.conflicts} />
              </div>
            )}

            {analysis.strengths.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Strengths</p>
                <SectionList items={analysis.strengths} />
              </div>
            )}

            {analysis.issues.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Issues</p>
                {analysis.issues.map((issue, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <p className="text-sm font-medium">{issue.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{issue.detail}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Evidence: {issue.evidence}</p>
                  </div>
                ))}
              </div>
            )}

            {analysis.improvements.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Improvements</p>
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
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Missing information</p>
                <SectionList items={analysis.missing_information} />
              </div>
            )}

            {analysis.coach_action_items.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Suggested review priorities</p>
                {analysis.coach_action_items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border p-3">
                    <Badge variant={item.priority === "high" ? "default" : "secondary"} className="mt-0.5">
                      {PRIORITY_LABEL[item.priority] ?? item.priority}
                    </Badge>
                    <p className="text-sm">{item.action}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{analysis.disclaimer}</p>
              <Button variant="outline" size="sm" onClick={runAnalysis} disabled={loading}>
                <RefreshCw className="size-3.5" /> Run fresh analysis
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
