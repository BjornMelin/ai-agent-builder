"use client";

import {
  ExternalLinkIcon,
  Loader2Icon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { z } from "zod/mini";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";

const errorResponseSchema = z.looseObject({
  error: z.optional(
    z.looseObject({
      code: z.optional(z.string()),
      message: z.optional(z.string()),
    }),
  ),
});

const registrySearchResponseSchema = z.looseObject({
  query: z.optional(z.string()),
  skills: z.optional(
    z.array(
      z.looseObject({
        effectiveSource: z.optional(z.union([z.enum(["db", "fs"]), z.null()])),
        id: z.string(),
        installed: z.boolean(),
        installedOrigin: z.optional(
          z.union([z.enum(["manual", "registry"]), z.null()]),
        ),
        installedRegistryId: z.optional(z.union([z.string(), z.null()])),
        installedSkillId: z.optional(z.union([z.string(), z.null()])),
        installs: z.number(),
        name: z.string(),
        skillId: z.string(),
        source: z.string(),
      }),
    ),
  ),
});

const useHydrated = () =>
  useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

async function tryParseErrorMessage(res: Response): Promise<string | null> {
  try {
    const jsonUnknown: unknown = await res.json();
    const parsed = errorResponseSchema.safeParse(jsonUnknown);
    return parsed.success ? (parsed.data.error?.message ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Registry tab (skills.sh search + install).
 *
 * @param props - Registry tab props.
 * @returns Registry UI.
 */
export function SkillsRegistryTab(
  props: Readonly<{
    projectId: string;
    onInstallFromRegistry: (registryId: string) => Promise<void>;
    registryPending: Readonly<{ registryId: string; runId: string }> | null;
    registryError: string | null;
    setRegistryError: (value: string | null) => void;
    registryCompletedRunId: string | null;
  }>,
) {
  const {
    onInstallFromRegistry,
    projectId,
    registryCompletedRunId,
    registryError,
    registryPending,
    setRegistryError,
  } = props;
  const router = useRouter();
  const registrySearchId = useId();
  const hydrated = useHydrated();

  const [registryQuery, setRegistryQuery] = useState("");
  const [registryResults, setRegistryResults] = useState<
    readonly {
      id: string;
      name: string;
      source: string;
      skillId: string;
      installs: number;
      installed: boolean;
      installedSkillId: string | null;
      installedOrigin: "manual" | "registry" | null;
      installedRegistryId: string | null;
      effectiveSource: "db" | "fs" | null;
    }[]
  >([]);
  const [registryIsSearching, setRegistryIsSearching] = useState(false);
  const registrySearchSeq = useRef(0);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const searchRegistry = useCallback(
    async (query: string, options: Readonly<{ silent?: boolean }> = {}) => {
      const q = query.trim();
      if (q.length < 2) {
        setRegistryResults([]);
        if (!options.silent) setRegistryError(null);
        return;
      }

      registrySearchSeq.current += 1;
      const seq = registrySearchSeq.current;

      setRegistryIsSearching(true);
      if (!options.silent) setRegistryError(null);

      let res: Response;
      try {
        const url = new URL(
          "/api/skills/registry/search",
          window.location.origin,
        );
        url.searchParams.set("projectId", projectId);
        url.searchParams.set("q", q);
        url.searchParams.set("limit", "20");
        res = await fetch(url.toString());
      } catch (err) {
        if (seq === registrySearchSeq.current) {
          setRegistryIsSearching(false);
        }
        if (!options.silent) {
          setRegistryError(
            err instanceof Error ? err.message : "Failed to search registry.",
          );
        }
        return;
      }

      if (!res.ok) {
        if (seq === registrySearchSeq.current) {
          setRegistryIsSearching(false);
        }
        if (!options.silent) {
          setRegistryError(`Registry search failed (${res.status}).`);
        }
        return;
      }

      try {
        const jsonUnknown: unknown = await res.json();
        const parsed = registrySearchResponseSchema.safeParse(jsonUnknown);
        if (!parsed.success || !parsed.data.skills) {
          throw new Error("Invalid registry response.");
        }

        const skills = parsed.data.skills.map((s) => ({
          effectiveSource: s.effectiveSource ?? null,
          id: s.id,
          installed: s.installed,
          installedOrigin: s.installedOrigin ?? null,
          installedRegistryId: s.installedRegistryId ?? null,
          installedSkillId: s.installedSkillId ?? null,
          installs: s.installs,
          name: s.name,
          skillId: s.skillId,
          source: s.source,
        }));

        if (seq === registrySearchSeq.current) {
          setRegistryResults(skills);
          setRegistryIsSearching(false);
        }
      } catch (err) {
        if (seq === registrySearchSeq.current) {
          setRegistryIsSearching(false);
        }
        if (!options.silent) {
          setRegistryError(
            err instanceof Error
              ? err.message
              : "Failed to parse registry results.",
          );
        }
      }
    },
    [projectId, setRegistryError],
  );

  const deleteSkillById = useCallback(
    async (skillId: string, skillName: string) => {
      const ok = window.confirm(`Delete skill "${skillName}"?`);
      if (!ok) return;

      setRegistryError(null);

      let res: Response;
      try {
        res = await fetch("/api/skills", {
          body: JSON.stringify({
            projectId,
            skillId,
          }),
          headers: { "content-type": "application/json" },
          method: "DELETE",
        });
      } catch (err) {
        setRegistryError(
          err instanceof Error ? err.message : "Failed to delete skill.",
        );
        return;
      }

      if (!res.ok) {
        const fromServer = await tryParseErrorMessage(res);
        setRegistryError(
          fromServer ?? `Failed to delete skill (${res.status}).`,
        );
        return;
      }

      refresh();
    },
    [projectId, refresh, setRegistryError],
  );

  useEffect(() => {
    const q = registryQuery.trim();
    if (q.length < 2) {
      setRegistryResults([]);
      setRegistryError(null);
      return;
    }

    const t = setTimeout(() => {
      void searchRegistry(q).catch((err) => {
        setRegistryIsSearching(false);
        setRegistryError(
          err instanceof Error ? err.message : "Failed to search registry.",
        );
      });
    }, 250);

    return () => clearTimeout(t);
  }, [registryQuery, searchRegistry, setRegistryError]);

  useEffect(() => {
    if (!registryCompletedRunId) return;
    const q = registryQuery.trim();
    if (q.length < 2) return;
    void searchRegistry(q, { silent: true }).catch(() => {
      // Best-effort refresh of search results after an install completes.
    });
  }, [registryCompletedRunId, registryQuery, searchRegistry]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Skills Registry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Search the public registry on{" "}
            <a
              className="underline underline-offset-4"
              href="https://skills.sh/docs"
              rel="noreferrer"
              target="_blank"
            >
              skills.sh
            </a>{" "}
            and install skills into this project.
          </p>

          <div className="grid gap-2">
            <label className="font-medium text-sm" htmlFor={registrySearchId}>
              Search
            </label>
            <Input
              autoCapitalize="none"
              autoComplete="off"
              id={registrySearchId}
              name="registryQuery"
              onChange={(e) => setRegistryQuery(e.target.value)}
              placeholder="e.g. sandbox, vitest, accessibility…"
              spellCheck={false}
              value={registryQuery}
            />
          </div>

          {registryError ? (
            <output
              aria-atomic="true"
              aria-live="polite"
              className="block text-destructive text-sm"
            >
              {registryError}
            </output>
          ) : null}

          {registryPending ? (
            <output
              aria-atomic="true"
              aria-live="polite"
              className="block text-muted-foreground text-sm"
            >
              Installing <code>{registryPending.registryId}</code> (workflow:{" "}
              <code>{registryPending.runId}</code>)…
            </output>
          ) : null}

          {registryIsSearching ? (
            <p className="text-muted-foreground text-sm">
              <Loader2Icon
                aria-hidden="true"
                className="mr-2 inline size-4 motion-safe:animate-spin motion-reduce:animate-none"
              />
              Searching…
            </p>
          ) : null}

          {registryResults.length === 0 && registryQuery.trim().length >= 2 ? (
            <Empty className="min-h-[140px] rounded-xl border">
              <EmptyHeader>
                <EmptyTitle>No results</EmptyTitle>
                <EmptyDescription>
                  Try a different query (e.g. a domain like testing or
                  deployment).
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}

          {registryResults.length > 0 ? (
            <ul className="grid gap-2">
              {registryResults.map((skill) => {
                const isInstalling = registryPending?.registryId === skill.id;
                const canInstall = !registryPending;
                const canUninstall =
                  canInstall && Boolean(skill.installedSkillId);

                return (
                  <li key={skill.id}>
                    <div className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3">
                      <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium">{skill.name}</p>
                            {skill.installed ? (
                              <Badge variant="secondary">Installed</Badge>
                            ) : null}
                            {skill.effectiveSource === "fs" ? (
                              <Badge variant="outline">Repo</Badge>
                            ) : null}
                            <span className="text-muted-foreground text-xs">
                              {skill.source}
                            </span>
                          </div>
                          <p className="text-muted-foreground text-xs">
                            Installs:{" "}
                            {hydrated
                              ? skill.installs.toLocaleString()
                              : String(skill.installs)}
                          </p>
                        </div>

                        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
                          <Button asChild size="sm" variant="outline">
                            <a
                              href={`https://skills.sh/${skill.id}`}
                              rel="noreferrer"
                              target="_blank"
                            >
                              View
                              <ExternalLinkIcon
                                aria-hidden="true"
                                className="size-4"
                              />
                            </a>
                          </Button>

                          {skill.installed ? (
                            <>
                              <Button
                                disabled={!canInstall || isInstalling}
                                onClick={() => {
                                  void onInstallFromRegistry(skill.id).catch(
                                    () => {
                                      // Parent component owns error surface for registry installs.
                                    },
                                  );
                                }}
                                size="sm"
                                variant="secondary"
                              >
                                {isInstalling ? (
                                  <Loader2Icon
                                    aria-hidden="true"
                                    className="mr-2 size-4 motion-safe:animate-spin motion-reduce:animate-none"
                                  />
                                ) : (
                                  <RefreshCwIcon
                                    aria-hidden="true"
                                    className="mr-2 size-4"
                                  />
                                )}
                                Update
                              </Button>
                              <Button
                                disabled={!canUninstall}
                                onClick={() => {
                                  if (!skill.installedSkillId) return;
                                  void deleteSkillById(
                                    skill.installedSkillId,
                                    skill.name,
                                  ).catch(() => {
                                    // Best-effort; errors are surfaced in the tab state.
                                  });
                                }}
                                size="sm"
                                variant="ghost"
                              >
                                <Trash2Icon
                                  aria-hidden="true"
                                  className="mr-2 size-4 text-destructive"
                                />
                                Uninstall
                              </Button>
                            </>
                          ) : (
                            <Button
                              disabled={!canInstall || isInstalling}
                              onClick={() => {
                                void onInstallFromRegistry(skill.id).catch(
                                  () => {
                                    // Parent component owns error surface for registry installs.
                                  },
                                );
                              }}
                              size="sm"
                              variant="secondary"
                            >
                              {isInstalling ? (
                                <Loader2Icon
                                  aria-hidden="true"
                                  className="mr-2 size-4 motion-safe:animate-spin motion-reduce:animate-none"
                                />
                              ) : null}
                              Install
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
