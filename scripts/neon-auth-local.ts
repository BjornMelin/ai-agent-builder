import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config as loadDotenv, parse as parseDotenv } from "dotenv";
import { Client } from "pg";

const NEON_API_BASE_URL = "https://console.neon.tech/api/v2";
const DEFAULT_EXPECTED_BRANCH = "vercel-dev";
const DEFAULT_LOCAL_ORIGIN = "http://localhost:3000";
const MAX_SIGNUP_RETRIES = 5;
const DEFAULT_NEON_API_TIMEOUT = 15_000;

type Action = "audit" | "create" | "info" | "lib" | "repair" | "smoke";

type HeadersInput = Record<string, string>;

interface AuthBranchContext {
  branchId: string;
  branchName: string;
  endpointId: string;
  neonAuthBaseUrl: string;
  projectId: string;
}

interface CredentialUserRow {
  authUserId: string;
  email: string;
  name: string | null;
  password: string | null;
  passwordLength: number | null;
}

interface SignInProbeResult {
  code?: string;
  message?: string;
  responseBody: string;
  status: number;
}

interface SignUpResult {
  code?: string;
  message?: string;
  responseBody: string;
  status: number;
  userId?: string;
}

interface NeonEndpoint {
  branch_id: string;
  id: string;
}

interface NeonEndpointsResponse {
  endpoints?: NeonEndpoint[];
}

interface NeonBranch {
  id: string;
  name?: string;
}

interface NeonBranchResponse {
  branch?: NeonBranch;
}

interface AuditArgs {
  expectedBranchName: string;
  projectId?: string;
  skipVercelPull: boolean;
  strict: boolean;
}

interface RepairArgs {
  allowBranchMismatch: boolean;
  dryRun: boolean;
  emails: string[];
  expectedBranchName: string;
  password?: string;
  projectId?: string;
}

interface SmokeArgs {
  allowBranchMismatch: boolean;
  checks: Array<{ email: string; password: string }>;
  expectedBranchName: string;
  projectId?: string;
  skipWrongPasswordProbe: boolean;
}

interface CreateArgs {
  allowBranchMismatch: boolean;
  dryRun: boolean;
  emails: string[];
  expectedBranchName: string;
  name?: string;
  password?: string;
  projectId?: string;
  verify: boolean;
}

async function main(): Promise<void> {
  loadLocalEnv();

  const { action, argv } = parseAction(process.argv.slice(2));
  if (!action) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp(action);
    return;
  }

  if (action === "audit") {
    const args = parseAuditArgs(argv);
    await runAudit(args);
    return;
  }

  if (action === "create") {
    const args = parseCreateArgs(argv);
    await runCreate(args);
    return;
  }

  if (action === "repair") {
    const args = parseRepairArgs(argv);
    await runRepair(args);
    return;
  }

  if (action === "smoke") {
    const args = parseSmokeArgs(argv);
    await runSmoke(args);
    return;
  }

  if (action === "info" || action === "lib") {
    const args = parseInfoArgs(argv);
    await runInfo(args);
    return;
  }

  printHelp();
  process.exitCode = 1;
}

function loadLocalEnv(): void {
  loadDotenv({ override: false, path: ".env.local", quiet: true });
  loadDotenv({ override: false, path: ".env", quiet: true });
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value.trim();
}

function resolveProjectId(explicitProjectId?: string): string {
  if (explicitProjectId && explicitProjectId.trim().length > 0) {
    return explicitProjectId.trim();
  }

  const fromEnv = process.env.NEON_PROJECT_ID;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }

  const neonContextPath = resolve(".neon");
  if (!existsSync(neonContextPath)) {
    throw new Error(
      "Unable to resolve Neon project id. Set NEON_PROJECT_ID or create .neon.",
    );
  }

  const parsed = JSON.parse(readFileSync(neonContextPath, "utf8")) as unknown;
  if (!isRecord(parsed) || typeof parsed.projectId !== "string") {
    throw new Error("Unable to resolve project id from .neon.");
  }

  return parsed.projectId;
}

function resolveLocalOrigin(): string {
  const appBaseUrl = process.env.APP_BASE_URL;
  if (!appBaseUrl || appBaseUrl.trim().length === 0) {
    return DEFAULT_LOCAL_ORIGIN;
  }

  try {
    const url = new URL(appBaseUrl.trim());
    return url.origin;
  } catch {
    return DEFAULT_LOCAL_ORIGIN;
  }
}

function extractEndpointId(neonAuthBaseUrl: string): string {
  const url = new URL(neonAuthBaseUrl);
  const hostPart = url.hostname.split(".")[0];
  if (!hostPart || !hostPart.startsWith("ep-")) {
    throw new Error(
      `Unable to parse endpoint id from NEON_AUTH_BASE_URL host: ${url.hostname}`,
    );
  }
  return hostPart;
}

