const core = require("@actions/core");
const github = require("@actions/github");
const https = require("https");

// =========================
// FETCH JSON
// =========================
function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = "";

            res.on("data", chunk => (data += chunk));

            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    reject(new Error("Invalid JSON from " + url));
                }
            });
        }).on("error", reject);
    });
}

// =========================
// LOAD GLOBAL CONFIG (REMOTE + PINNED)
// =========================
async function loadGlobalConfig() {
    const version = process.env.GOVERNANCE_VERSION;

    if (version) {
        try {
            const url =
                `https://raw.githubusercontent.com/Programming-Club-Curtin-Colombo/governance/${version}/standards/global.governance.json`;

            console.log(`[GOVERNANCE] Using pinned config: ${version}`);
            return await fetchJSON(url);
        } catch {
            console.warn("[GOVERNANCE] Pinned config failed, fallback to main");
        }
    }

    const fallback =
        "https://raw.githubusercontent.com/Programming-Club-Curtin-Colombo/governance/main/standards/global.governance.json";

    console.log("[GOVERNANCE] Using main config");
    return await fetchJSON(fallback);
}

// =========================
// LOAD REPO CONFIG
// =========================
function loadRepoConfig() {
    const path = process.env.CONFIG_PATH || "./.governance.json";
    try {
        return require(path);
    } catch {
        return {}; // repo config optional
    }
}

// =========================
// CONFIG MERGE ENGINE
// =========================
function mergeConfigs(globalConfig, repoConfig) {
    const merged = structuredClone(globalConfig);

    // roles merge (shallow extend)
    merged.roles = {
        ...merged.roles,
        ...repoConfig.roles
    };

    // email domains UNION
    const gDomains = globalConfig.emailValidation?.allowedEmailDomains || [];
    const rDomains = repoConfig.emailValidation?.allowedEmailDomains || [];

    merged.emailValidation = {
        ...merged.emailValidation,
        ...repoConfig.emailValidation,
        allowedEmailDomains: [...new Set([...gDomains, ...rDomains])]
    };

    // external whitelist UNION
    const gExt = globalConfig.roles?.external?.whitelistUsers || [];
    const rExt = repoConfig.roles?.external?.whitelistUsers || [];

    merged.roles.external = {
        ...merged.roles.external,
        ...repoConfig.roles?.external,
        whitelistUsers: [...new Set([...gExt, ...rExt])]
    };

    // debug override
    merged.debug = {
        ...globalConfig.debug,
        ...repoConfig.debug
    };

    return merged;
}

// =========================
// CONFIG VALIDATION
// =========================
function validateConfig(cfg) {
    if (!cfg?.roles) throw new Error("Missing roles config");
    if (!cfg?.emailValidation) throw new Error("Missing emailValidation config");
}

// =========================
// FAILURE HANDLER
// =========================
function governanceFail(message, cfg) {
    if (cfg?.debug?.dryRun) {
        console.warn(`[DRY RUN] ${message}`);
        return;
    }
    core.setFailed(message);
}

// =========================
// LOGGING
// =========================
function log(role, state, msg) {
    console.log(`[GOVERNANCE][${role}][${state}] ${msg}`);
}

function warn(role, msg) {
    console.warn(`[GOVERNANCE][${role}][WARNING] ${msg}`);
}

// =========================
// EMAIL MATCHER
// =========================
function isAllowedEmail(email, allowed) {
    if (!email || !allowed?.length) return false;

    const domain = email.split("@")[1];

    return allowed.some(rule => {
        if (!rule.includes("*")) return domain === rule;

        const base = rule.replace("*.", "");
        return domain === base || domain.endsWith("." + base);
    });
}

// =========================
// ROLE RESOLVER
// =========================
function getRole(username, cfg) {
    if (cfg.roles.maintainers.includes(username)) return "maintainer";
    if (cfg.roles.external.whitelistUsers.includes(username)) return "external";
    return "student";
}

// =========================
// LABEL MANAGEMENT
// =========================
async function cleanupLabels(octokit, pr) {
    const roleLabels = ["role:student", "role:external", "role:maintainer"];

    for (const l of pr.labels.map(x => x.name)) {
        if (roleLabels.includes(l)) {
            await octokit.rest.issues.removeLabel({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                issue_number: pr.number,
                name: l
            });
        }
    }
}

async function applyLabel(octokit, pr, role) {
    await octokit.rest.issues.addLabels({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: pr.number,
        labels: [`role:${role}`]
    });
}

// =========================
// MAIN
// =========================
async function run() {
    try {
        const globalConfig = await loadGlobalConfig();
        const repoConfig = loadRepoConfig();

        const config = mergeConfigs(globalConfig, repoConfig);
        validateConfig(config);

        const pr = github.context.payload.pull_request;
        if (!pr) {
            governanceFail("[SYSTEM][BLOCKED] Not a PR event", config);
            return;
        }

        const username = pr.user.login;
        log("system", "info", `Processing ${username}`);

        const octokit = github.getOctokit(process.env.GITHUB_TOKEN);

        const { data: user } =
            await octokit.rest.users.getByUsername({ username });

        const email = user?.email;

        const role = getRole(username, config);
        log(role, "info", "Resolved");

        await cleanupLabels(octokit, pr);

        const emailRules = config.emailValidation;

        // =========================
        // MAINTAINER
        // =========================
        if (role === "maintainer") {
            await applyLabel(octokit, pr, "maintainer");
            log("maintainer", "bypass", "Granted");
            return;
        }

        // =========================
        // EXTERNAL
        // =========================
        if (role === "external") {
            if (config.roles.external.requireApproval) {
                warn("external", "Manual approval required");
            }

            if (emailRules.enabled && config.roles.external.requireDomainCheck) {
                if (!isAllowedEmail(email, emailRules.allowedEmailDomains)) {
                    governanceFail(
                        "[EXTERNAL][BLOCKED] Email domain not allowed",
                        config
                    );
                    return;
                }
            }

            await applyLabel(octokit, pr, "external");
            log("external", "approved", "Validated");
            return;
        }

        // =========================
        // STUDENT
        // =========================
        if (role === "student") {
            if (emailRules.enabled) {
                if (!isAllowedEmail(email, emailRules.allowedEmailDomains)) {
                    governanceFail(
                        "[STUDENT][BLOCKED] Email domain not allowed",
                        config
                    );
                    return;
                }
            }

            await applyLabel(octokit, pr, "student");
            log("student", "approved", "Validated");
            return;
        }

        governanceFail("[SYSTEM][BLOCKED] Unknown role state", config);

    } catch (err) {
        core.setFailed(`[SYSTEM][ERROR] ${err.message}`);
    }
}

run();