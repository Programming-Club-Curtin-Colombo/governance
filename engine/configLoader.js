const https = require("https");

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = "";

            res.on("data", chunk => {
                data += chunk;
            });

            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch (err) {
                    reject(new Error(`Invalid JSON from ${url}`));
                }
            });

        }).on("error", reject);
    });
}

function resolveVersion(repoConfig) {
    return repoConfig?.governance?.lockedVersion || process.env.GOVERNANCE_VERSION;
}

async function loadGlobalConfig(repoConfig) {
    const version = resolveVersion(repoConfig);

    const base = "https://raw.githubusercontent.com/Programming-Club-Curtin-Colombo/governance";
    const ref = version ? version : "main";
    const url = `${base}/${ref}/standards/global.governance.json`;

    return fetchJSON(url);
}

const fs = require("fs");
const path = require("path");

function loadRepoConfig() {
    const workspace = process.env.GITHUB_WORKSPACE || ".";
    const configPath = path.join(workspace, ".governance.json");

    try {
        if (!fs.existsSync(configPath)) return {};
        return JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch (err) {
        return {};
    }
}

module.exports = {
    loadGlobalConfig,
    loadRepoConfig
};