async function resolveAuthBranchContext(
  projectId: string,
  neonApiKey: string,
  neonAuthBaseUrl: string,
): Promise<AuthBranchContext> {
  const endpointId = extractEndpointId(neonAuthBaseUrl);
  const endpointsResponse = await neonApiRequest<NeonEndpointsResponse>(
    neonApiKey,
    `/projects/${projectId}/endpoints`,
  );
  const endpoints = endpointsResponse.data.endpoints ?? [];
  const endpoint = endpoints.find((item) => item.id === endpointId);
  if (!endpoint) {
    throw new Error(
      `Endpoint ${endpointId} was not found in Neon project ${projectId}.`,
    );
  }

  const branchId = endpoint.branch_id;
  const branchName = await resolveBranchName(projectId, branchId, neonApiKey);

  return {
    branchId,
    branchName,
    endpointId,
    neonAuthBaseUrl,
    projectId,
  };
}

async function resolveBranchName(
  projectId: string,
  branchId: string,
  neonApiKey: string,
): Promise<string> {
  const fromCli = resolveBranchNameViaNeonCli(projectId, branchId);
  if (fromCli) return fromCli;

  try {
    const response = await neonApiRequest<NeonBranchResponse>(
      neonApiKey,
      `/projects/${projectId}/branches/${branchId}`,
    );
    return response.data.branch?.name ?? branchId;
  } catch {
    return branchId;
  }
}

