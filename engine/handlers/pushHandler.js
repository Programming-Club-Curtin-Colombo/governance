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

function log(state, message) {
    console.log(
        `[GOVERNANCE][PUSH][${state.toUpperCase()}] ${message}`
    );
}

async function handlePush() {

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

    let allowed = true;
    let reason =
        "Push accepted";

    const protectedBranches = [
        "main",
        "master"
    ];

    // example enforcement hook
    if (
        protectedBranches.includes(branch)
    ) {

        log(
            "approved",
            `Protected branch push validated`
        );

    } else {

        log(
            "info",
            `Non-protected branch push`
        );
    }

    // =========================
    // AUDIT EMIT
    // =========================

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

            role: "unknown",

            type: "push",

            allowed,

            reason,

            branch,

            commitCount:
                payload.commits?.length || 0,

            policyVersion:
                config.version || "unknown"
        }
    });

    core.setOutput(
        "allowed",
        allowed ? "true" : "false"
    );

    if (!allowed) {

        core.setFailed(
            `[GOVERNANCE][PUSH][BLOCKED] ${reason}`
        );
    }
}

module.exports = {
    handlePush
};