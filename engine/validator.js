function isAllowedEmail(email, allowedDomains = []) {
    if (!email) return false;

    const domain = email.split("@")[1];
    if (!domain) return false;

    return allowedDomains.some(rule => {
        if (!rule.includes("*")) return domain === rule;

        const base = rule.replace("*.", "");
        return domain === base || domain.endsWith("." + base);
    });
}

function validateContributor({ email, role, config }) {
    if (!config?.emailValidation) {
        return { allowed: false, reason: "Missing email validation config" };
    }

    const rules = config.emailValidation;
    const allowedDomains = rules.allowedEmailDomains || [];

    if (role === "maintainer") {
        return { allowed: true, reason: "Maintainer bypass" };
    }

    if (rules.enabled !== false && !isAllowedEmail(email, allowedDomains)) {
        return { allowed: false, reason: `Email domain not allowed: ${email}` };
    }

    return { allowed: true, reason: "Passed governance validation" };
}

module.exports = { isAllowedEmail, validateContributor };