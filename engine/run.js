const core = require("@actions/core");
const github = require("@actions/github");

const {
    handlePullRequest
} = require("./handlers/pullRequestHandler");

const {
    handlePush
} = require("./handlers/pushHandler");

const {
    validateStructure
} = require("./structureValidator");

const {
    loadRepoConfig,
    loadGlobalConfig
} = require("./configLoader");

const {
    mergeConfigs
} = require("./mergeConfig");

const discordWebhookUrl =
    process.env.DISCORD_AUDIT_WEBHOOK_URL ||
    core.getInput("discord-webhook-url") ||
    "";

const governanceWebhookUrl =
    process.env.GOVERNANCE_WEBHOOK_URL ||
    core.getInput("governance-webhook-url") ||
    "";

const governanceVersion =
    process.env.GOVERNANCE_VERSION ||
    core.getInput("governance-version") ||
    "";

if (discordWebhookUrl) process.env.DISCORD_AUDIT_WEBHOOK_URL = discordWebhookUrl;
if (governanceWebhookUrl) process.env.GOVERNANCE_WEBHOOK_URL = governanceWebhookUrl;
if (governanceVersion) process.env.GOVERNANCE_VERSION = governanceVersion;

function readCIStatuses() {
    return {
        build:    core.getInput("build-status")    || "",
        lint:     core.getInput("lint-status")     || "",
        test:     core.getInput("test-status")     || "",
        security: core.getInput("security-status") || "",
        static:   core.getInput("static-status")   || ""
    };
}

async function run() {

    try {

        const { generateHTMLReport } = require("./reportGenerator");

        try {
            generateHTMLReport(process.env.GITHUB_WORKSPACE || ".");
        } catch (e) {
            console.error(`[GOVERNANCE][SYSTEM] Error generating HTML report:`, e);
        }

        const eventName =
            github.context.eventName;

        const isGovernanceRepo =
            github.context.repo.owner === "Programming-Club-Curtin-Colombo" &&
            github.context.repo.repo === "governance";

        let config = loadRepoConfig();
        const globalConfig = await loadGlobalConfig(config);
        config = mergeConfigs(globalConfig, config);

        if (isGovernanceRepo) {
            console.log(
                `[GOVERNANCE][SYSTEM] Skipping structure validation for core governance repo`
            );
        } else {
            console.log(
                `[GOVERNANCE][SYSTEM] Validating repository structure...`
            );
            
            const structureErrors = validateStructure(config);
            if (structureErrors.length > 0) {
                throw new Error(
                    `Repository structure violations:\n- ${structureErrors.join("\n- ")}`
                );
            }
        }

        const ciStatuses = readCIStatuses();

        switch (eventName) {

            case "pull_request":
            case "pull_request_target":

                await handlePullRequest(ciStatuses);
                break;

            case "push":

                await handlePush(ciStatuses);
                break;

            default:

                console.log(
                    `[GOVERNANCE][SYSTEM] Unsupported event`
                );
        }

    } catch (err) {

        core.setFailed(
            `[GOVERNANCE][SYSTEM][BLOCKED] ${err.message}`
        );
        core.setOutput("allowed", "false");
        core.setOutput("role", "error");
        core.setOutput("type", "error");
    }
}

run();