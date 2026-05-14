function isAllowedEmail(email, allowedDomains = []) {
    if (!email) return false;

    const domain = email.split("@")[1];
    if (!domain) return false;

    return allowedDomains.some(rule => {
        // exact match
        if (!rule.includes("*")) {
            return domain === rule;
        }

        // wildcard match (*.example.com)
        const base = rule.replace("*.", "");
        return domain === base || domain.endsWith("." + base);
    });
}

function validateContributor({ email, role, config }) {
    if (!config?.emailValidation) {
        return {
            allowed: false,
            reason: "Missing email validation config"
        };
    }

    const rules = config.emailValidation;
    const allowedDomains = rules.allowedEmailDomains || [];

    // =========================
    // MAINTAINER → ALWAYS ALLOWED
    // =========================
    if (role === "maintainer") {
        return {
            allowed: true,
            reason: "Maintainer bypass"
        };
    }

    // =========================
    // EMAIL CHECK (GLOBAL RULE)
    // =========================
    if (rules.enabled !== false) {
        const ok = isAllowedEmail(email, allowedDomains);

        if (!ok) {
            return {
                allowed: false,
                reason: `Email domain not allowed: ${email}`
            };
        }
    }

    // =========================
    // EXTERNAL / STUDENT DEFAULT PASS
    // =========================
    return {
        allowed: true,
        reason: "Passed governance validation"
    };
}

module.exports = {
    isAllowedEmail,
    validateContributor
};