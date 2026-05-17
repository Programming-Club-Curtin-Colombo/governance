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
    const workspace = process.env.GITHUB_WORKSPACE || ".";

    const checkFile = (p) => fs.existsSync(path.join(workspace, p));
    const listFiles = (p) => fs.existsSync(path.join(workspace, p)) ? fs.readdirSync(path.join(workspace, p)) : [];

    const structure = config.structure;
    if (!structure) return errors;

    if (structure.directories) {
        for (const dir of structure.directories) {
            if (!checkFile(dir)) {
                errors.push(`Missing required directory: '${dir}'.`);
            } else {
                // Special rule for workflows if it's required
                if (dir === ".github/workflows") {
                    const hasWorkflows = listFiles(dir).some(file => file.endsWith(".yml") || file.endsWith(".yaml"));
                    if (!hasWorkflows) {
                        errors.push(`Missing workflow files in '${dir}'.`);
                    }
                }
            }
        }
    }

    if (structure.anyOfDirectories) {
        for (const dirs of structure.anyOfDirectories) {
            const hasAny = dirs.some(dir => checkFile(dir));
            if (!hasAny) {
                errors.push(`Missing one of required directories: ${dirs.join(" or ")}.`);
            }
        }
    }

    if (structure.files) {
        for (const file of structure.files) {
            if (!checkFile(file)) {
                errors.push(`Missing required file: '${file}'.`);
            } else {
                // Special rule for config.yml
                if (file === ".github/ISSUE_TEMPLATE/config.yml") {
                    const content = fs.readFileSync(path.join(workspace, file), "utf8");
                    if (!isPrivate && !content.includes("contact_links:")) {
                        errors.push(`Public repository must have 'contact_links' defined in '${file}'.`);
                    }
                    if (!content.includes("blank_issues_enabled: false")) {
                        errors.push(`The issue configuration must set 'blank_issues_enabled: false' in '${file}'.`);
                    }
                }
            }
        }
    }

    if (structure.anyOfFiles) {
        for (const files of structure.anyOfFiles) {
            const hasAny = files.some(file => checkFile(file));
            if (!hasAny) {
                errors.push(`Missing one of required files: ${files.join(" or ")}.`);
            }
        }
    }

    if (!isPrivate) {
        if (structure.publicFiles) {
            for (const file of structure.publicFiles) {
                if (!checkFile(file)) {
                    errors.push(`Missing '${file}' (required for public repositories).`);
                }
            }
        }
        
        if (structure.publicAnyOfFiles) {
            for (const files of structure.publicAnyOfFiles) {
                const hasAny = files.some(file => checkFile(file));
                if (!hasAny) {
                    errors.push(`Missing one of: ${files.join(" or ")} (required for public repositories).`);
                }
            }
        }
    }

    return errors;
}

module.exports = { validateStructure };