function resolveBranchNameViaNeonCli(
  projectId: string,
  branchId: string,
): string | undefined {
  try {
    const output = execFileSync(
      "neon",
      ["branches", "list", "--project-id", projectId, "--output", "json"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const parsed = JSON.parse(output) as unknown;
    if (!Array.isArray(parsed)) return undefined;

    for (const item of parsed) {
      if (
        isRecord(item) &&
        item.id === branchId &&
        typeof item.name === "string"
      ) {
        return item.name;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function listCredentialUsers(
  databaseUrl: string,
): Promise<CredentialUserRow[]> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{
      auth_user_id: string;
      email: string;
      name: string | null;
      password: string | null;
      password_length: number | null;
    }>(`
      select
        u.id as auth_user_id,
        lower(u.email) as email,
        u.name as name,
        a.password as password,
        length(a.password) as password_length
      from neon_auth."user" u
      join neon_auth.account a
        on a."userId" = u.id
       and a."providerId" = 'credential'
      where u.email is not null
        and length(trim(u.email)) > 0
      order by u."createdAt" asc
    `);

    return result.rows.map((row) => ({
      authUserId: row.auth_user_id,
      email: normalizeEmail(row.email),
      name: row.name,
      password: row.password,
      passwordLength:
        typeof row.password_length === "number" ? row.password_length : null,
    }));
  } finally {
    await client.end();
  }
}

function looksLikeCredentialHash(password: string | null): boolean {
  if (!password || password.length < 24) return false;

  if (
    password.startsWith("$2") ||
    password.startsWith("$argon2") ||
    password.startsWith("scrypt:")
  ) {
    return true;
  }

  if (password.includes(":") && password.length >= 32) return true;

  return /^[A-Za-z0-9+/=]{80,}$/.test(password);
}

async function probeSignInEmailPassword(
  neonAuthBaseUrl: string,
  origin: string,
  email: string,
  password: string,
): Promise<SignInProbeResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, DEFAULT_NEON_API_TIMEOUT);

  let response: Response;
  try {
    response = await fetch(`${neonAuthBaseUrl}/sign-in/email`, {
      body: JSON.stringify({ email, password }),
      headers: {
        "content-type": "application/json",
        origin,
      },
      method: "POST",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Neon Auth sign-in probe timed out after ${DEFAULT_NEON_API_TIMEOUT}ms.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const responseBody = await response.text();
  const parsed = tryParseJson(responseBody);
  const code =
    isRecord(parsed) && typeof parsed.code === "string"
      ? parsed.code
      : undefined;
  const message =
    isRecord(parsed) && typeof parsed.message === "string"
      ? parsed.message
      : undefined;

  const result: SignInProbeResult = { responseBody, status: response.status };
  if (code !== undefined) result.code = code;
  if (message !== undefined) result.message = message;
  return result;
}

async function signUpEmailPassword(
  neonAuthBaseUrl: string,
  origin: string,
  callbackUrl: string,
  email: string,
  password: string,
  name: string,
): Promise<SignUpResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, DEFAULT_NEON_API_TIMEOUT);

  let response: Response;
  try {
    response = await fetch(`${neonAuthBaseUrl}/sign-up/email`, {
      body: JSON.stringify({
        callbackURL: callbackUrl,
        email,
        name,
        password,
      }),
      headers: {
        "content-type": "application/json",
        origin,
      },
      method: "POST",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Neon Auth sign-up timed out after ${DEFAULT_NEON_API_TIMEOUT}ms.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const responseBody = await response.text();
  const parsed = tryParseJson(responseBody);
  const code =
    isRecord(parsed) && typeof parsed.code === "string"
      ? parsed.code
      : undefined;
  const message =
    isRecord(parsed) && typeof parsed.message === "string"
      ? parsed.message
      : undefined;
  const userId =
    isRecord(parsed) &&
    isRecord(parsed.user) &&
    typeof parsed.user.id === "string"
      ? parsed.user.id
      : undefined;

  const result: SignUpResult = { responseBody, status: response.status };
  if (code !== undefined) result.code = code;
  if (message !== undefined) result.message = message;
  if (userId !== undefined) result.userId = userId;
  return result;
}

async function deleteAuthUser(
  projectId: string,
  branchId: string,
  neonApiKey: string,
  authUserId: string,
): Promise<number> {
  const response = await neonApiRequest<unknown>(
    neonApiKey,
    `/projects/${projectId}/branches/${branchId}/auth/users/${authUserId}`,
    "DELETE",
    undefined,
    [204, 404],
  );
  return response.status;
}

function pullVercelDevelopmentEnv(targetPath: string): Record<string, string> {
  const parentDir = dirname(resolve(targetPath));
  mkdirSync(parentDir, { recursive: true });

  execFileSync(
    "vercel",
    ["env", "pull", "--yes", "--environment=development", targetPath],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  const content = readFileSync(targetPath, "utf8");
  return parseDotenv(content);
}

function generateTemporaryPassword(): string {
  const suffix = crypto.randomUUID().replaceAll("-", "");
  return `Aa!${suffix.slice(0, 20)}`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function normalizeEmail(value: string): string {
  // Intentional duplication of `normalizeEmail` from `src/lib/env.ts` to keep this
  // CLI script isolated from app-only env parsing dependencies.
  // TODO(normalizeEmail): centralize and import from `src/lib/env.ts` (or a shared module).
  return value.trim().toLowerCase();
}

function printSummary(label: string, value: string): void {
  console.log(`${label.padEnd(30, " ")} ${value}`);
}

async function getEmailPasswordConfig(
  projectId: string,
  branchId: string,
  neonApiKey: string,
): Promise<unknown> {
  const response = await neonApiRequest<unknown>(
    neonApiKey,
    `/projects/${projectId}/branches/${branchId}/auth/email_and_password`,
  );
  return response.data;
}

async function runInfo(args: { projectId?: string }): Promise<void> {
  const databaseUrl = getRequiredEnv("DATABASE_URL");
  const neonAuthBaseUrl = getRequiredEnv("NEON_AUTH_BASE_URL");
  const neonApiKey = getRequiredEnv("NEON_API_KEY");
  const projectId = resolveProjectId(args.projectId);
  const origin = resolveLocalOrigin();

  const context = await resolveAuthBranchContext(
    projectId,
    neonApiKey,
    neonAuthBaseUrl,
  );

  console.log("");
  console.log("Neon Auth Local Info");
  console.log("====================");
  printSummary("Project", context.projectId);
  printSummary("Auth Endpoint", context.endpointId);
  printSummary(
    "Resolved Branch",
    `${context.branchName} (${context.branchId})`,
  );
  printSummary("Origin", origin);

  try {
    const emailPasswordConfig = await getEmailPasswordConfig(
      context.projectId,
      context.branchId,
      neonApiKey,
    );
    const safeSummary =
      emailPasswordConfig && typeof emailPasswordConfig === "object"
        ? {
            keys: Object.keys(
              emailPasswordConfig as Record<string, unknown>,
            ).sort(),
          }
        : { type: typeof emailPasswordConfig };
    const configString = JSON.stringify(safeSummary);
    printSummary(
      "Email/Password Config",
      configString.length > 96
        ? `${configString.slice(0, 96)}...`
        : configString,
    );
  } catch (error) {
    printSummary("Email/Password Config", `error (${formatError(error)})`);
  }

  const users = await listCredentialUsers(databaseUrl);
  printSummary("Credential Users", `${users.length}`);
}

async function runAudit(args: AuditArgs): Promise<void> {
  const databaseUrl = getRequiredEnv("DATABASE_URL");
  const neonAuthBaseUrl = getRequiredEnv("NEON_AUTH_BASE_URL");
  const neonApiKey = getRequiredEnv("NEON_API_KEY");
  const projectId = resolveProjectId(args.projectId);
  const origin = resolveLocalOrigin();

  const context = await resolveAuthBranchContext(
    projectId,
    neonApiKey,
    neonAuthBaseUrl,
  );
  const branchMatches = context.branchName === args.expectedBranchName;

  console.log("");
  console.log("Neon Auth Local Audit");
  console.log("=====================");
  printSummary("Project", context.projectId);
  printSummary("Auth Endpoint", context.endpointId);
  printSummary(
    "Resolved Branch",
    `${context.branchName} (${context.branchId})`,
  );
  printSummary("Expected Branch", args.expectedBranchName);
  printSummary("Branch Match", branchMatches ? "yes" : "no");
  printSummary("Origin", origin);

  let vercelEnvMatch = true;
  if (!args.skipVercelPull) {
    try {
      const pulled = pullVercelDevelopmentEnv(
        ".tmp/.env.vercel-development.local",
      );
      const pulledAuthBaseUrl = pulled.NEON_AUTH_BASE_URL ?? "";
      const pulledDatabaseUrl = pulled.DATABASE_URL ?? "";
      const authMatches = pulledAuthBaseUrl === neonAuthBaseUrl;
      const dbMatches = pulledDatabaseUrl === databaseUrl;
      vercelEnvMatch = authMatches && dbMatches;
      printSummary("Vercel Dev Pull", "ok");
      printSummary("Vercel Auth URL Match", authMatches ? "yes" : "no");
      printSummary("Vercel DB URL Match", dbMatches ? "yes" : "no");
    } catch (error) {
      vercelEnvMatch = false;
      printSummary("Vercel Dev Pull", "failed");
      printSummary("Vercel Pull Error", formatError(error));
    }
  } else {
    printSummary("Vercel Dev Pull", "skipped");
  }

  try {
    const emailPasswordConfig = await getEmailPasswordConfig(
      context.projectId,
      context.branchId,
      neonApiKey,
    );
    const safeSummary =
      emailPasswordConfig && typeof emailPasswordConfig === "object"
        ? {
            keys: Object.keys(
              emailPasswordConfig as Record<string, unknown>,
            ).sort(),
          }
        : { type: typeof emailPasswordConfig };
    const configString = JSON.stringify(safeSummary);
    printSummary(
      "Email/Password Config",
      configString.length > 96
        ? `${configString.slice(0, 96)}...`
        : configString,
    );
  } catch (error) {
    printSummary("Email/Password Config", `error (${formatError(error)})`);
  }

  const users = await listCredentialUsers(databaseUrl);
  printSummary("Credential Users", `${users.length}`);

  const probeRows: Array<{
    authUserId: string;
    email: string;
    hashLike: boolean;
    passwordLength: number | null;
    probeCode: string;
    probeStatus: number;
    signIn500: boolean;
  }> = [];

  for (const user of users) {
    const probe = await probeSignInEmailPassword(
      neonAuthBaseUrl,
      origin,
      user.email,
      `__invalid__${crypto.randomUUID()}`,
    );
    probeRows.push({
      authUserId: user.authUserId,
      email: user.email,
      hashLike: looksLikeCredentialHash(user.password),
      passwordLength: user.passwordLength,
      probeCode: probe.code ?? "",
      probeStatus: probe.status,
      signIn500: probe.status === 500,
    });
  }

  const suspiciousRows = probeRows.filter(
    (row) => row.signIn500 || !row.hashLike || (row.passwordLength ?? 0) < 20,
  );

  if (probeRows.length > 0) {
    console.log("");
    console.log("Credential probe results");
    console.table(probeRows);
  }

  if (suspiciousRows.length > 0) {
    console.log("");
    console.log("Suspicious credential rows detected");
    console.table(suspiciousRows);
    const command = [
      "bun run auth:repair:local",
      ...suspiciousRows.map((row) => `--email ${row.email}`),
    ].join(" ");
    console.log("");
    console.log(`Suggested repair command: ${command}`);
  }

  const hasIssues =
    !branchMatches || !vercelEnvMatch || suspiciousRows.length > 0;

  console.log("");
  printSummary("Audit Result", hasIssues ? "issues_detected" : "ok");

  if (args.strict && hasIssues) process.exitCode = 1;
}

async function runRepair(args: RepairArgs): Promise<void> {
  const databaseUrl = getRequiredEnv("DATABASE_URL");
  const neonAuthBaseUrl = getRequiredEnv("NEON_AUTH_BASE_URL");
  const neonApiKey = getRequiredEnv("NEON_API_KEY");
  const projectId = resolveProjectId(args.projectId);
  const origin = resolveLocalOrigin();

  const context = await resolveAuthBranchContext(
    projectId,
    neonApiKey,
    neonAuthBaseUrl,
  );

  console.log("");
  console.log("Neon Auth Local Repair");
  console.log("======================");
  printSummary("Project", context.projectId);
  printSummary("Auth Endpoint", context.endpointId);
  printSummary(
    "Resolved Branch",
    `${context.branchName} (${context.branchId})`,
  );
  printSummary("Expected Branch", args.expectedBranchName);
  printSummary("Dry Run", args.dryRun ? "yes" : "no");
  printSummary("Origin", origin);

  if (
    !args.allowBranchMismatch &&
    context.branchName !== args.expectedBranchName
  ) {
    throw new Error(
      `Resolved branch "${context.branchName}" does not match expected "${args.expectedBranchName}".`,
    );
  }

  const users = await listCredentialUsers(databaseUrl);
  const byEmail = new Map(
    users.map((user) => [normalizeEmail(user.email), user]),
  );

  const targetEmails =
    args.emails.length > 0
      ? args.emails
      : await detectBrokenEmails(users, neonAuthBaseUrl, origin);

  if (targetEmails.length === 0) {
    console.log("");
    printSummary("Repair Result", "nothing_to_repair");
    return;
  }

  console.log("");
  console.log(`Target users: ${targetEmails.join(", ")}`);

  const successes: Array<{
    email: string;
    newUserId: string;
    oldUserId: string | null;
    password: string;
  }> = [];
  const failures: Array<{ email: string; error: string }> = [];

  for (const email of targetEmails) {
    const normalized = normalizeEmail(email);
    const user = byEmail.get(normalized);

    if (args.dryRun) {
      if (!user) {
        console.log(
          `[dry-run] would create ${normalized} (missing locally) on branch ${context.branchName}`,
        );
      } else {
        console.log(
          `[dry-run] would reset ${normalized} (${user.authUserId}) on branch ${context.branchName}`,
        );
      }
      continue;
    }

    try {
      const password = args.password ?? generateTemporaryPassword();
      const signupName = user?.name?.trim() || deriveDisplayName(normalized);

      if (user) {
        await deleteAuthUser(
          context.projectId,
          context.branchId,
          neonApiKey,
          user.authUserId,
        );
      }

      const signUpResult = await signUpWithRetry(
        neonAuthBaseUrl,
        origin,
        origin,
        normalized,
        password,
        signupName,
      );

      if (signUpResult.status !== 200 || !signUpResult.userId) {
        throw new Error(
          `Sign-up failed (${signUpResult.status}): ${signUpResult.responseBody}`,
        );
      }

      const verifySignIn = await probeSignInEmailPassword(
        neonAuthBaseUrl,
        origin,
        normalized,
        password,
      );
      if (verifySignIn.status !== 200) {
        throw new Error(
          `Sign-in verification failed (${verifySignIn.status}): ${verifySignIn.responseBody}`,
        );
      }

      console.log(
        `repaired ${normalized}: old=${user?.authUserId ?? "missing"}, new=${signUpResult.userId}`,
      );
      successes.push({
        email: normalized,
        newUserId: signUpResult.userId,
        oldUserId: user?.authUserId ?? null,
        password,
      });
    } catch (error) {
      failures.push({ email: normalized, error: formatError(error) });
    }
  }

  if (successes.length > 0) {
    console.log("");
    console.log("Repaired users (save temporary passwords securely)");
    console.table(successes);
  }

  if (failures.length > 0) {
    console.log("");
    console.log("Repair failures");
    console.table(failures);
  }

  console.log("");
  printSummary(
    "Repair Result",
    failures.length > 0 ? "partial_or_failed" : "ok",
  );
  if (failures.length > 0) process.exitCode = 1;
}

async function runSmoke(args: SmokeArgs): Promise<void> {
  const databaseUrl = getRequiredEnv("DATABASE_URL");
  const neonAuthBaseUrl = getRequiredEnv("NEON_AUTH_BASE_URL");
  const neonApiKey = getRequiredEnv("NEON_API_KEY");
  const projectId = resolveProjectId(args.projectId);
  const origin = resolveLocalOrigin();

  const context = await resolveAuthBranchContext(
    projectId,
    neonApiKey,
    neonAuthBaseUrl,
  );

  console.log("");
  console.log("Neon Auth Local Smoke");
  console.log("=====================");
  printSummary("Project", context.projectId);
  printSummary("Auth Endpoint", context.endpointId);
  printSummary(
    "Resolved Branch",
    `${context.branchName} (${context.branchId})`,
  );
  printSummary("Expected Branch", args.expectedBranchName);
  printSummary("Origin", origin);

  if (
    !args.allowBranchMismatch &&
    context.branchName !== args.expectedBranchName
  ) {
    throw new Error(
      `Resolved branch "${context.branchName}" does not match expected "${args.expectedBranchName}".`,
    );
  }

  const failures: Array<{
    detail: string;
    email: string;
    expectedStatus: number;
    gotStatus: number;
  }> = [];

  if (!args.skipWrongPasswordProbe) {
    const users = await listCredentialUsers(databaseUrl);
    printSummary("Credential Users", `${users.length}`);
    for (const user of users) {
      const probe = await probeSignInEmailPassword(
        neonAuthBaseUrl,
        origin,
        user.email,
        `__invalid__${crypto.randomUUID()}`,
      );
      if (probe.status !== 401) {
        failures.push({
          detail: probe.code ?? probe.message ?? "unexpected response",
          email: user.email,
          expectedStatus: 401,
          gotStatus: probe.status,
        });
      }
    }
  } else {
    printSummary("Wrong-Password Probe", "skipped");
  }

  for (const check of args.checks) {
    const probe = await probeSignInEmailPassword(
      neonAuthBaseUrl,
      origin,
      check.email,
      check.password,
    );
    if (probe.status !== 200) {
      failures.push({
        detail: probe.code ?? probe.message ?? "unexpected response",
        email: check.email,
        expectedStatus: 200,
        gotStatus: probe.status,
      });
    }
  }

  if (failures.length > 0) {
    console.log("");
    console.log("Smoke check failures");
    console.table(failures);
  }

  console.log("");
  printSummary("Smoke Result", failures.length > 0 ? "failed" : "ok");
  if (failures.length > 0) process.exitCode = 1;
}

async function runCreate(args: CreateArgs): Promise<void> {
  const neonAuthBaseUrl = getRequiredEnv("NEON_AUTH_BASE_URL");
  const neonApiKey = getRequiredEnv("NEON_API_KEY");
  const projectId = resolveProjectId(args.projectId);
  const origin = resolveLocalOrigin();

  const context = await resolveAuthBranchContext(
    projectId,
    neonApiKey,
    neonAuthBaseUrl,
  );

  console.log("");
  console.log("Neon Auth Local Create");
  console.log("======================");
  printSummary("Project", context.projectId);
  printSummary("Auth Endpoint", context.endpointId);
  printSummary(
    "Resolved Branch",
    `${context.branchName} (${context.branchId})`,
  );
  printSummary("Expected Branch", args.expectedBranchName);
  printSummary("Dry Run", args.dryRun ? "yes" : "no");
  printSummary("Verify", args.verify ? "yes" : "no");
  printSummary("Origin", origin);

  if (
    !args.allowBranchMismatch &&
    context.branchName !== args.expectedBranchName
  ) {
    throw new Error(
      `Resolved branch "${context.branchName}" does not match expected "${args.expectedBranchName}".`,
    );
  }

  if (args.emails.length === 0) {
    throw new Error("Provide at least one --email.");
  }

  const successes: Array<{ email: string; password: string; userId: string }> =
    [];
  const failures: Array<{ email: string; error: string }> = [];

  for (const email of args.emails) {
    const normalized = normalizeEmail(email);
    const password = args.password ?? generateTemporaryPassword();
    const name = args.name?.trim() || deriveDisplayName(normalized);

    if (args.dryRun) {
      console.log(`[dry-run] would create ${normalized}`);
      continue;
    }

    try {
      const signUpResult = await signUpWithRetry(
        neonAuthBaseUrl,
        origin,
        origin,
        normalized,
        password,
        name,
      );

      if (signUpResult.status !== 200 || !signUpResult.userId) {
        throw new Error(
          `Sign-up failed (${signUpResult.status}): ${signUpResult.responseBody}`,
        );
      }

      if (args.verify) {
        const verifySignIn = await probeSignInEmailPassword(
          neonAuthBaseUrl,
          origin,
          normalized,
          password,
        );
        if (verifySignIn.status !== 200) {
          throw new Error(
            `Sign-in verification failed (${verifySignIn.status}): ${verifySignIn.responseBody}`,
          );
        }
      }

      successes.push({
        email: normalized,
        password,
        userId: signUpResult.userId,
      });
    } catch (error) {
      failures.push({ email: normalized, error: formatError(error) });
    }
  }

  if (successes.length > 0) {
    console.log("");
    console.log("Created users (save passwords securely)");
    console.table(successes);
  }

  if (failures.length > 0) {
    console.log("");
    console.log("Create failures");
    console.table(failures);
  }

  console.log("");
  printSummary(
    "Create Result",
    failures.length > 0 ? "partial_or_failed" : "ok",
  );
  if (failures.length > 0) process.exitCode = 1;
}

async function detectBrokenEmails(
  users: CredentialUserRow[],
  neonAuthBaseUrl: string,
  origin: string,
): Promise<string[]> {
  const broken: string[] = [];
  for (const user of users) {
    const probe = await probeSignInEmailPassword(
      neonAuthBaseUrl,
      origin,
      user.email,
      `__invalid__${crypto.randomUUID()}`,
    );
    if (probe.status === 500) broken.push(user.email);
  }
  return Array.from(new Set(broken.map((email) => normalizeEmail(email))));
}

async function signUpWithRetry(
  neonAuthBaseUrl: string,
  origin: string,
  callbackUrl: string,
  email: string,
  password: string,
  name: string,
): Promise<SignUpResult> {
  let latest = await signUpEmailPassword(
    neonAuthBaseUrl,
    origin,
    callbackUrl,
    email,
    password,
    name,
  );
  if (latest.status === 200) return latest;

  for (let attempt = 2; attempt <= MAX_SIGNUP_RETRIES; attempt += 1) {
    if (!(latest.status === 409 || latest.status >= 500)) return latest;
    await sleep(attempt * 500);
    latest = await signUpEmailPassword(
      neonAuthBaseUrl,
      origin,
      callbackUrl,
      email,
      password,
      name,
    );
    if (latest.status === 200) return latest;
  }

  return latest;
}

async function neonApiRequest<T>(
  neonApiKey: string,
  path: string,
  method: "DELETE" | "GET" | "PATCH" | "POST" = "GET",
  body?: unknown,
  expectedStatuses: number[] = [200],
): Promise<{ data: T; status: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, DEFAULT_NEON_API_TIMEOUT);

  const headers: HeadersInput = {
    Accept: "application/json",
    Authorization: `Bearer ${neonApiKey}`,
  };

  const requestInit: {
    body?: string;
    headers: HeadersInput;
    method: string;
    signal?: AbortSignal;
  } = {
    headers,
    method,
    signal: controller.signal,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestInit.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${NEON_API_BASE_URL}${path}`, requestInit);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Neon API request timed out after ${DEFAULT_NEON_API_TIMEOUT}ms for ${path}.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
  const responseText = await response.text();
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `Neon API request failed (${response.status}) for ${path}: ${responseText}`,
    );
  }

  const parsed = tryParseJson(responseText);
  return { data: parsed as T, status: response.status };
}

function tryParseJson(input: string): unknown {
  if (!input || input.trim().length === 0) return undefined;
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deriveDisplayName(email: string): string {
  const localPart = email.split("@")[0] ?? "User";
  const cleaned = localPart.replace(/[^A-Za-z0-9._-]/g, "");
  if (cleaned.length === 0) return "User";
  return cleaned.slice(0, 48);
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function parseAction(args: string[]): {
  action: Action | null;
  argv: string[];
} {
  if (args.length === 0) return { action: null, argv: [] };

  const actionFromFlag = readStringFlag(args, "--action");
  if (actionFromFlag) {
    const remaining: string[] = [];
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === "--action") {
        i += 1;
        continue;
      }
      const token = args[i];
      if (!token) continue;
      remaining.push(token);
    }
    return { action: normalizeAction(actionFromFlag), argv: remaining };
  }

  const first = args[0];
  if (!first || first.startsWith("-")) return { action: null, argv: args };
  return { action: normalizeAction(first), argv: args.slice(1) };
}

function normalizeAction(value: string): Action | null {
  const v = value.trim().toLowerCase();
  if (v === "audit") return "audit";
  if (v === "create") return "create";
  if (v === "repair") return "repair";
  if (v === "smoke") return "smoke";
  if (v === "info") return "info";
  if (v === "lib") return "lib";
  return null;
}

function parseInfoArgs(argv: string[]): { projectId?: string } {
  const projectId = readStringFlag(argv, "--project-id");
  const out: { projectId?: string } = {};
  if (projectId && projectId.trim().length > 0)
    out.projectId = projectId.trim();
  return out;
}

function parseAuditArgs(argv: string[]): AuditArgs {
  const expectedBranchName =
    readStringFlag(argv, "--expected-branch-name")?.trim() ??
    DEFAULT_EXPECTED_BRANCH;
  const projectId = readStringFlag(argv, "--project-id")?.trim();

  const out: AuditArgs = {
    expectedBranchName,
    skipVercelPull: argv.includes("--skip-vercel-pull"),
    strict: !argv.includes("--no-strict"),
  };
  if (projectId && projectId.length > 0) out.projectId = projectId;
  return out;
}

function parseRepairArgs(argv: string[]): RepairArgs {
  const expectedBranchName =
    readStringFlag(argv, "--expected-branch-name")?.trim() ??
    DEFAULT_EXPECTED_BRANCH;
  const projectId = readStringFlag(argv, "--project-id")?.trim();
  const password = readStringFlag(argv, "--password");

  const emails: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--email") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --email");
      emails.push(normalizeEmail(value));
      i += 1;
    }
  }

  const out: RepairArgs = {
    allowBranchMismatch: argv.includes("--allow-branch-mismatch"),
    dryRun: argv.includes("--dry-run"),
    emails: Array.from(new Set(emails)),
    expectedBranchName,
  };
  if (projectId && projectId.length > 0) out.projectId = projectId;
  if (password && password.length > 0) out.password = password;
  return out;
}

function parseSmokeArgs(argv: string[]): SmokeArgs {
  const expectedBranchName =
    readStringFlag(argv, "--expected-branch-name")?.trim() ??
    DEFAULT_EXPECTED_BRANCH;
  const projectId = readStringFlag(argv, "--project-id")?.trim();

  const checks: Array<{ email: string; password: string }> = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--check") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --check");
      const sep = value.indexOf(":");
      if (sep <= 0 || sep === value.length - 1) {
        throw new Error(
          "Invalid --check format. Use --check email@example.com:password",
        );
      }
      checks.push({
        email: normalizeEmail(value.slice(0, sep)),
        password: value.slice(sep + 1),
      });
      i += 1;
    }
  }

  const out: SmokeArgs = {
    allowBranchMismatch: argv.includes("--allow-branch-mismatch"),
    checks,
    expectedBranchName,
    skipWrongPasswordProbe: argv.includes("--skip-wrong-password-probe"),
  };
  if (projectId && projectId.length > 0) out.projectId = projectId;
  return out;
}

function parseCreateArgs(argv: string[]): CreateArgs {
  const expectedBranchName =
    readStringFlag(argv, "--expected-branch-name")?.trim() ??
    DEFAULT_EXPECTED_BRANCH;
  const projectId = readStringFlag(argv, "--project-id")?.trim();
  const password = readStringFlag(argv, "--password");
  const name = readStringFlag(argv, "--name");

  const emails: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--email") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --email");
      emails.push(normalizeEmail(value));
      i += 1;
    }
  }

  const out: CreateArgs = {
    allowBranchMismatch: argv.includes("--allow-branch-mismatch"),
    dryRun: argv.includes("--dry-run"),
    emails: Array.from(new Set(emails)),
    expectedBranchName,
    verify: !argv.includes("--no-verify"),
  };
  if (projectId && projectId.length > 0) out.projectId = projectId;
  if (password && password.length > 0) out.password = password;
  if (name && name.trim().length > 0) out.name = name.trim();
  return out;
}

function readStringFlag(argv: string[], flag: string): string | undefined {
  for (const token of argv) {
    if (token === flag) continue;
    if (!token.startsWith(flag)) continue;
    if (token.length === flag.length) continue;
    if (token[flag.length] !== "=") continue;

    const value = token.slice(flag.length + 1);
    return value.length > 0 ? value : undefined;
  }

  const idx = argv.indexOf(flag);
  if (idx === -1) return undefined;

  const value = argv[idx + 1];
  if (!value) return undefined;
  if (value.startsWith("--")) {
    console.warn(`Missing value for ${flag}; got another flag: ${value}`);
    return undefined;
  }

  // Accept values that start with a single dash (e.g. passwords like "-secret").
  return value;
}

function printHelp(action?: Action): void {
  const header = "Usage: bun scripts/neon-auth-local.ts <action> [flags]";
  const actions = [
    "info|lib  Resolve project/branch context and show key config",
    "audit     Validate wiring and detect malformed credential rows",
    "create    Create new email/password users (no delete/recreate)",
    "repair    Delete+recreate broken credential users (IDs change)",
    "smoke     Assert wrong-password => 401 and optional success checks",
  ];

  console.log(header);
  console.log("");
  console.log("Actions:");
  for (const line of actions) console.log(`  ${line}`);

  console.log("");
  console.log("Common flags:");
  console.log(
    "  --project-id <id>             Override Neon project id (.neon/NEON_PROJECT_ID default)",
  );
  console.log("  --expected-branch-name <name> Default: vercel-dev");
  console.log("  -h, --help                    Show help");

  if (!action) return;

  console.log("");
  if (action === "audit") {
    console.log("audit flags:");
    console.log(
      "  --skip-vercel-pull            Skip `vercel env pull` dev comparison",
    );
    console.log(
      "  --no-strict                   Do not exit non-zero on issues",
    );
  }
  if (action === "create") {
    console.log("create flags:");
    console.log("  --email <email>               Target email(s); repeatable");
    console.log(
      "  --password <password>         Set explicit password (otherwise generated)",
    );
    console.log(
      "  --name <name>                 Optional display name (applied to all emails)",
    );
    console.log(
      "  --no-verify                   Skip sign-in verification (default verifies)",
    );
    console.log("  --dry-run                     Print planned actions only");
    console.log(
      "  --allow-branch-mismatch       Allow running even if not on expected branch",
    );
  }
  if (action === "repair") {
    console.log("repair flags:");
    console.log(
      "  --email <email>               Target specific email(s); repeatable",
    );
    console.log(
      "  --password <password>         Set explicit password (must meet Neon Auth policy)",
    );
    console.log("  --dry-run                     Print planned actions only");
    console.log(
      "  --allow-branch-mismatch       Allow running even if not on expected branch",
    );
  }
  if (action === "smoke") {
    console.log("smoke flags:");
    console.log(
      "  --check <email:password>      Expect 200 for this credential; repeatable",
    );
    console.log(
      "  --skip-wrong-password-probe   Skip probing all credential users with a bad password",
    );
    console.log(
      "  --allow-branch-mismatch       Allow running even if not on expected branch",
    );
  }
}

void main().catch((error) => {
  console.error("neon-auth-local failed:", formatError(error));
  process.exitCode = 1;
});
