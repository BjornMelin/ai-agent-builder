import Link from "next/link";

export const dynamic = "force-static";

/**
 * App-level access denied page (authenticated but not allowlisted).
 *
 * @returns The denied page UI.
 */
export default function AccessDeniedPage() {
  return (
    <main className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Access Denied</h1>
      <p className="max-w-lg text-sm text-zinc-600 dark:text-zinc-400">
        You are signed in, but this app is currently restricted to an
        allowlisted set of users. Contact the admin to request access.
      </p>
      <Link
        href="/auth/sign-out"
        className="text-sm underline underline-offset-4 hover:opacity-80"
      >
        Sign Out
      </Link>
    </main>
  );
}
