"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useState } from "react";
import { z } from "zod/mini";
import { SkillsInstalledTab } from "@/app/(app)/projects/[projectId]/skills/skills-installed-tab";
import type {
  EffectiveSkillSummary,
  ProjectSkillSummary,
} from "@/app/(app)/projects/[projectId]/skills/skills-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const registryInstallResponseSchema = z.looseObject({
  ok: z.boolean(),
  runId: z.string(),
});

const registryStatusResponseSchema = z.looseObject({
  runId: z.string(),
  status: z.string(),
});

type RegistryPending = Readonly<{ registryId: string; runId: string }>;

const REGISTRY_INSTALL_POLL_TIMEOUT_MS = 10 * 60_000;
const REGISTRY_INSTALL_POLL_INTERVAL_MS = 1_000;
const REGISTRY_INSTALL_POLL_MAX_INTERVAL_MS = 5_000;

const SkillsRegistryTab = dynamic(
  async () => {
    const mod = await import(
      "@/app/(app)/projects/[projectId]/skills/skills-registry-tab"
    );
    return mod.SkillsRegistryTab;
  },
  {
    // Code-split registry UI: it's not needed for the default Installed view.
    ssr: false,
  },
);

function preloadRegistryTabChunk(): void {
  void import(
    "@/app/(app)/projects/[projectId]/skills/skills-registry-tab"
  ).catch(() => {
    // Best-effort prefetch; ignore failures and lazy-load on demand.
  });
}

/**
 * Skills management UI (Installed + Registry).
 *
 * @param props - `SkillsClient` props.
 * @returns Skills tab UI.
 */
export function SkillsClient(
  props: Readonly<{
    projectId: string;
    projectSkills: readonly ProjectSkillSummary[];
    effectiveSkills: readonly EffectiveSkillSummary[];
  }>,
) {
  const router = useRouter();

  const [registryError, setRegistryError] = useState<string | null>(null);
  const [registryPending, setRegistryPending] =
    useState<RegistryPending | null>(null);

  // Set when an install completes successfully so the registry tab can re-search.
  const [registryCompletedRunId, setRegistryCompletedRunId] = useState<
    string | null
  >(null);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const installFromRegistry = async (registryId: string) => {
    if (registryPending) return;

    setRegistryError(null);
    setRegistryCompletedRunId(null);

    let res: Response;
    try {
      res = await fetch("/api/skills/registry/install", {
        body: JSON.stringify({ projectId: props.projectId, registryId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    } catch (err) {
      setRegistryError(
        err instanceof Error ? err.message : "Failed to start install.",
      );
      return;
    }

    if (!res.ok) {
      setRegistryError(`Failed to start install (${res.status}).`);
      return;
    }

    try {
      const jsonUnknown: unknown = await res.json();
      const parsed = registryInstallResponseSchema.safeParse(jsonUnknown);
      if (!parsed.success || !parsed.data.runId) {
        throw new Error("Invalid install response.");
      }
      setRegistryPending({ registryId, runId: parsed.data.runId });
    } catch (err) {
      setRegistryError(
        err instanceof Error
          ? err.message
          : "Failed to parse install response.",
      );
    }
  };

  useEffect(() => {
    if (!registryPending) return;

    let cancelled = false;
    const startedAt = Date.now();
    let attempt = 0;

    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - startedAt > REGISTRY_INSTALL_POLL_TIMEOUT_MS) {
        setRegistryError(
          "Install is taking longer than expected. Try again or refresh the page.",
        );
        setRegistryPending(null);
        return;
      }

      attempt += 1;

      let res: Response;
      try {
        const url = new URL(
          "/api/skills/registry/status",
          window.location.origin,
        );
        url.searchParams.set("projectId", props.projectId);
        url.searchParams.set("runId", registryPending.runId);
        res = await fetch(url.toString());
      } catch (err) {
        setRegistryError(
          err instanceof Error
            ? err.message
            : "Failed to check install status.",
        );
        setRegistryPending(null);
        return;
      }

      if (!res.ok) {
        setRegistryError(`Install status failed (${res.status}).`);
        setRegistryPending(null);
        return;
      }

      const jsonUnknown: unknown = await res.json();
      const parsed = registryStatusResponseSchema.safeParse(jsonUnknown);
      if (!parsed.success) {
        setRegistryError("Install status response was not understood.");
        setRegistryPending(null);
        return;
      }

      const status = parsed.data.status;
      if (status === "succeeded") {
        const runId = registryPending.runId;
        setRegistryPending(null);
        setRegistryCompletedRunId(runId);
        refresh();
        return;
      }

      if (status === "failed" || status === "canceled") {
        setRegistryPending(null);
        setRegistryError(`Install ${status}.`);
        return;
      }

      const delay = Math.min(
        REGISTRY_INSTALL_POLL_INTERVAL_MS * 2 ** Math.min(attempt - 1, 2),
        REGISTRY_INSTALL_POLL_MAX_INTERVAL_MS,
      );
      window.setTimeout(runTick, delay);
    };

    const runTick = () => {
      void tick().catch((err) => {
        if (cancelled) return;
        setRegistryError(
          err instanceof Error
            ? err.message
            : "Failed to check install status.",
        );
        setRegistryPending(null);
      });
    };

    runTick();

    return () => {
      cancelled = true;
    };
  }, [props.projectId, refresh, registryPending]);

  return (
    <Tabs defaultValue="installed" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList variant="line" className="w-full md:w-auto">
          <TabsTrigger value="installed">Installed</TabsTrigger>
          <TabsTrigger
            value="registry"
            onFocus={preloadRegistryTabChunk}
            onPointerEnter={preloadRegistryTabChunk}
          >
            Registry
          </TabsTrigger>
        </TabsList>
        <p className="text-muted-foreground text-sm">
          Skills are injected as an index (progressive disclosure).
        </p>
      </div>

      <TabsContent value="installed">
        <SkillsInstalledTab
          effectiveSkills={props.effectiveSkills}
          onInstallFromRegistry={installFromRegistry}
          projectId={props.projectId}
          projectSkills={props.projectSkills}
          registryPending={registryPending}
        />
      </TabsContent>

      <TabsContent value="registry">
        <SkillsRegistryTab
          onInstallFromRegistry={installFromRegistry}
          projectId={props.projectId}
          registryCompletedRunId={registryCompletedRunId}
          registryError={registryError}
          registryPending={registryPending}
          setRegistryError={setRegistryError}
        />
      </TabsContent>
    </Tabs>
  );
}
