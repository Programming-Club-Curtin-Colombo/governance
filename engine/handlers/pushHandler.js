const core = require("@actions/core");
const github = require("@actions/github");

const {
    loadGlobalConfig,
    loadRepoConfig
} = require("../configLoader");

const {
    mergeConfigs
} = require("../mergeConfig");

const {
    emitAuditEvent
} = require("../auditEmitter");

const {
    getRole
} = require("../identity");

const {
    evaluateCIStages
} = require("./ciStageChecker");

const PROTECTED_BRANCHES = ["main", "master"];

function log(state, message) {
    console.log(
        `[GOVERNANCE][PUSH][${state.toUpperCase()}] ${message}`
    );
}

async function handlePush(ciStatuses) {

    const payload =
        github.context.payload;

    const githubToken =
        process.env.GITHUB_TOKEN ||
        core.getInput("github-token");

    const octokit =
        github.getOctokit(githubToken);

    const ref =
        payload.ref;

    const branch =
        ref.replace("refs/heads/", "");

    const pusher =
        payload.pusher?.name || "unknown";

    const repoConfig =
        loadRepoConfig();

    const globalConfig =
        await loadGlobalConfig(repoConfig);

    const config =
        mergeConfigs(globalConfig, repoConfig);

    log("info", `Push detected on ${branch}`);
    log("info", `Pusher: ${pusher}`);

    const role = getRole(pusher, config);
    log("info", `Role resolved: ${role}`);

    let allowed = true;
    let reason = "Push accepted";

    // =========================================
    // CI STAGE GATE — protected branches only
    // =========================================
    if (PROTECTED_BRANCHES.includes(branch)) {

        const { violations } = evaluateCIStages(
            config.requiredStages,
            ciStatuses
        );

        if (violations.length > 0) {
            allowed = false;
            reason = `Required CI stages failed on protected branch '${branch}': ${violations.join(", ")}`;
            log("blocked", reason);
        } else {
            log("approved", `CI stages passed for protected branch '${branch}'`);
        }

    } else {

        log("info", `Non-protected branch — CI gate skipped`);
    }

    // =========================================
    // AUDIT EMIT
    // =========================================
    await emitAuditEvent({
        octokit,
        repo: `${github.context.repo.owner}/${github.context.repo.repo}`,
        entity: {
            type: "push",
            branch
        },
        config,
        payload: {
            eventType: "push",
            user: pusher,
            role,
            type: "push",
            allowed,
            reason,
            branch,
            commitCount:
                payload.commits?.length || 0,
            commits: (payload.commits || []).map(c => ({
                id: c.id.substring(0, 7),
                message: c.message,
                author: c.author?.name
            })),
            policyVersion:
                config.version || "unknown"
        }
    });

    core.setOutput("allowed", allowed ? "true" : "false");

    if (!allowed) {
        core.setFailed(
            `[GOVERNANCE][PUSH][BLOCKED] ${reason}`
        );
    }
}

module.exports = {
    handlePush
};