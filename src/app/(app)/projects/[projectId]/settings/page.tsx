import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { budgets } from "@/lib/config/budgets.server";
import { env } from "@/lib/env";

type FeatureStatus =
  | Readonly<{ status: "configured" }>
  | Readonly<{ status: "missing"; message: string }>;

function safeFeature(getter: () => unknown): FeatureStatus {
  try {
    getter();
    return { status: "configured" };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Missing configuration.";
    return { message, status: "missing" };
  }
}

/**
 * Settings tab (P0: budgets + integration status).
 *
 * @returns The settings page.
 */
export default async function ProjectSettingsPage() {
  const aiGateway = safeFeature(() => env.aiGateway);
  const upstash = safeFeature(() => env.upstash);
  const qstashPublish = safeFeature(() => env.qstashPublish);
  const qstashVerify = safeFeature(() => env.qstashVerify);

  const nf = new Intl.NumberFormat();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Budgets</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <dl className="grid gap-3">
            <div>
              <dt className="text-muted-foreground">Max vector topK</dt>
              <dd className="font-medium">
                {nf.format(budgets.maxVectorTopK)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Max upload bytes</dt>
              <dd className="font-medium">
                {nf.format(budgets.maxUploadBytes)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Max embed batch size</dt>
              <dd className="font-medium">
                {nf.format(budgets.maxEmbedBatchSize)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tool cache TTL (s)</dt>
              <dd className="font-medium">
                {nf.format(budgets.toolCacheTtlSeconds)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <ul className="grid gap-3">
            <li>
              <p className="font-medium">AI Gateway</p>
              <p className="text-muted-foreground">
                {aiGateway.status === "configured"
                  ? "Configured"
                  : aiGateway.message}
              </p>
            </li>
            <li>
              <p className="font-medium">Upstash (Redis + Vector)</p>
              <p className="text-muted-foreground">
                {upstash.status === "configured"
                  ? "Configured"
                  : upstash.message}
              </p>
            </li>
            <li>
              <p className="font-medium">QStash publish</p>
              <p className="text-muted-foreground">
                {qstashPublish.status === "configured"
                  ? "Configured"
                  : qstashPublish.message}
              </p>
            </li>
            <li>
              <p className="font-medium">QStash verify</p>
              <p className="text-muted-foreground">
                {qstashVerify.status === "configured"
                  ? "Configured"
                  : qstashVerify.message}
              </p>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
