function mergeConfigs(globalConfig, repoConfig = {}) {
    const merged = structuredClone(globalConfig);

    merged.roles = {
        ...globalConfig.roles,
        ...repoConfig.roles
    };

    const globalDomains = globalConfig.emailValidation?.allowedEmailDomains || [];
    const repoDomains = repoConfig.emailValidation?.allowedEmailDomains || [];

    merged.emailValidation = {
        ...globalConfig.emailValidation,
        ...repoConfig.emailValidation,
        allowedEmailDomains: [...new Set([...globalDomains, ...repoDomains])]
    };

    const globalExternal = globalConfig.roles?.external?.whitelistUsers || [];
    const repoExternal = repoConfig.roles?.external?.whitelistUsers || [];

    merged.roles.external = {
        ...globalConfig.roles.external,
        ...repoConfig.roles?.external,
        whitelistUsers: [...new Set([...globalExternal, ...repoExternal])]
    };

    merged.audit = {
        ...globalConfig.audit,
        ...repoConfig.audit,
        sinks: {
            ...globalConfig.audit?.sinks,
            ...repoConfig.audit?.sinks
        }
    };

    merged.debug = {
        ...globalConfig.debug,
        ...repoConfig.debug
    };

    return merged;
}

module.exports = { mergeConfigs };