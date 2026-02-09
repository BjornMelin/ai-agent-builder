import type { Octokit } from "@octokit/rest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getContent: vi.fn(),
}));

vi.mock("@/lib/repo/github.client.server", () => ({
  getGitHubClient: () =>
    ({
      repos: {
        getContent: state.getContent,
      },
    }) as unknown as Octokit,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("detectGitHubRepoRuntimeKind", () => {
  it("defaults to node when owner/repo are blank", async () => {
    const { detectGitHubRepoRuntimeKind } = await import(
      "@/lib/repo/repo-kind.server"
    );

    await expect(
      detectGitHubRepoRuntimeKind({ owner: " ", repo: " " }),
    ).resolves.toEqual({
      evidence: {
        hasPackageJson: false,
        hasPyprojectToml: false,
        hasRequirementsTxt: false,
      },
      kind: "node",
    });
  });

  it("detects node when package.json exists and python markers are missing", async () => {
    state.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path === "package.json") return {};
      const err = { status: 404 };
      throw err;
    });

    const { detectGitHubRepoRuntimeKind } = await import(
      "@/lib/repo/repo-kind.server"
    );

    await expect(
      detectGitHubRepoRuntimeKind({ owner: "vercel", repo: "next.js" }),
    ).resolves.toMatchObject({
      evidence: {
        hasPackageJson: true,
        hasPyprojectToml: false,
        hasRequirementsTxt: false,
      },
      kind: "node",
    });
  });

  it("detects python when pyproject.toml exists and package.json is missing", async () => {
    state.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path === "pyproject.toml") return {};
      const err = { status: 404 };
      throw err;
    });

    const { detectGitHubRepoRuntimeKind } = await import(
      "@/lib/repo/repo-kind.server"
    );

    await expect(
      detectGitHubRepoRuntimeKind({ owner: "o", repo: "r" }),
    ).resolves.toMatchObject({
      evidence: {
        hasPackageJson: false,
        hasPyprojectToml: true,
        hasRequirementsTxt: false,
      },
      kind: "python",
    });
  });

  it("detects python when requirements.txt exists and package.json is missing", async () => {
    state.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path === "requirements.txt") return {};
      const err = { status: 404 };
      throw err;
    });

    const { detectGitHubRepoRuntimeKind } = await import(
      "@/lib/repo/repo-kind.server"
    );

    await expect(
      detectGitHubRepoRuntimeKind({ owner: "o", repo: "r" }),
    ).resolves.toMatchObject({
      evidence: {
        hasPackageJson: false,
        hasPyprojectToml: false,
        hasRequirementsTxt: true,
      },
      kind: "python",
    });
  });

  it("defaults to node when both node and python markers exist", async () => {
    state.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path === "package.json" || path === "pyproject.toml") return {};
      const err = { status: 404 };
      throw err;
    });

    const { detectGitHubRepoRuntimeKind } = await import(
      "@/lib/repo/repo-kind.server"
    );

    await expect(
      detectGitHubRepoRuntimeKind({ owner: "o", repo: "r" }),
    ).resolves.toMatchObject({
      evidence: {
        hasPackageJson: true,
        hasPyprojectToml: true,
        hasRequirementsTxt: false,
      },
      kind: "node",
    });
  });

  it("treats non-404 getContent errors as missing (best-effort)", async () => {
    state.getContent.mockRejectedValueOnce({ status: 500 });
    state.getContent.mockRejectedValueOnce(new Error("rate limited"));
    state.getContent.mockRejectedValueOnce({ status: 404 });

    const { detectGitHubRepoRuntimeKind } = await import(
      "@/lib/repo/repo-kind.server"
    );

    await expect(
      detectGitHubRepoRuntimeKind({ owner: "o", repo: "r" }),
    ).resolves.toMatchObject({
      evidence: {
        hasPackageJson: false,
        hasPyprojectToml: false,
        hasRequirementsTxt: false,
      },
      kind: "node",
    });
  });
});
