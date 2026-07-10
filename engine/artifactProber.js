const fs   = require("fs");
const path = require("path");

/**
 * Maps each governance stage to the artifact sub-directory name (as uploaded
 * by the individual CI job) and the candidate filenames it should contain.
 * The first matching candidate wins.
 *
 * @type {Record<string, { dirs: string[], candidates: string[], archiveCategory: string }>}
 */
const STAGE_ARTIFACT_MAP = {
    build: {
        dirs:            ["build-report", "build"],
        candidates:      ["build.log", "build-summary.json"],
        archiveCategory: "build"
    },
    lint: {
        dirs:            ["lint-report", "lint"],
        candidates:      ["eslint.sarif"],
        archiveCategory: "analysis"
    },
    test: {
        dirs:            ["test-report", "test"],
        candidates:      ["junit.xml"],
        archiveCategory: "test"
    },
    coverage: {
        dirs:            ["coverage-report", "test-report", "test"],
        candidates:      ["lcov.info", "coverage.xml"],
        archiveCategory: "test"
    },
    security: {
        dirs:            ["security-report", "security"],
        candidates:      ["trivy.sarif", "dependency.sarif"],
        archiveCategory: "analysis"
    },
    static: {
        dirs:            ["static-report", "static"],
        candidates:      ["codeql.sarif", "semgrep.sarif"],
        archiveCategory: "analysis"
    },
    sbom: {
        dirs:            ["sbom-report", "sbom"],
        candidates:      ["cyclonedx.json"],
        archiveCategory: "sbom"
    },
    benchmark: {
        dirs:            ["benchmark-report", "build-report", "build"],
        candidates:      ["benchmark.json"],
        archiveCategory: "perf"
    }
};

/**
 * Opportunistic files discovered across ALL artifact directories regardless
 * of which specific stage produced them.
 *
 * @type {Array<{ filename: string, archiveCategory: string }>}
 */
const OPPORTUNISTIC_FILES = [];

/**
 * Recursively lists all files under a given directory.
 *
 * @param {string} dir
 * @returns {string[]} Absolute file paths
 */
function listAllFiles(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...listAllFiles(full));
        } else {
            results.push(full);
        }
    }

    return results;
}

/**
 * Searches a list of directories (in order) under `reportsRoot` for the first
 * candidate filename that exists on disk.
 *
 * @param {string}   reportsRoot
 * @param {string[]} dirs        - Artifact sub-directory names to try
 * @param {string[]} candidates  - Filenames to look for (first match wins)
 * @returns {{ absolutePath: string, filename: string } | null}
 */
function findCandidateInDirs(reportsRoot, dirs, candidates) {
    for (const dir of dirs) {
        const dirPath = path.join(reportsRoot, dir);
        if (!fs.existsSync(dirPath)) continue;

        for (const candidate of candidates) {
            const filePath = path.join(dirPath, candidate);
            if (fs.existsSync(filePath)) {
                return { absolutePath: filePath, filename: candidate };
            }
        }
    }

    return null;
}

/**
 * Probes the downloaded artifact directories for expected standard-format files.
 *
 * @param {Record<string, string>} ciStatuses  - e.g. { build: "true", lint: "true", ... }
 * @param {string}                 workspace   - GITHUB_WORKSPACE or "."
 * @returns {{
 *   found:    Array<{ stage: string, filename: string, absolutePath: string, archiveCategory: string }>,
 *   missing:  Array<{ stage: string, candidates: string[] }>,
 *   warnings: string[]
 * }}
 */
function probeArtifacts(ciStatuses, workspace) {
    const reportsRoot = path.join(workspace, "reports");
    const found       = [];
    const missing     = [];
    const warnings    = [];

    // ── Stage-specific probing ──────────────────────────────────────────────
    for (const [stage, spec] of Object.entries(STAGE_ARTIFACT_MAP)) {
        const ran = ciStatuses[stage] === "true";
        if (!ran) continue;

        const match = findCandidateInDirs(reportsRoot, spec.dirs, spec.candidates);

        if (match) {
            found.push({
                stage,
                filename:        match.filename,
                absolutePath:    match.absolutePath,
                archiveCategory: spec.archiveCategory
            });
        } else {
            missing.push({ stage, candidates: spec.candidates });
            const warning =
                `[GOVERNANCE][ARTIFACT] WARN: Stage '${stage}' ran but none of ` +
                `[${spec.candidates.join(", ")}] were found under reports/`;
            warnings.push(warning);
            console.warn(warning);
        }
    }

    // ── Opportunistic probing ───────────────────────────────────────────────
    const allFiles = listAllFiles(reportsRoot);

    for (const spec of OPPORTUNISTIC_FILES) {
        const absolutePath = allFiles.find(f => path.basename(f) === spec.filename);
        if (absolutePath) {
            // Avoid duplicates if a stage probe already picked this up
            const alreadyFound = found.some(f => f.filename === spec.filename);
            if (!alreadyFound) {
                found.push({
                    stage:           "opportunistic",
                    filename:        spec.filename,
                    absolutePath,
                    archiveCategory: spec.archiveCategory
                });
            }
        }
    }

    return { found, missing, warnings };
}

module.exports = { probeArtifacts };
