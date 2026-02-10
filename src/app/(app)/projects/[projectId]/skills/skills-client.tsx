"use client";

import {
  ExternalLinkIcon,
  Loader2Icon,
  PencilIcon,
  RefreshCwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useState,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export type ProjectSkillSummary = Readonly<{
  id: string;
  name: string;
  description: string;
  content: string;
  updatedAt: string;
  origin: "manual" | "registry";
  registryId: string | null;
  registrySource: string | null;
  bundlePresent: boolean;
}>;

export type EffectiveSkillSummary = Readonly<{
  name: string;
  description: string;
  source: "db" | "fs";
  originLabel: string;
}>;

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

const registryInstallResponseSchema = z.looseObject({
  ok: z.boolean(),
  runId: z.string(),
});

const registryStatusResponseSchema = z.looseObject({
  runId: z.string(),
  status: z.string(),
});

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER_RE, "").trim();
}

function formatSource(skill: EffectiveSkillSummary): Readonly<{
  label: string;
  variant: "secondary" | "outline";
}> {
  return skill.source === "db"
    ? { label: "Project", variant: "secondary" }
    : { label: "Repo", variant: "outline" };
}

/**
 * Skills management UI (project overrides + effective skills list).
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
  const nameId = useId();
  const descriptionId = useId();
  const bodyId = useId();
  const errorId = useId();
  const registrySearchId = useId();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

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
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [registryPending, setRegistryPending] = useState<Readonly<{
    registryId: string;
    runId: string;
  }> | null>(null);

  const isEditing = editingId !== null;

  const startEdit = (skill: ProjectSkillSummary) => {
    setEditingId(skill.id);
    setName(skill.name);
    setDescription(skill.description);
    setBody(stripFrontmatter(skill.content));
    setError(null);
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setBody("");
    setError(null);
  };

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  const deleteSkillById = async (skillId: string, skillName: string) => {
    const ok = window.confirm(`Delete skill "${skillName}"?`);
    if (!ok) return;

    setIsPending(true);
    setError(null);

    let res: Response;
    try {
      res = await fetch("/api/skills", {
        body: JSON.stringify({
          projectId: props.projectId,
          skillId,
        }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      });
    } catch (err) {
      setIsPending(false);
      setError(err instanceof Error ? err.message : "Failed to delete skill.");
      return;
    }

    if (!res.ok) {
      let message = `Failed to delete skill (${res.status}).`;
      try {
        const jsonUnknown: unknown = await res.json();
        const parsed = errorResponseSchema.safeParse(jsonUnknown);
        const fromServer = parsed.success ? parsed.data.error?.message : null;
        if (fromServer) message = fromServer;
      } catch {
        // Ignore.
      }
      setIsPending(false);
      setError(message);
      return;
    }

    setIsPending(false);
    resetForm();
    refresh();
  };

  const upsert = async () => {
    setIsPending(true);
    setError(null);

    let res: Response;
    try {
      res = await fetch("/api/skills", {
        body: JSON.stringify({
          body,
          description,
          name,
          projectId: props.projectId,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    } catch (err) {
      setIsPending(false);
      setError(err instanceof Error ? err.message : "Failed to save skill.");
      return;
    }

    if (!res.ok) {
      let message = `Failed to save skill (${res.status}).`;
      try {
        const jsonUnknown: unknown = await res.json();
        const parsed = errorResponseSchema.safeParse(jsonUnknown);
        const fromServer = parsed.success ? parsed.data.error?.message : null;
        if (fromServer) message = fromServer;
      } catch {
        // Ignore.
      }
      setIsPending(false);
      setError(message);
      return;
    }

    setIsPending(false);
    resetForm();
    refresh();
  };

  const searchRegistry = useCallback(
    async (query: string, options: Readonly<{ silent?: boolean }> = {}) => {
      const q = query.trim();
      if (q.length < 2) {
        setRegistryResults([]);
        if (!options.silent) setRegistryError(null);
        return;
      }

      setRegistryIsSearching(true);
      if (!options.silent) setRegistryError(null);

      let res: Response;
      try {
        const url = new URL(
          "/api/skills/registry/search",
          window.location.origin,
        );
        url.searchParams.set("projectId", props.projectId);
        url.searchParams.set("q", q);
        url.searchParams.set("limit", "20");
        res = await fetch(url.toString());
      } catch (err) {
        setRegistryIsSearching(false);
        if (!options.silent) {
          setRegistryError(
            err instanceof Error ? err.message : "Failed to search registry.",
          );
        }
        return;
      }

      if (!res.ok) {
        setRegistryIsSearching(false);
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

        setRegistryResults(skills);
        setRegistryIsSearching(false);
      } catch (err) {
        setRegistryIsSearching(false);
        if (!options.silent) {
          setRegistryError(
            err instanceof Error
              ? err.message
              : "Failed to parse registry results.",
          );
        }
      }
    },
    [props.projectId],
  );

  const installFromRegistry = async (registryId: string) => {
    if (registryPending) return;

    setRegistryError(null);
    setRegistryPending(null);

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
      let message = `Failed to start install (${res.status}).`;
      try {
        const jsonUnknown: unknown = await res.json();
        const parsed = errorResponseSchema.safeParse(jsonUnknown);
        const fromServer = parsed.success ? parsed.data.error?.message : null;
        if (fromServer) message = fromServer;
      } catch {
        // Ignore.
      }
      setRegistryError(message);
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
    const q = registryQuery.trim();
    if (q.length < 2) {
      setRegistryResults([]);
      setRegistryError(null);
      return;
    }

    const t = setTimeout(() => {
      void searchRegistry(q);
    }, 250);

    return () => clearTimeout(t);
  }, [registryQuery, searchRegistry]);

  useEffect(() => {
    if (!registryPending) return;

    let cancelled = false;

    const poll = async () => {
      while (!cancelled) {
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
          setRegistryPending(null);
          refresh();
          void searchRegistry(registryQuery, { silent: true });
          return;
        }

        if (status === "failed" || status === "canceled") {
          setRegistryPending(null);
          setRegistryError(`Install ${status}.`);
          return;
        }

        await new Promise((r) => setTimeout(r, 1000));
      }
    };

    void poll();

    return () => {
      cancelled = true;
    };
  }, [
    registryPending,
    props.projectId,
    registryQuery,
    refresh,
    searchRegistry,
  ]);

  return (
    <Tabs defaultValue="installed" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList variant="line" className="w-full md:w-auto">
          <TabsTrigger value="installed">Installed</TabsTrigger>
          <TabsTrigger value="registry">Registry</TabsTrigger>
        </TabsList>
        <p className="text-muted-foreground text-sm">
          Skills are injected as an index (progressive disclosure).
        </p>
      </div>

      <TabsContent value="installed" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Project Skills</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm">
                Project skills are stored in the database and override
                repo-bundled skills with the same name. Agents only see skill
                names and descriptions until they call <code>skills.load</code>.
              </p>
            </div>

            {error ? (
              <p
                aria-atomic="true"
                aria-live="polite"
                className="text-destructive text-sm"
                id={errorId}
              >
                {error}
              </p>
            ) : null}

            <form
              aria-describedby={error ? errorId : undefined}
              className="grid gap-4 rounded-xl border bg-muted/20 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void upsert();
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-medium text-sm">
                    {isEditing ? "Edit Skill" : "Add Skill"}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Use this for domain workflows (e.g. sandbox, workflow
                    devkit, AI SDK patterns) or project-specific rules.
                  </p>
                </div>
                {isEditing ? (
                  <Button
                    disabled={isPending}
                    onClick={resetForm}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <XIcon aria-hidden="true" className="size-4" />
                    Cancel
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="font-medium text-sm" htmlFor={nameId}>
                    Name
                  </label>
                  <Input
                    autoCapitalize="none"
                    autoComplete="off"
                    disabled={isPending || isEditing}
                    id={nameId}
                    name="name"
                    onChange={(e) => setName(e.target.value)}
                    placeholder="sandbox, workflow, ai-sdk…"
                    spellCheck={false}
                    value={name}
                  />
                  {isEditing ? (
                    <p className="text-muted-foreground text-xs">
                      Name is fixed while editing. Create a new skill to rename.
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <label
                    className="font-medium text-sm"
                    htmlFor={descriptionId}
                  >
                    Description
                  </label>
                  <Input
                    autoCapitalize="sentences"
                    autoComplete="off"
                    disabled={isPending}
                    id={descriptionId}
                    name="description"
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="When to use this skill…"
                    value={description}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <label className="font-medium text-sm" htmlFor={bodyId}>
                  Instructions (Markdown)
                </label>
                <Textarea
                  disabled={isPending}
                  id={bodyId}
                  name="body"
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="# Skill\n\n## When to use\n- …\n"
                  value={body}
                  className="min-h-[240px] font-mono text-xs leading-relaxed md:text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  aria-busy={isPending}
                  disabled={isPending}
                  type="submit"
                  variant="secondary"
                >
                  {isPending ? (
                    <Loader2Icon
                      aria-hidden="true"
                      className="size-4 motion-safe:animate-spin motion-reduce:animate-none"
                    />
                  ) : null}
                  {isEditing ? "Save" : "Add"}
                </Button>
              </div>
            </form>

            {props.projectSkills.length === 0 ? (
              <Empty className="min-h-[160px] rounded-xl border">
                <EmptyHeader>
                  <EmptyTitle>No project skills</EmptyTitle>
                  <EmptyDescription>
                    Add a skill to give agents specialized instructions without
                    bloating the system prompt.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="grid gap-2">
                {props.projectSkills.map((skill) => (
                  <li key={skill.id}>
                    <div className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium">{skill.name}</p>
                            {skill.origin === "registry" ? (
                              <Badge variant="outline">Registry</Badge>
                            ) : (
                              <Badge variant="secondary">Manual</Badge>
                            )}
                            {skill.bundlePresent ? (
                              <Badge variant="outline">Files</Badge>
                            ) : null}
                            {skill.registrySource ? (
                              <span className="text-muted-foreground text-xs">
                                {skill.registrySource}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-muted-foreground text-sm">
                            {skill.description}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          {skill.origin === "registry" ? (
                            <>
                              <Button
                                disabled={isPending || registryPending !== null}
                                onClick={() =>
                                  skill.registryId
                                    ? void installFromRegistry(skill.registryId)
                                    : undefined
                                }
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <RefreshCwIcon
                                  aria-hidden="true"
                                  className="size-4"
                                />
                                <span className="sr-only">Update skill</span>
                              </Button>
                              <Button
                                asChild
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <a
                                  href={
                                    skill.registryId
                                      ? `https://skills.sh/${skill.registryId}`
                                      : "https://skills.sh/"
                                  }
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  <ExternalLinkIcon
                                    aria-hidden="true"
                                    className="size-4"
                                  />
                                  <span className="sr-only">
                                    Open on skills.sh
                                  </span>
                                </a>
                              </Button>
                              <Button
                                disabled={isPending}
                                onClick={() =>
                                  void deleteSkillById(skill.id, skill.name)
                                }
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <Trash2Icon
                                  aria-hidden="true"
                                  className="size-4 text-destructive"
                                />
                                <span className="sr-only">Uninstall skill</span>
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                disabled={isPending}
                                onClick={() => startEdit(skill)}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <PencilIcon
                                  aria-hidden="true"
                                  className="size-4"
                                />
                                <span className="sr-only">Edit skill</span>
                              </Button>
                              <Button
                                disabled={isPending}
                                onClick={() =>
                                  void deleteSkillById(skill.id, skill.name)
                                }
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <Trash2Icon
                                  aria-hidden="true"
                                  className="size-4 text-destructive"
                                />
                                <span className="sr-only">Delete skill</span>
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Updated: {new Date(skill.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Effective Skills</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              This is the skills index injected into the agent system prompt
              (progressive disclosure). The full <code>SKILL.md</code> content
              is loaded on-demand.
            </p>

            {props.effectiveSkills.length === 0 ? (
              <Empty className="min-h-[120px] rounded-xl border">
                <EmptyHeader>
                  <EmptyTitle>No skills discovered</EmptyTitle>
                  <EmptyDescription>
                    Check that <code>AGENT_SKILLS_DIRS</code> points at skill
                    folders that contain <code>SKILL.md</code>.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="grid gap-2">
                {props.effectiveSkills.map((skill) => {
                  const source = formatSource(skill);
                  return (
                    <li key={`${skill.source}:${skill.name}`}>
                      <div className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{skill.name}</p>
                          <Badge variant={source.variant}>{source.label}</Badge>
                          <span className="text-muted-foreground text-xs">
                            {skill.originLabel}
                          </span>
                        </div>
                        <p className="text-muted-foreground text-sm">
                          {skill.description}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="registry" className="space-y-6">
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
                onChange={(e) => setRegistryQuery(e.target.value)}
                placeholder="e.g. sandbox, vitest, accessibility…"
                spellCheck={false}
                value={registryQuery}
              />
            </div>

            {registryError ? (
              <p className="text-destructive text-sm">{registryError}</p>
            ) : null}

            {registryPending ? (
              <p className="text-muted-foreground text-sm">
                Installing <code>{registryPending.registryId}</code> (workflow:{" "}
                <code>{registryPending.runId}</code>)…
              </p>
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

            {registryResults.length === 0 &&
            registryQuery.trim().length >= 2 ? (
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
                  const canInstall = !registryPending && !isPending;
                  const canUninstall =
                    canInstall && Boolean(skill.installedSkillId);

                  return (
                    <li key={skill.id}>
                      <div className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3">
                        <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-medium">
                                {skill.name}
                              </p>
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
                              Installs: {skill.installs.toLocaleString()}
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
                                  onClick={() =>
                                    void installFromRegistry(skill.id)
                                  }
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
                                  onClick={() =>
                                    skill.installedSkillId
                                      ? void deleteSkillById(
                                          skill.installedSkillId,
                                          skill.name,
                                        )
                                      : undefined
                                  }
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
                                onClick={() =>
                                  void installFromRegistry(skill.id)
                                }
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
      </TabsContent>
    </Tabs>
  );
}
