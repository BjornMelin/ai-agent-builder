import Link from "next/link";

/**
 * Marks the access denied page as statically rendered.
 */
export const dynamic = "force-static";

/**
 * App-level access denied page (authenticated but not allowlisted).
 *
 * @returns The denied page UI.
 */
export default function AccessDeniedPage() {
  return (
    <main
      className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center"
      id="main"
      tabIndex={-1}
    >
      <h1 className="text-2xl font-semibold tracking-tight">Access Denied</h1>
      <p className="max-w-lg text-sm text-zinc-600 dark:text-zinc-400">
        This app is currently restricted to an allowlisted set of users. If you
        believe you should have access, contact the admin to request it.
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
