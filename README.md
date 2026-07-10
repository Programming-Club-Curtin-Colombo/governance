# Programming Club Curtin Colombo — Governance Engine

A centralised governance engine that runs as a GitHub Actions workflow across all organisation repositories. It validates pull request contributors, classifies changes, enforces policy, and emits structured audit events to configurable sinks.

---

## How It Works

On every pull request, the engine:

1. **Resolves the contributor's role** — `maintainer`, `external`, or `student` — from the merged global + repo config.
2. **Classifies the PR type** — `infra`, `docs`, `bug`, or `feature` — by inspecting changed files, the title, and the body.
3. **Validates the contributor** against email domain rules defined in policy.
4. **Blocks or approves** the PR by setting a GitHub Actions failure status and posting a comment.
5. **Applies labels** (`role:<role>` + `type:<type>`) after cleaning up any stale governance labels.
6. **Emits a structured audit event** (`pr.governance.result`) to all configured sinks.
7. **Probes and archives** standard CI artifacts (`build.log`, `eslint.sarif`, etc.) into a consolidated report.

---

## Artifact Standards

The engine expects specific CI outputs to populate the governance report and archive.

| Category                | Preferred Format | Typical Filename                  |
| ----------------------- | ---------------- | --------------------------------- |
| Build logs              | Plain text       | `build.log`                       |
| Build summary           | JSON (custom)    | `build-summary.json`              |
| Unit tests              | JUnit XML        | `junit.xml`                       |
| Coverage (JS/TS)        | LCOV             | `lcov.info`                       |
| Coverage (general)      | Cobertura XML    | `coverage.xml`                    |
| Lint                    | SARIF            | `eslint.sarif`                    |
| Static Analysis         | SARIF            | `codeql.sarif`, `semgrep.sarif`   |
| Security                | SARIF            | `trivy.sarif`, `dependency.sarif` |
| Dependency graph / SBOM | CycloneDX        | `cyclonedx.json`                  |
| Benchmark/Performance   | JSON             | `benchmark.json`                  |

---

## Architecture

```
engine/
├── run.js              # Orchestrator — main entry point
├── configLoader.js     # Fetches global policy + loads repo override
├── mergeConfig.js      # Merges global + repo config (union rules for domains/whitelists)
├── identity.js         # Resolves contributor role from config
├── classifier.js       # Classifies PR type from files, title, and body
├── validator.js        # Validates contributor against policy rules
├── auditEmitter.js     # Builds and emits the structured audit event
├── eventRouter.js      # Routes the audit event to enabled sinks
├── formatters/
│   └── discordFormatter.js   # Formats event into a Discord embed payload
└── sinks/
    ├── discordSink.js        # Posts to a Discord webhook
    ├── repoSink.js           # Appends to a JSONL file in the audit-log repo
    └── webhookSink.js        # Posts raw event JSON to a generic webhook
```

---

## Configuration

### Global Policy

The engine fetches its policy from this repository at runtime:

```
https://raw.githubusercontent.com/Programming-Club-Curtin-Colombo/governance/main/standards/global.governance.json
```

This is the source of truth for all org-wide rules.

### Repo Override (`.governance.json`)

Any consuming repository can place a `.governance.json` file in its root to extend the global policy:

```json
{
    "governance": {
        "lockedVersion": "v1.2.0"
    },
    "roles": {
        "maintainers": ["your-github-username"]
    },
    "emailValidation": {
        "allowedEmailDomains": ["yourcompany.com"]
    }
}
```

**Merge behaviour:**
- `roles.maintainers` and `roles.external.whitelistUsers` — **union** (combined, deduplicated)
- `emailValidation.allowedEmailDomains` — **union**
- All other keys — repo config **overrides** global

### Version Pinning

To pin a repository to a specific governance version, set `governance.lockedVersion` in `.governance.json`. Otherwise the engine always uses the `main` branch policy.

You can also override via the `GOVERNANCE_VERSION` environment variable in the workflow.

---

## Audit Event Schema

Every governance decision emits an event conforming to this schema (`standards/event.schema.json`):

| Field | Type | Description |
|---|---|---|
| `event` | `string` | Always `governance.result` |
| `eventVersion` | `string` | Schema version (now `2.0`) |
| `timestamp` | `string` | ISO-8601 |
| `repo` | `string` | `owner/repo` |
| `entity` | `object` | The subject of the event (PR, Push, etc.) |
| `entity.type` | `string` | `pull_request` \| `push` |
| `entity.number` | `number` | Pull request number (if applicable) |
| `entity.branch` | `string` | Branch name (if push event) |
| `user` | `string` | GitHub username |
| `email` | `string` | GitHub account email |
| `role` | `string` | `student` \| `external` \| `maintainer` |
| `type` | `string` | `feature` \| `bug` \| `infra` \| `docs` |
| `allowed` | `boolean` | Whether the PR passed governance |
| `reason` | `string` | Human-readable decision reason |
| `policyVersion` | `string` | The governance policy version applied |

