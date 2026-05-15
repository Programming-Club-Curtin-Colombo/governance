const fs = require("fs");
const path = require("path");
const github = require("@actions/github");

/**
 * Validates the repository structure against the Programming Club standards.
 * @param {object} config The governance configuration object.
 * @returns {string[]} Array of error messages.
 */
function validateStructure(config) {
    const isPrivate = github.context.payload.repository?.private;
    const errors = [];

    // 1. Tests directory
    const hasTests = fs.existsSync("tests") || fs.existsSync("src/tests");
    if (!hasTests) {
        errors.push("Missing 'tests' or 'src/tests' directory.");
    }

    // 2. .gitignore
    if (!fs.existsSync(".gitignore")) {
        errors.push("Missing '.gitignore' file.");
    }

    // 3. Workflow files
    const workflowDir = ".github/workflows";
    const hasWorkflows = fs.existsSync(workflowDir) && fs.readdirSync(workflowDir).some(file => file.endsWith(".yml") || file.endsWith(".yaml"));
    if (!hasWorkflows) {
        errors.push("Missing workflow files in '.github/workflows/'.");
    }

    // 4. Issue templates
    const templateDir = ".github/ISSUE_TEMPLATE";
    const hasBug = fs.existsSync(path.join(templateDir, "bug_report.yml")) || fs.existsSync(path.join(templateDir, "bug_report.md"));
    const hasFeature = fs.existsSync(path.join(templateDir, "feature_request.yml")) || fs.existsSync(path.join(templateDir, "feature_request.md"));

    if (!hasBug) errors.push("Missing bug report template (.github/ISSUE_TEMPLATE/bug_report.yml).");
    if (!hasFeature) errors.push("Missing feature request template (.github/ISSUE_TEMPLATE/feature_request.yml).");

    // 5. config.yml for issues
    const configPath = path.join(templateDir, "config.yml");
    if (!fs.existsSync(configPath)) {
        errors.push("Missing '.github/ISSUE_TEMPLATE/config.yml'.");
    } else {
        const content = fs.readFileSync(configPath, "utf8");
        if (!isPrivate && !content.includes("contact_links:")) {
            errors.push("Public repository must have 'contact_links' defined in '.github/ISSUE_TEMPLATE/config.yml'.");

        }
        if (!content.includes("blank_issues_enabled: false")) {
            errors.push("Private repository must set 'blank_issues_enabled: false' in '.github/ISSUE_TEMPLATE/config.yml'.");
        }
    }

    // 6. .governance.json
    if (!fs.existsSync(".governance.json")) {
        errors.push("Missing '.governance.json' configuration file.");
    }

    // 7. README.md
    if (!fs.existsSync("README.md")) {
        errors.push("Missing 'README.md'.");
    }

    // 8. Public specific files
    if (!isPrivate) {
        if (!fs.existsSync("CONTRIBUTING.md")) {
            errors.push("Missing 'CONTRIBUTING.md' (required for public repositories).");
        }
        if (!fs.existsSync(".github/SECURITY.md") && !fs.existsSync("SECURITY.md")) {
            errors.push("Missing 'SECURITY.md' (required for public repositories).");
        }
    }

    // 9. ARCHITECTURE.md
    if (!fs.existsSync("ARCHITECTURE.md")) {
        errors.push("Missing 'ARCHITECTURE.md'.");
    }

    // 10. API.md (optional unless mandatory)
    if (config?.standards?.enforceAPI && !fs.existsSync("API.md")) {
        errors.push("Missing 'API.md' (mandatory according to governance config).");
    }

    return errors;
}

module.exports = { validateStructure };
