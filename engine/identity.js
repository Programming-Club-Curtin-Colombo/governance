function getRole(username, config) {
    if (!username || !config?.roles) return "student";

    if (config.roles.maintainers?.includes(username)) return "maintainer";

    if (config.roles.external?.whitelistUsers?.includes(username)) return "external";

    return "student";
}

module.exports = { getRole };