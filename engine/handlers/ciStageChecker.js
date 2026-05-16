const KNOWN_STAGES = ["lint", "test", "security", "build"];

/**
 * Reads the `requiredStages` block from config and compares each entry
 * against the live CI status map.
 *
 * @param {Record<string, boolean>} requiredStages - e.g. { lint: true, test: true, build: false }
 * @param {Record<string, string>}  ciStatuses     - e.g. { lint: "true", test: "false", ... }
 * @returns {{ violations: string[], skipped: string[] }}
 */
function evaluateCIStages(requiredStages, ciStatuses) {
    const violations = [];
    const skipped = [];

    for (const stage of KNOWN_STAGES) {
        const isRequired = requiredStages?.[stage] === true;

        if (!isRequired) {
            skipped.push(stage);
            continue;
        }

        const passed = ciStatuses[stage] === "true";

        if (!passed) {
            violations.push(stage);
        }
    }

    return { violations, skipped };
}

module.exports = { evaluateCIStages };
