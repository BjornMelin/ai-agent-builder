import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listRunsByProject } from "@/lib/data/runs.server";

/**
 * Runs tab (P0 list view).
 *
 * @param props - Route params.
 * @returns The runs page.
 */
export default async function RunsPage(
  props: Readonly<{ params: Promise<{ projectId: string }> }>,
) {
  const { projectId } = await props.params;
  const runs = await listRunsByProject(projectId, { limit: 50 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runs</CardTitle>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No runs yet. (P0: create/run UI comes next.)
          </p>
        ) : (
          <ul
            className="grid gap-2"
            style={{
              containIntrinsicSize: "auto 200px",
              contentVisibility: "auto",
            }}
          >
            {runs.map((run) => (
              <li
                className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2"
                key={run.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{run.kind}</p>
                  <p className="truncate text-muted-foreground text-sm">
                    {run.status} · {new Date(run.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="text-muted-foreground text-sm">Run</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
