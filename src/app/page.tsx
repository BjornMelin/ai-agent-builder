import { Suspense } from "react";
import { HomeRedirect } from "@/app/home-redirect";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Home page.
 *
 * This app is currently private, so we redirect authenticated + allowlisted
 * users to the projects dashboard.
 *
 * @returns JSX that renders a Suspense boundary; redirects are handled by {@link HomeRedirect}.
 */
export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="space-y-3">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
      }
    >
      <HomeRedirect />
    </Suspense>
  );
}
