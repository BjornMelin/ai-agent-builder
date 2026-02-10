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
  useSyncExternalStore,
} from "react";
import { z } from "zod/mini";
import type {
  EffectiveSkillSummary,
  ProjectSkillSummary,
} from "@/app/(app)/projects/[projectId]/skills/skills-types";
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
import { Textarea } from "@/components/ui/textarea";

const errorResponseSchema = z.looseObject({
  error: z.optional(
    z.looseObject({
      code: z.optional(z.string()),
      message: z.optional(z.string()),
    }),
  ),
});

const getSkillResponseSchema = z.looseObject({
  skill: z.optional(
    z.looseObject({
      content: z.string(),
      description: z.string(),
      id: z.string(),
      name: z.string(),
      updatedAt: z.string(),
    }),
  ),
});

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

const useHydrated = () =>
  useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

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
 * Installed skills tab (project overrides + effective skills list).
 *
 * @param props - Installed tab props.
 * @returns Installed skills UI.
 */
export function SkillsInstalledTab(
  props: Readonly<{
    projectId: string;
    projectSkills: readonly ProjectSkillSummary[];
    effectiveSkills: readonly EffectiveSkillSummary[];
    onInstallFromRegistry: (registryId: string) => void | Promise<void>;
    registryPending: Readonly<{ registryId: string; runId: string }> | null;
  }>,
) {
  const router = useRouter();
  const hydrated = useHydrated();

  const nameId = useId();
  const descriptionId = useId();
  const bodyId = useId();
  const errorId = useId();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const isEditing = editingId !== null;

  const refresh = useCallback(() => {
    // Use router.refresh() to refetch the server component and keep URL stable.
    startTransition(() => router.refresh());
  }, [router]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setIsLoadingEdit(false);
    setName("");
    setDescription("");
    setBody("");
    setError(null);
  }, []);

  const loadSkillContentForEdit = useCallback(
    async (skill: ProjectSkillSummary) => {
      setEditingId(skill.id);
      setName(skill.name);
      setDescription(skill.description);
      setBody("");
      setError(null);
      setIsLoadingEdit(true);

      let res: Response;
      try {
        const url = new URL("/api/skills", window.location.origin);
        url.searchParams.set("projectId", props.projectId);
        url.searchParams.set("skillId", skill.id);
        res = await fetch(url.toString());
      } catch (err) {
        setIsLoadingEdit(false);
        setError(
          err instanceof Error ? err.message : "Failed to load skill content.",
        );
        return;
      }

      if (!res.ok) {
        const fromServer = await tryParseErrorMessage(res);
        setIsLoadingEdit(false);
        setError(fromServer ?? `Failed to load skill (${res.status}).`);
        return;
      }

      try {
        const jsonUnknown: unknown = await res.json();
        const parsed = getSkillResponseSchema.safeParse(jsonUnknown);
        if (!parsed.success || !parsed.data.skill) {
          throw new Error("Invalid skill response.");
        }

        const loaded = parsed.data.skill;
        setName(loaded.name);
        setDescription(loaded.description);
        setBody(stripFrontmatter(loaded.content));
        setIsLoadingEdit(false);
      } catch (err) {
        setIsLoadingEdit(false);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to parse skill response.",
        );
      }
    },
    [props.projectId],
  );

  const deleteSkillById = useCallback(
    async (skillId: string, skillName: string) => {
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
        setError(
          err instanceof Error ? err.message : "Failed to delete skill.",
        );
        return;
      }

      if (!res.ok) {
        const fromServer = await tryParseErrorMessage(res);
        setIsPending(false);
        setError(fromServer ?? `Failed to delete skill (${res.status}).`);
        return;
      }

      setIsPending(false);
      resetForm();
      refresh();
    },
    [props.projectId, refresh, resetForm],
  );

  const upsert = useCallback(async () => {
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
      const fromServer = await tryParseErrorMessage(res);
      setIsPending(false);
      setError(fromServer ?? `Failed to save skill (${res.status}).`);
      return;
    }

    setIsPending(false);
    resetForm();
    refresh();
  }, [body, description, name, props.projectId, refresh, resetForm]);

  // Reset edit-loading state if the editing skill disappears after a refresh.
  useEffect(() => {
    if (!editingId) return;
    const stillExists = props.projectSkills.some((s) => s.id === editingId);
    if (!stillExists) resetForm();
  }, [editingId, props.projectSkills, resetForm]);

  return (
    <div className="space-y-6">
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
                  Use this for domain workflows (e.g. sandbox, workflow devkit,
                  AI SDK patterns) or project-specific rules.
                </p>
              </div>
              {isEditing ? (
                <Button
                  disabled={isPending || isLoadingEdit}
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
                  disabled={isPending || isEditing || isLoadingEdit}
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
                <label className="font-medium text-sm" htmlFor={descriptionId}>
                  Description
                </label>
                <Input
                  autoCapitalize="sentences"
                  autoComplete="off"
                  disabled={isPending || isLoadingEdit}
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
                disabled={isPending || isLoadingEdit}
                id={bodyId}
                name="body"
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  isLoadingEdit
                    ? "Loading skill content…"
                    : "# Skill\n\n## When to use\n- …\n"
                }
                value={body}
                className="min-h-[240px] font-mono text-xs leading-relaxed md:text-sm"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                aria-busy={isPending || isLoadingEdit}
                disabled={isPending || isLoadingEdit}
                type="submit"
                variant="secondary"
              >
                {isPending || isLoadingEdit ? (
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
                              disabled={
                                isPending ||
                                isLoadingEdit ||
                                props.registryPending !== null ||
                                !skill.registryId
                              }
                              onClick={() =>
                                skill.registryId
                                  ? void props.onInstallFromRegistry(
                                      skill.registryId,
                                    )
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
                              disabled={isPending || isLoadingEdit}
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
                              disabled={isPending || isLoadingEdit}
                              onClick={() =>
                                void loadSkillContentForEdit(skill)
                              }
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
                              disabled={isPending || isLoadingEdit}
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
                      Updated:{" "}
                      {hydrated
                        ? new Date(skill.updatedAt).toLocaleString()
                        : skill.updatedAt}
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
            (progressive disclosure). The full <code>SKILL.md</code> content is
            loaded on-demand.
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
    </div>
  );
}
