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

function loadRepoConfig() {
    try {
        return require("../.governance.json");
    } catch (err) {
        return {};
    }
}

module.exports = {
    loadGlobalConfig,
    loadRepoConfig
};