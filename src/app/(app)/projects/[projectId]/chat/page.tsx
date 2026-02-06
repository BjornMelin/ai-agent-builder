import { Suspense } from "react";
import { ChatContent } from "@/app/(app)/projects/[projectId]/chat/chat-content";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Chat tab.
 *
 * @param props - The component properties.
 * @remarks `props.params` resolves to an object containing the required `projectId`.
 * @returns The chat page.
 */
export default async function ChatPage(
  props: Readonly<{ params: Promise<{ projectId: string }> }>,
) {
  const { projectId } = await props.params;

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
      <ChatContent projectId={projectId} />
    </Suspense>
  );
}
