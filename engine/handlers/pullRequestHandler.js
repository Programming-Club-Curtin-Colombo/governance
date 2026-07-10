const core   = require("@actions/core");
const github = require("@actions/github");

const { loadGlobalConfig, loadRepoConfig } = require("../configLoader");
const { mergeConfigs }     = require("../mergeConfig");
const { getRole }          = require("../identity");
const { validateContributor, isAllowedEmail } = require("../validator");
const { classifyPR }       = require("../classifier");
const { emitAuditEvent }   = require("../auditEmitter");
const { evaluateCIStages } = require("./ciStageChecker");
const { auditPRCommits }   = require("../commitAudit");
const { generateReport }   = require("../reportGenerator");
const { archiveArtifacts } = require("../artifactArchiver");

// ─── Label constants ──────────────────────────────────────────────────────────

const ROLE_LABELS = ["role:student", "role:external", "role:maintainer"];

const TYPE_LABEL_MAP = {
    feature: "enhancement",
    bug:     "bug",
    docs:    "documentation",
    infra:   "maintenance"
};

const LEGACY_TYPE_LABELS = ["type:feature", "type:bug", "type:infra", "type:docs"];

const GOVERNANCE_LABELS = [
    ...ROLE_LABELS,
    ...Object.values(TYPE_LABEL_MAP),
    ...LEGACY_TYPE_LABELS
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(role, state, message) {
    console.log(`[GOVERNANCE][PR][${role.toUpperCase()}][${state.toUpperCase()}] ${message}`);
}

async function cleanupLabels(octokit, pr) {
    for (const label of pr.labels.map(l => l.name)) {
        if (GOVERNANCE_LABELS.includes(label)) {
            await octokit.rest.issues.removeLabel({
                owner:        github.context.repo.owner,
                repo:         github.context.repo.repo,
                issue_number: pr.number,
                name:         label
            });
        }
    }
}

async function applyLabels(octokit, pr, role, type) {
    const typeLabel = TYPE_LABEL_MAP[type] ?? `type:${type}`;
    await octokit.rest.issues.addLabels({
        owner:        github.context.repo.owner,
        repo:         github.context.repo.repo,
        issue_number: pr.number,
        labels:       [`role:${role}`, typeLabel]
    });
}

// ─── Co-author email audit ────────────────────────────────────────────────────

/**
 * Validates each co-author's email against allowed domains.
 * Produces warnings only — co-authors never block a PR.
 *
 * @param {object[]} authors
 * @param {string[]} allowedDomains
 * @returns {string[]} Warning messages
 */
function auditCoAuthorEmails(authors, allowedDomains) {
    const warnings = [];

    for (const author of authors) {
        if (author.role !== "co-author") continue;
        if (!author.email) {
            warnings.push(`Co-author without email detected (name: ${author.name || "unknown"})`);
            continue;
        }
        if (!isAllowedEmail(author.email, allowedDomains)) {
            warnings.push(
                `Co-author email domain not in allowlist: ${author.email}`
            );
        }
    }

    return warnings;
}

// ─── PR comment builders ──────────────────────────────────────────────────────

function buildArtifactWarningsSection(artifactReport) {
    if (!artifactReport?.warnings?.length) return "";

    const lines = artifactReport.warnings
        .map(w => `> ⚠️ ${w}`)
        .join("\n");

    return `\n**Artifact Warnings:**\n${lines}\n`;
}

function buildCoAuthorWarningsSection(warnings) {
    if (!warnings.length) return "";

    const lines = warnings.map(w => `> ⚠️ ${w}`).join("\n");
    return `\n**Co-Author Email Warnings:**\n${lines}\n`;
}

function buildCommitAuditSection(commitAudit) {
    if (!commitAudit?.commits?.length) return "";

    const commitLines = commitAudit.commits.map(c => {
        const author    = c.author?.login ? `@${c.author.login}` : (c.author?.name || "unknown");
        const coAuthors = c.coAuthors?.length
            ? c.coAuthors.map(ca => ca.name).join(", ")
            : "—";
        return `| \`${c.sha}\` | ${c.message} | ${author} | ${coAuthors} |`;
    }).join("\n");

    const rosterLines = commitAudit.authors.map(a => {
        const identity = a.login ? `@${a.login}` : (a.name || "—");
        const commits  = a.commits.map(s => `\`${s}\``).join(" ");
        return `| ${identity} | \`${a.email || "—"}\` | ${a.role} | ${commits} |`;
    }).join("\n");

    return `
<details>
<summary>📋 Commit Audit (${commitAudit.commits.length} commits, ${commitAudit.authors.length} contributors)</summary>

**Commits**

| SHA | Message | Author | Co-Authors |
|-----|---------|--------|------------|
${commitLines}

**Author Roster**

| Identity | Email | Role | Commits |
|----------|-------|------|---------|
${rosterLines}

</details>`;
}

// ─── Block / approve ──────────────────────────────────────────────────────────

async function blockPR(octokit, pr, config, { username, email, role, type, reason }, commentExtra) {
    await emitAuditEvent({
        octokit,
        repo:   `${github.context.repo.owner}/${github.context.repo.repo}`,
        entity: { type: "pull_request", number: pr.number, title: pr.title },
        config,
        payload: {
            user:      username,
            email,
            role,
            type,
            allowed:   false,
            reason,
            eventType: github.context.eventName
        }
    });

    try {
        await octokit.rest.issues.createComment({
            owner:        github.context.repo.owner,
            repo:         github.context.repo.repo,
            issue_number: pr.number,
            body: `### Governance Result\n\n- Role: **${role}**\n- Type: **${type}**\n- Status: **BLOCKED**\n- Reason: ${reason}\n${commentExtra}`
        });
    } catch (err) {
        console.error("[GOVERNANCE][PR] Failed to add block comment:", err);
    }

    core.setFailed(`[GOVERNANCE][PR][${role.toUpperCase()}][BLOCKED] ${reason}`);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

/**
 * @param {Record<string, string>} ciStatuses
 * @param {{ found: object[], missing: object[], warnings: string[] } | null} artifactReport
 * @param {string} baseReportMarkdown
 * @param {string} workspace
 * @param {object} mergedConfig  - Already-merged config passed from run.js
 */
async function handlePullRequest(
    ciStatuses,
    artifactReport,
    baseReportMarkdown,
    workspace,
    mergedConfig
) {
    const pr = github.context.payload.pull_request;

    if (!pr) {
        core.setFailed("[GOVERNANCE][PR][SYSTEM][BLOCKED] No PR payload");
        return;
    }

    const githubToken =
        process.env.GITHUB_TOKEN || core.getInput("github-token");

    const octokit = github.getOctokit(githubToken);

    const owner    = github.context.repo.owner;
    const repo     = github.context.repo.repo;
    const username = pr.user.login;

    // ── Config ────────────────────────────────────────────────────────────────
    // Use the already-merged config when available; fall back to loading fresh.
    const config = mergedConfig || (() => {
        const repoConfig   = loadRepoConfig();
        const globalConfig = loadGlobalConfig(repoConfig);
        return mergeConfigs(globalConfig, repoConfig);
    })();

    // ── Email resolution ──────────────────────────────────────────────────────
    const { data: userProfile } =
        await octokit.rest.users.getByUsername({ username });

    let email = userProfile.email;

    if (!email) {
        try {
            const { data: commits } = await octokit.rest.pulls.listCommits({
                owner, repo, pull_number: pr.number
            });

            for (let i = commits.length - 1; i >= 0; i--) {
                const c = commits[i];
                if (c.author?.login === username) {
                    const candidate = c.commit.author.email;
                    if (candidate && !candidate.includes("noreply.github.com")) {
                        email = candidate;
                        break;
                    }
                }
            }

            if (!email && commits.length > 0) {
                email = commits[commits.length - 1].commit.author.email;
            }
        } catch (err) {
            console.error("[GOVERNANCE][PR] Failed to resolve email from commits:", err);
        }
    }

    // ── Commit audit ──────────────────────────────────────────────────────────
    let commitAudit      = null;
    let coAuthorWarnings = [];

    try {
        commitAudit = await auditPRCommits(octokit, pr, config, owner, repo);

        const allowedDomains =
            config.emailValidation?.allowedEmailDomains || [];

        coAuthorWarnings = auditCoAuthorEmails(commitAudit.authors, allowedDomains);

        for (const w of coAuthorWarnings) {
            core.warning(`[GOVERNANCE][PR] ${w}`);
        }
    } catch (err) {
        console.error("[GOVERNANCE][PR] Commit audit failed:", err);
    }

    // ── Re-generate report with commit audit data ─────────────────────────────
    let fullReportHtml     = "";
    let fullReportMarkdown = baseReportMarkdown;

    try {
        const result = generateReport(workspace, artifactReport, commitAudit);
        fullReportHtml     = result.html;
        fullReportMarkdown = result.markdown;

        // Update archive with the enriched report
        if (config.artifactArchive?.enabled !== false && artifactReport) {
            archiveArtifacts(artifactReport.found, fullReportHtml, workspace);
        }
    } catch (err) {
        console.error("[GOVERNANCE][PR] Failed to re-generate enriched report:", err);
    }

    // ── Role + type ───────────────────────────────────────────────────────────
    const role = getRole(username, config);
    const type = classifyPR(pr);

    log(role, "info", `Role resolved: ${role}`);
    log(role, "info", `PR classified: ${type}`);

    core.setOutput("role", role);
    core.setOutput("type", type);

    // ── CI stage gate ─────────────────────────────────────────────────────────
    const { violations } = evaluateCIStages(config.requiredStages, ciStatuses);

    const commentExtra =
        buildArtifactWarningsSection(artifactReport) +
        buildCoAuthorWarningsSection(coAuthorWarnings) +
        buildCommitAuditSection(commitAudit) +
        (fullReportMarkdown ? `\n---\n\n${fullReportMarkdown}` : "");

    if (violations.length > 0) {
        const reason = `Required CI stages failed: ${violations.join(", ")}`;
        log(role, "blocked", reason);
        core.setOutput("allowed", "false");

        await blockPR(octokit, pr, config,
            { username, email, role, type, reason },
            commentExtra
        );
        return;
    }

    // ── Identity / policy gate ────────────────────────────────────────────────
    const result = validateContributor({ email, role, config });

    log(role, result.allowed ? "approved" : "blocked", result.reason);
    core.setOutput("allowed", String(result.allowed));

    if (!result.allowed) {
        await blockPR(octokit, pr, config,
            { username, email, role, type, reason: result.reason },
            commentExtra
        );
        return;
    }

    // ── Approved path ─────────────────────────────────────────────────────────
    await cleanupLabels(octokit, pr);
    await applyLabels(octokit, pr, role, type);
    log(role, "label", "Labels applied");

    await emitAuditEvent({
        octokit,
        repo:   `${owner}/${repo}`,
        entity: { type: "pull_request", number: pr.number, title: pr.title },
        config,
        payload: {
            user:      username,
            email,
            role,
            type,
            allowed:   true,
            reason:    result.reason,
            eventType: github.context.eventName,
            commits:   commitAudit?.commits  || [],
            authors:   commitAudit?.authors  || [],
            artifactWarnings: artifactReport?.warnings || []
        }
    });

    await octokit.rest.issues.createComment({
        owner, repo,
        issue_number: pr.number,
        body: `### Governance Result\n\n- Role: **${role}**\n- Type: **${type}**\n- Status: **APPROVED**\n- Reason: ${result.reason}\n${commentExtra}`
    });

    log(role, "approved", "Governance completed");
}

module.exports = { handlePullRequest };