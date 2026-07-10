const core   = require("@actions/core");
const github = require("@actions/github");

const { handlePullRequest } = require("./handlers/pullRequestHandler");
const { handlePush }        = require("./handlers/pushHandler");
const { validateStructure } = require("./structureValidator");
const { loadRepoConfig, loadGlobalConfig } = require("./configLoader");
const { mergeConfigs }      = require("./mergeConfig");
const { generateReport }    = require("./reportGenerator");
const { probeArtifacts }    = require("./artifactProber");
const { archiveArtifacts }  = require("./artifactArchiver");

// ─── Environment / input resolution ──────────────────────────────────────────

const discordWebhookUrl =
    process.env.DISCORD_AUDIT_WEBHOOK_URL ||
    core.getInput("discord-webhook-url")  ||
    "";

const governanceWebhookUrl =
    process.env.GOVERNANCE_WEBHOOK_URL    ||
    core.getInput("governance-webhook-url") ||
    "";

const governanceVersion =
    process.env.GOVERNANCE_VERSION        ||
    core.getInput("governance-version")   ||
    "";

if (discordWebhookUrl)    process.env.DISCORD_AUDIT_WEBHOOK_URL = discordWebhookUrl;
if (governanceWebhookUrl) process.env.GOVERNANCE_WEBHOOK_URL    = governanceWebhookUrl;
if (governanceVersion)    process.env.GOVERNANCE_VERSION         = governanceVersion;

// ─── CI status reader ─────────────────────────────────────────────────────────

function readCIStatuses() {
    return {
        build:     core.getInput("build-status")     || "",
        lint:      core.getInput("lint-status")      || "",
        test:      core.getInput("test-status")      || "",
        coverage:  core.getInput("coverage-status")  || "",
        security:  core.getInput("security-status")  || "",
        static:    core.getInput("static-status")    || "",
        sbom:      core.getInput("sbom-status")      || "",
        benchmark: core.getInput("benchmark-status") || ""
    };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
    try {
        const workspace  = process.env.GITHUB_WORKSPACE || ".";
        const eventName  = github.context.eventName;

        const isGovernanceRepo =
            github.context.repo.owner === "Programming-Club-Curtin-Colombo" &&
            github.context.repo.repo  === "governance";

        let config = loadRepoConfig();
        const globalConfig = await loadGlobalConfig(config);
        config = mergeConfigs(globalConfig, config);

        // ── Structure validation ──────────────────────────────────────────────
        if (isGovernanceRepo) {
            console.log("[GOVERNANCE][SYSTEM] Skipping structure validation for core governance repo");
        } else {
            console.log("[GOVERNANCE][SYSTEM] Validating repository structure...");
            const structureErrors = validateStructure(config);
            if (structureErrors.length > 0) {
                throw new Error(
                    `Repository structure violations:\n- ${structureErrors.join("\n- ")}`
                );
            }
        }

        // ── CI status + artifact probe ────────────────────────────────────────
        const ciStatuses = readCIStatuses();

        let artifactReport = null;

        if (config.artifactProbing?.enabled !== false) {
            artifactReport = probeArtifacts(ciStatuses, workspace);

            for (const warning of artifactReport.warnings) {
                core.warning(warning);
            }
        }

        // ── Report generation ─────────────────────────────────────────────────
        // Commit audit data will be populated by the handler (needs octokit for PR events).
        // We generate the base report here and re-generate inside the handler once we
        // have the commit audit, or pass null and let the handler call generateReport.
        let reportHtml     = "";
        let reportMarkdown = "";

        try {
            const result = generateReport(workspace, artifactReport, null);
            reportHtml     = result.html;
            reportMarkdown = result.markdown;
        } catch (err) {
            console.error("[GOVERNANCE][SYSTEM] Error generating base report:", err);
        }

        // ── Artifact archive (base pass — without commit audit in report) ─────
        let archivePath = null;
        if (config.artifactArchive?.enabled !== false && artifactReport) {
            try {
                const archiveResult = archiveArtifacts(artifactReport.found, reportHtml, workspace);
                archivePath = archiveResult.archivePath;
            } catch (err) {
                console.error("[GOVERNANCE][SYSTEM] Error assembling artifact archive:", err);
            }
        }

        // ── Event routing ─────────────────────────────────────────────────────
        switch (eventName) {

            case "pull_request":
            case "pull_request_target":
                await handlePullRequest(
                    ciStatuses,
                    artifactReport,
                    reportMarkdown,
                    workspace,
                    config,
                    archivePath
                );
                break;

            case "push":
                await handlePush(
                    ciStatuses,
                    artifactReport,
                    reportMarkdown,
                    workspace,
                    config,
                    archivePath
                );
                break;

            default:
                console.log("[GOVERNANCE][SYSTEM] Unsupported event");
        }

    } catch (err) {
        core.setFailed(`[GOVERNANCE][SYSTEM][BLOCKED] ${err.message}`);
        core.setOutput("allowed", "false");
        core.setOutput("role",    "error");
        core.setOutput("type",    "error");
    }
}

run();