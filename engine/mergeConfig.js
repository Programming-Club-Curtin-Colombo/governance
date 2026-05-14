function mergeConfigs(globalConfig, repoConfig = {}) {
    const merged = structuredClone(globalConfig);

    // =========================
    // ROLE CONFIG (shallow override)
    // =========================
    merged.roles = {
        ...globalConfig.roles,
        ...repoConfig.roles
    };

    // =========================
    // EMAIL DOMAINS (UNION RULE)
    // =========================
    const globalDomains =
        globalConfig.emailValidation?.allowedEmailDomains || [];

    const repoDomains =
        repoConfig.emailValidation?.allowedEmailDomains || [];

    merged.emailValidation = {
        ...globalConfig.emailValidation,
        ...repoConfig.emailValidation,
        allowedEmailDomains: [
            ...new Set([...globalDomains, ...repoDomains])
        ]
    };

    // =========================
    // EXTERNAL WHITELIST (UNION RULE)
    // =========================
    const globalExternal =
        globalConfig.roles?.external?.whitelistUsers || [];

    const repoExternal =
        repoConfig.roles?.external?.whitelistUsers || [];

    merged.roles.external = {
        ...globalConfig.roles.external,
        ...repoConfig.roles?.external,
        whitelistUsers: [
            ...new Set([...globalExternal, ...repoExternal])
        ]
    };

    // =========================
    // DEBUG (repo override allowed)
    // =========================
    merged.debug = {
        ...globalConfig.debug,
        ...repoConfig.debug
    };

    return merged;
}

module.exports = { mergeConfigs };