const core = require("@actions/core");
const github = require("@actions/github");

const { loadGlobalConfig, loadRepoConfig } =
    require("../configLoader");

const { mergeConfigs } =
    require("../mergeConfig");

const { getRole } =
    require("../identity");

const { validateContributor } =
    require("../validator");

const { classifyPR } =
    require("../classifier");

const { emitAuditEvent } =
    require("../auditEmitter");

const { evaluateCIStages } =
    require("./ciStageChecker");

const ROLE_LABELS = [
    "role:student",
    "role:external",
    "role:maintainer"
];

// Maps internal classifier types to GitHub's standard existing labels.
const TYPE_LABEL_MAP = {
    feature: "enhancement",
    bug:     "bug",
    docs:    "documentation",
    infra:   "maintenance"
};

// Legacy custom labels that may exist from earlier runs and must be cleaned up.
const LEGACY_TYPE_LABELS = ["type:feature", "type:bug", "type:infra", "type:docs"];

const GOVERNANCE_LABELS = [
    ...ROLE_LABELS,
    ...Object.values(TYPE_LABEL_MAP),
    ...LEGACY_TYPE_LABELS
];

async function cleanupLabels(octokit, pr) {
    for (const label of pr.labels.map(l => l.name)) {
        if (GOVERNANCE_LABELS.includes(label)) {
            await octokit.rest.issues.removeLabel({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                issue_number: pr.number,
                name: label
            });
        }
    }
}

async function applyLabels(octokit, pr, role, type) {
    const typeLabel = TYPE_LABEL_MAP[type] ?? `type:${type}`;

    await octokit.rest.issues.addLabels({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: pr.number,
        labels: [
            `role:${role}`,
            typeLabel
        ]
    });
}

function log(role, state, message) {
    console.log(
        `[GOVERNANCE][PR][${role.toUpperCase()}][${state.toUpperCase()}] ${message}`
    );
}

async function blockPR(octokit, pr, config, { username, email, role, type, reason }, htmlReportMarkdown) {
    await emitAuditEvent({
        octokit,
        repo: `${github.context.repo.owner}/${github.context.repo.repo}`,
        entity: {
            type: "pull_request",
            number: pr.number,
            title: pr.title
        },
        config,
        payload: {
            user: username,
            email,
            role,
            type,
            allowed: false,
            reason,
            eventType: github.context.eventName
        }
    });

    try {
        await octokit.rest.issues.createComment({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            issue_number: pr.number,
            body: `
### Governance Result

- Role: **${role}**
- Type: **${type}**
- Status: **BLOCKED**
- Reason: ${reason}

${htmlReportMarkdown ? `---\n\n${htmlReportMarkdown}` : ""}
`
        });
    } catch (err) {
        console.error("[GOVERNANCE][PR] Failed to add block comment:", err);
    }

    core.setFailed(
        `[GOVERNANCE][PR][${role.toUpperCase()}][BLOCKED] ${reason}`
    );
}

async function handlePullRequest(ciStatuses, htmlReportMarkdown) {

    const pr = github.context.payload.pull_request;

    if (!pr) {
        core.setFailed(
            "[GOVERNANCE][PR][SYSTEM][BLOCKED] No PR payload"
        );
        return;
    }

    const githubToken =
        process.env.GITHUB_TOKEN ||
        core.getInput("github-token");

    const octokit =
        github.getOctokit(githubToken);

    const username = pr.user.login;

    const { data: user } =
        await octokit.rest.users.getByUsername({ username });

    let email = user.email;

    if (!email) {
        try {
            const { data: commits } = await octokit.rest.pulls.listCommits({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                pull_number: pr.number
            });

            // Iterate backwards to get the most recent commit first
            for (let i = commits.length - 1; i >= 0; i--) {
                const c = commits[i];
                // Check if the commit is linked to the same GitHub user
                if (c.author && c.author.login === username) {
                    const commitEmail = c.commit.author.email;
                    if (commitEmail && !commitEmail.includes("noreply.github.com")) {
                        email = commitEmail;
                        break;
                    }
                }
            }
            
            // Fallback: use the most recent non-noreply commit author email if we still don't have one
            if (!email && commits.length > 0) {
                for (let i = commits.length - 1; i >= 0; i--) {
                    const fallbackEmail = commits[i]?.commit?.author?.email;
                    if (fallbackEmail && !fallbackEmail.includes("noreply.github.com")) {
                        email = fallbackEmail;
                        break;
                    }
                }
            }
        } catch (err) {
            console.error("[GOVERNANCE][PR] Failed to fetch commits to resolve email:", err);
        }
    }

    const repoConfig = loadRepoConfig();
    const globalConfig = await loadGlobalConfig(repoConfig);
    const config = mergeConfigs(globalConfig, repoConfig);

    const role = getRole(username, config);
    const type = classifyPR(pr);

    log(role, "info", `Role resolved: ${role}`);
    log(role, "info", `PR classified: ${type}`);

    core.setOutput("role", role);
    core.setOutput("type", type);

    // =========================================
    // CI STAGE GATE
    // =========================================
    const { violations } = evaluateCIStages(
        config.requiredStages,
        ciStatuses
    );

    if (violations.length > 0) {
        const reason =
            `Required CI stages failed: ${violations.join(", ")}`;

        log(role, "blocked", reason);
        core.setOutput("allowed", "false");

        await blockPR(octokit, pr, config, {
            username,
            email,
            role,
            type,
            reason
        }, htmlReportMarkdown);

        return;
    }

    // =========================================
    // IDENTITY / POLICY GATE
    // =========================================
    const result = validateContributor({ email, role, config });

    log(
        role,
        result.allowed ? "approved" : "blocked",
        result.reason
    );

    core.setOutput("allowed", String(result.allowed));

    if (!result.allowed) {
        await blockPR(octokit, pr, config, {
            username,
            email,
            role,
            type,
            reason: result.reason
        }, htmlReportMarkdown);

        return;
    }

    await cleanupLabels(octokit, pr);
    await applyLabels(octokit, pr, role, type);

    log(role, "label", "Labels applied");

    await emitAuditEvent({
        octokit,
        repo: `${github.context.repo.owner}/${github.context.repo.repo}`,
        entity: {
            type: "pull_request",
            number: pr.number,
            title: pr.title
        },
        config,
        payload: {
            user: username,
            email,
            role,
            type,
            allowed: true,
            reason: result.reason,
            eventType: github.context.eventName
        }
    });

    await octokit.rest.issues.createComment({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: pr.number,
        body: `
### Governance Result

- Role: **${role}**
- Type: **${type}**
- Status: **APPROVED**
- Reason: ${result.reason}

${htmlReportMarkdown ? `---\n\n${htmlReportMarkdown}` : ""}
`
    });

    log(role, "approved", "Governance completed");
}

module.exports = {
    handlePullRequest
};