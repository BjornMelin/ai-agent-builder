# Glossary

- **Artifact**: A generated output (PRD, ADR, SPEC, roadmap, prompts, audit bundle).
- **Citation**: A record linking a claim to a source URL and excerpt/line range.
- **Chunk**: A retrieval unit derived from uploaded content, generated artifacts,
  or source code.
- **Dynamic tool**: A tool injected only when needed to reduce context bloat and
  risk.
- **Implementation plan**: A machine-readable task list (with acceptance
  criteria) derived from project artifacts and used to drive implementation runs.
- **Implementation Run**: A durable workflow that performs plan → code → verify →
  deploy for a target application.
- **Project**: A workspace representing one target product/app.
- **RepoOps**: Repository operations layer (clone/pull, branch, commit, PR,
  merge, tags).
- **Run**: A durable multi-step pipeline execution for a project (research run or
  implementation run).
- **Sandbox job**: A unit of isolated command execution inside Vercel Sandbox.
- **Side-effectful action**: Any action that changes external state (push/merge,
  provisioning resources, production deploy, deletes, rotates).
- **Step**: One discrete stage in a run (research scan, PRD draft, patch
  application, test job, deploy, etc.).
- **Target app**: The external product repository and its deployed environment
  that the system is building.
- **Tool**: A callable capability provided to an agent (web search, retrieval,
  sandbox, repo operations).
