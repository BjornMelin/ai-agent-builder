import { Suspense } from "react";
import { ChatContent } from "@/app/(app)/projects/[projectId]/chat/chat-content";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Chat tab.
 *
 * @remarks `props.params` resolves to an object containing the required `projectId`.
 * @param props - The component properties.
 * @returns The chat page.
 */
export default async function ChatPage(
  props: Readonly<{
    params: Promise<{ projectId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }>,
) {
  const [{ projectId }, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const threadIdRaw = searchParams.threadId;
  const threadId = typeof threadIdRaw === "string" ? threadIdRaw : undefined;

  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      }
    >
      <ChatContent projectId={projectId} threadId={threadId} />
    </Suspense>
  );
}