---

## Audit Sinks

Sinks are enabled in `global.governance.json` under `audit.sinks`:

```json
{
    "audit": {
        "sinks": {
            "discord": true,
            "repo": true,
            "webhook": false
        }
    }
}
```

| Sink | Description | Required Secret / Config |
|---|---|---|
| `discord` | Posts a formatted embed to a Discord channel | `DISCORD_AUDIT_WEBHOOK_URL` secret |
| `repo` | Appends event as a JSONL line to `Programming-Club-Curtin-Colombo/audit-log` | `GITHUB_TOKEN` with write access |
| `webhook` | POSTs raw event JSON to a generic HTTP endpoint | `DISCORD_AUDIT_WEBHOOK_URL` (reused) |

---

## PR Classification Rules

The classifier runs in priority order:

| Priority | Type | Rule |
|---|---|---|
| 1 | `infra` | Any changed file matches `.github/`, `dockerfile`, `docker-compose`, `ci`, `workflow`, `package.json`, `package-lock.json` |
| 2 | `docs` | All changed files are `.md` or under `docs/`, OR title/body contains `readme` or `documentation` |
| 3 | `bug` | Title or body contains `fix`, `bug`, `error`, `issue`, `crash`, or `broken` |
| 4 | `feature` | Default fallback |

---

## Roles

| Role | How assigned | Validation |
|---|---|---|
| `maintainer` | Listed in `config.roles.maintainers` | Always approved — bypasses all checks |
| `external` | Listed in `config.roles.external.whitelistUsers` | Subject to email domain check |
| `student` | Default (everyone else) | Subject to email domain check |

---

## Using This in Another Repository

Add the following workflow to your repository at `.github/workflows/governance.yml`:

```yaml
name: Governance

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  governance:
    name: Run Governance Engine
    runs-on: ubuntu-latest

    outputs:
      allowed: ${{ steps.governance.outputs.allowed }}
      role: ${{ steps.governance.outputs.role }}
      type: ${{ steps.governance.outputs.type }}

        steps:
          - name: Download all reports
            uses: actions/download-artifact@v4
            with:
              path: reports

          - name: Install Engine Dependencies
            run: npm install --prefix ${{ github.workspace }} @actions/core@1.10.1 @actions/github@6.0.0

          - name: Run Governance
            id: governance
            working-directory: ${{ github.workspace }}
            run: node engine/run.js
            env:
              INPUT_GITHUB-TOKEN:           ${{ secrets.GITHUB_TOKEN }}
              INPUT_DISCORD-WEBHOOK-URL:    ${{ secrets.DISCORD_AUDIT_WEBHOOK_URL }}
              INPUT_GOVERNANCE-WEBHOOK-URL: ${{ secrets.GOVERNANCE_WEBHOOK_URL }}
              INPUT_BUILD-STATUS:           ${{ needs.build.outputs.passed }}
              INPUT_LINT-STATUS:            ${{ needs.lint.outputs.passed }}
              INPUT_STATIC-STATUS:          ${{ needs.static.outputs.passed }}
              INPUT_TEST-STATUS:            ${{ needs.test.outputs.passed }}
              INPUT_COVERAGE-STATUS:        ${{ needs.coverage.outputs.passed }}
              INPUT_SECURITY-STATUS:        ${{ needs.security.outputs.passed }}
              INPUT_SBOM-STATUS:            ${{ needs.sbom.outputs.passed }}
              INPUT_BENCHMARK-STATUS:       ${{ needs.benchmark.outputs.passed }}

  enforce:
    name: Enforce Governance Gate
    runs-on: ubuntu-latest
    needs: governance

    steps:
      - name: Validate Governance Result
        run: |
          if [ "${{ needs.governance.outputs.allowed }}" != "true" ]; then
            echo "❌ Governance policy blocked this PR"
            exit 1
          fi
          echo "✅ Governance checks passed"
```

Optionally create a `.governance.json` in your repo root to extend the global policy:

```json
{
    "governance": {
        "lockedVersion": "v1.0.0"
    },
    "roles": {
        "maintainers": ["your-github-username"]
    },
    "emailValidation": {
        "allowedEmailDomains": ["yourcompany.com"]
    },
    "audit": {
        "sinks": {
            "discord": true,
            "repo": true,
            "webhook": false
        }
    }
}
```

---

## Secrets Reference

| Secret | Required | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | Yes (auto-provided) | Label management, PR comments, repo audit sink |
| `DISCORD_AUDIT_WEBHOOK_URL` | If `discord` sink enabled | Discord audit notifications |
| `GOVERNANCE_WEBHOOK_URL` | If `webhook` sink enabled | Generic HTTP audit delivery |
