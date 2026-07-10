const fs   = require("fs");
const path = require("path");

/**
 * Maps each archive category to its output subdirectory name.
 *
 * @type {Record<string, string>}
 */
const CATEGORY_DIRS = {
    build:    "build",
    test:     "test",
    analysis: "analysis",
    sbom:     "sbom",
    reports:  "reports"
};

/**
 * Ensures a directory exists, creating it (and any parents) if necessary.
 *
 * @param {string} dirPath
 */
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Assembles the canonical artifact archive from the files located by the prober
 * and the HTML governance report.
 *
 * Output structure:
 * ```
 * artifacts/
 * ├── build/
 * │   ├── build.log
 * │   └── build-summary.json
 * ├── test/
 * │   ├── junit.xml
 * │   ├── coverage.xml
 * │   └── lcov.info
 * ├── analysis/
 * │   ├── eslint.sarif
 * │   ├── codeql.sarif
 * │   ├── semgrep.sarif
 * │   └── trivy.sarif
 * ├── sbom/
 * │   └── cyclonedx.json
 * └── reports/
 *     └── summary.html
 * ```
 *
 * @param {Array<{ filename: string, absolutePath: string, archiveCategory: string }>} foundArtifacts
 * @param {string} htmlReportContent  - Raw HTML string for summary.html
 * @param {string} workspace          - GITHUB_WORKSPACE or "."
 * @returns {string} Absolute path to the `artifacts/` root directory
 */
function archiveArtifacts(foundArtifacts, htmlReportContent, workspace) {
    const archiveRoot = path.join(workspace, "artifacts");

    // Create all category directories upfront
    for (const subDir of Object.values(CATEGORY_DIRS)) {
        ensureDir(path.join(archiveRoot, subDir));
    }

    // Copy each located artifact into its category directory
    for (const artifact of foundArtifacts) {
        const categoryDir = CATEGORY_DIRS[artifact.archiveCategory];

        if (!categoryDir) {
            console.warn(
                `[GOVERNANCE][ARCHIVE] Unknown category '${artifact.archiveCategory}' ` +
                `for file '${artifact.filename}' — skipping`
            );
            continue;
        }

        const destination = path.join(archiveRoot, categoryDir, artifact.filename);

        try {
            fs.copyFileSync(artifact.absolutePath, destination);
            console.log(
                `[GOVERNANCE][ARCHIVE] Copied ${artifact.filename} → artifacts/${categoryDir}/`
            );
        } catch (err) {
            console.error(
                `[GOVERNANCE][ARCHIVE] Failed to copy '${artifact.filename}': ${err.message}`
            );
        }
    }

    // Write the governance HTML report as reports/summary.html
    if (htmlReportContent) {
        const summaryPath = path.join(archiveRoot, "reports", "summary.html");
        try {
            fs.writeFileSync(summaryPath, htmlReportContent, "utf8");
            console.log("[GOVERNANCE][ARCHIVE] Written artifacts/reports/summary.html");
        } catch (err) {
            console.error(
                `[GOVERNANCE][ARCHIVE] Failed to write summary.html: ${err.message}`
            );
        }
    }

    console.log(`[GOVERNANCE][ARCHIVE] Archive assembled at: ${archiveRoot}`);

    return archiveRoot;
}

module.exports = { archiveArtifacts };
