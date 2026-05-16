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

const TYPE_LABELS = [
    "type:feature",
    "type:bug",
    "type:infra",
    "type:docs"
];

const GOVERNANCE_LABELS = [
    ...ROLE_LABELS,
    ...TYPE_LABELS
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
    await octokit.rest.issues.addLabels({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: pr.number,
        labels: [
            `role:${role}`,
            `type:${type}`
        ]
    });
}

function log(role, state, message) {
    console.log(
        `[GOVERNANCE][PR][${role.toUpperCase()}][${state.toUpperCase()}] ${message}`
    );
}

async function blockPR(octokit, pr, config, { username, email, role, type, reason }) {
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

    core.setFailed(
        `[GOVERNANCE][PR][${role.toUpperCase()}][BLOCKED] ${reason}`
    );
}

async function handlePullRequest(ciStatuses) {

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

    const email = user.email;

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
        });

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
        });

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
`
    });

    log(role, "approved", "Governance completed");
}

module.exports = {
    handlePullRequest
};