import { beforeEach, describe, expect, it, vi } from "vitest";

type SessionUser = {
  email?: string | null;
};

type SessionResult = {
  data: {
    user?: SessionUser | null;
  } | null;
};

class RedirectError extends Error {
  public readonly path: string;

  public constructor(path: string) {
    super(`REDIRECT:${path}`);
    this.path = path;
  }
}

const envState = {
  auth: {
    accessMode: "restricted",
    allowedEmails: [] as string[],
  },
};

const getSessionMock = vi.fn<() => Promise<SessionResult>>();

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    env: envState,
  };
});

vi.mock("@/lib/auth/server", () => ({
  getAuth: () => ({
    getSession: getSessionMock,
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new RedirectError(path);
  },
}));

async function loadRequireAppUser() {
  vi.resetModules();
  return await import("@/lib/auth/access");
}

describe("requireAppUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users to sign-in", async () => {
    envState.auth.accessMode = "restricted";
    envState.auth.allowedEmails = ["user@example.com"];
    getSessionMock.mockResolvedValueOnce({ data: null });

    const { requireAppUser } = await loadRequireAppUser();
    await expect(requireAppUser()).rejects.toMatchObject({
      path: "/auth/sign-in",
    });
  });

  it("allows any authenticated user when access mode is open", async () => {
    envState.auth.accessMode = "open";
    envState.auth.allowedEmails = [];
    getSessionMock.mockResolvedValueOnce({
      data: { user: { email: "open@example.com" } },
    });

    const { requireAppUser } = await loadRequireAppUser();
    const user = await requireAppUser();
    expect(user).toEqual({ email: "open@example.com" });
  });

  it("redirects restricted users who are not allowlisted", async () => {
    envState.auth.accessMode = "restricted";
    envState.auth.allowedEmails = ["allow@example.com"];
    getSessionMock.mockResolvedValueOnce({
      data: { user: { email: "blocked@example.com" } },
    });

    const { requireAppUser } = await loadRequireAppUser();
    await expect(requireAppUser()).rejects.toMatchObject({
      path: "/auth/denied",
    });
  });

  it("redirects restricted users with empty or missing emails", async () => {
    envState.auth.accessMode = "restricted";
    envState.auth.allowedEmails = ["allow@example.com"];
    const { requireAppUser } = await loadRequireAppUser();

    const userCases: SessionUser[] = [{ email: "" }, { email: null }, {}];
    for (const user of userCases) {
      getSessionMock.mockResolvedValueOnce({
        data: { user },
      });

      await expect(requireAppUser()).rejects.toMatchObject({
        path: "/auth/denied",
      });
    }
  });
});
