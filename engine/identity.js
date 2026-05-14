function getRole(username, config) {
    if (!username || !config?.roles) {
        return "student";
    }

    // =========================
    // 1. MAINTAINER (HIGHEST PRIORITY)
    // =========================
    if (config.roles.maintainers?.includes(username)) {
        return "maintainer";
    }

    // =========================
    // 2. EXTERNAL (WHITELISTED)
    // =========================
    if (config.roles.external?.whitelistUsers?.includes(username)) {
        return "external";
    }

    // =========================
    // 3. DEFAULT
    // =========================
    return "student";
}

module.exports = { getRole };