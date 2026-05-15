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
    loadRepoConfig
} = require("./configLoader");

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

async function run() {

    try {

        const eventName =
            github.context.eventName;

        console.log(
            `[GOVERNANCE][SYSTEM] Event: ${eventName}`
        );

        console.log(
            `[GOVERNANCE][SYSTEM] Validating repository structure...`
        );
        const config = loadRepoConfig();
        const structureErrors = validateStructure(config);
        if (structureErrors.length > 0) {
            throw new Error(
                `Repository structure violations:\n- ${structureErrors.join("\n- ")}`
            );
        }

        switch (eventName) {

            case "pull_request":
            case "pull_request_target":

                await handlePullRequest();
                break;

            case "push":

                await handlePush();
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