const fs   = require("fs");
const path = require("path");

// ─── HTML helpers ────────────────────────────────────────────────────────────

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g,  "&amp;")
        .replace(/</g,  "&lt;")
        .replace(/>/g,  "&gt;")
        .replace(/"/g,  "&quot;");
}

// ─── Section: CI Job Reports ──────────────────────────────────────────────────

function renderJobReportsHtml(reportsData) {
    if (reportsData.length === 0) {
        return `<p class="empty">No job reports found.</p>`;
    }

    return reportsData.map(data => {
        const jobStatusClass =
            data.status === "passed" ? "badge-pass" :
            data.status === "error"  ? "badge-warn" : "badge-fail";

        const rules = (data.reports && Array.isArray(data.reports))
            ? data.reports.map(rep => {
                const cls  = rep.status === "passed" ? "rule-pass" : "rule-fail";
                const text = (rep.status || "UNKNOWN").toUpperCase();
                return `
            <li class="rule-item">
                <div class="rule-header">
                    <span>${escapeHtml(rep.name || "Unnamed Rule")}</span>
                    <span class="${cls}">${text}</span>
                </div>
                ${rep.comment ? `<div class="rule-comment">${escapeHtml(rep.comment)}</div>` : ""}
            </li>`;
            }).join("")
            : `<li class="rule-item"><div class="rule-comment">No detailed reports available.</div></li>`;

        return `
    <div class="card">
        <div class="card-header">
            <div class="card-title">${escapeHtml(data.job || "Unknown Job")}</div>
            <span class="badge ${jobStatusClass}">${escapeHtml(data.status || "unknown")}</span>
        </div>
        <ul class="rule-list">${rules}
        </ul>
    </div>`;
    }).join("");
}

// ─── Section: Artifact Probe ──────────────────────────────────────────────────

/**
 * @param {{ found: object[], missing: object[], warnings: string[] }} artifactReport
 */
function renderArtifactProbeHtml(artifactReport) {
    if (!artifactReport) return "";

    const foundRows = artifactReport.found.map(f => `
            <tr>
                <td><span class="badge badge-pass">✅ FOUND</span></td>
                <td><code>${escapeHtml(f.stage)}</code></td>
                <td><code>${escapeHtml(f.filename)}</code></td>
                <td>${escapeHtml(f.archiveCategory)}/</td>
            </tr>`).join("");

    const missingRows = artifactReport.missing.map(m => `
            <tr>
                <td><span class="badge badge-warn">⚠️ MISSING</span></td>
                <td><code>${escapeHtml(m.stage)}</code></td>
                <td><code>${escapeHtml(m.candidates.join(" | "))}</code></td>
                <td>—</td>
            </tr>`).join("");

    return `
    <div class="card">
        <div class="card-header">
            <div class="card-title">Artifact Probe</div>
        </div>
        <table class="audit-table">
            <thead><tr><th>Status</th><th>Stage</th><th>File(s)</th><th>Archive Category</th></tr></thead>
            <tbody>${foundRows}${missingRows}</tbody>
        </table>
    </div>`;
}

// ─── Section: Commit & Author Audit ──────────────────────────────────────────

/**
 * @param {{ commits: object[], authors: object[] }} commitAudit
 */
function renderCommitAuditHtml(commitAudit) {
    if (!commitAudit || !commitAudit.commits?.length) return "";

    const commitRows = commitAudit.commits.map(c => {
        const coAuthorText = c.coAuthors?.length
            ? c.coAuthors.map(ca => escapeHtml(ca.name)).join("<br>")
            : "—";
        const authorText = c.author?.login
            ? `@${escapeHtml(c.author.login)}`
            : escapeHtml(c.author?.name || "unknown");

        return `
            <tr>
                <td><code>${escapeHtml(c.sha)}</code></td>
                <td>${escapeHtml(c.message)}</td>
                <td>${authorText}</td>
                <td>${coAuthorText}</td>
            </tr>`;
    }).join("");

    const rosterRows = commitAudit.authors.map(a => {
        const roleBadgeClass =
            a.role === "maintainer" ? "badge-pass" :
            a.role === "co-author"  ? "badge-warn" : "badge-info";

        return `
            <tr>
                <td>${a.login ? `@${escapeHtml(a.login)}` : escapeHtml(a.name || "—")}</td>
                <td><code>${escapeHtml(a.email || "—")}</code></td>
                <td><span class="badge ${roleBadgeClass}">${escapeHtml(a.role)}</span></td>
                <td>${a.commits.map(s => `<code>${escapeHtml(s)}</code>`).join(" ")}</td>
            </tr>`;
    }).join("");

    return `
    <div class="card">
        <div class="card-header">
            <div class="card-title">Commit Audit</div>
        </div>
        <h3 class="section-sub">Commits</h3>
        <table class="audit-table">
            <thead><tr><th>SHA</th><th>Message</th><th>Author</th><th>Co-Authors</th></tr></thead>
            <tbody>${commitRows}</tbody>
        </table>
        <h3 class="section-sub">Author Roster</h3>
        <table class="audit-table">
            <thead><tr><th>Identity</th><th>Email</th><th>Role</th><th>Commits</th></tr></thead>
            <tbody>${rosterRows}</tbody>
        </table>
    </div>`;
}

// ─── Markdown renderers ───────────────────────────────────────────────────────

function renderJobReportsMd(reportsData) {
    if (reportsData.length === 0) return "No job reports found.\n";

    return reportsData.map(data => {
        const emoji = data.status === "passed" ? "✅" : data.status === "error" ? "⚠️" : "❌";
        let md = `## ${emoji} ${data.job || "Unknown Job"} (${data.status})\n\n`;

        if (data.reports && Array.isArray(data.reports)) {
            for (const rep of data.reports) {
                const e = rep.status === "passed" ? "🟢" : "🔴";
                md += `- ${e} **${rep.name || "Unnamed Rule"}**: ${(rep.status || "UNKNOWN").toUpperCase()}`;
                if (rep.comment) md += ` — *${rep.comment}*`;
                md += "\n";
            }
        } else {
            md += "- *No detailed reports available.*\n";
        }

        return md + "\n";
    }).join("");
}

function renderArtifactProbeMd(artifactReport) {
    if (!artifactReport) return "";

    let md = "## 📦 Artifact Probe\n\n";
    md += "| Status | Stage | File | Category |\n";
    md += "|--------|-------|------|----------|\n";

    for (const f of artifactReport.found) {
        md += `| ✅ Found | \`${f.stage}\` | \`${f.filename}\` | ${f.archiveCategory}/ |\n`;
    }
    for (const m of artifactReport.missing) {
        md += `| ⚠️ Missing | \`${m.stage}\` | \`${m.candidates.join(" \\| ")}\` | — |\n`;
    }

    return md + "\n";
}

function renderCommitAuditMd(commitAudit) {
    if (!commitAudit?.commits?.length) return "";

    let md = "## 🔍 Commit Audit\n\n";
    md += "### Commits\n\n";
    md += "| SHA | Message | Author | Co-Authors |\n";
    md += "|-----|---------|--------|------------|\n";

    for (const c of commitAudit.commits) {
        const coAuthors = c.coAuthors?.length
            ? c.coAuthors.map(ca => ca.name).join(", ")
            : "—";
        const author = c.author?.login
            ? `@${c.author.login}`
            : (c.author?.name || "unknown");

        md += `| \`${c.sha}\` | ${c.message} | ${author} | ${coAuthors} |\n`;
    }

    md += "\n### Author Roster\n\n";
    md += "| Identity | Email | Role | Commits |\n";
    md += "|----------|-------|------|---------|\n";

    for (const a of commitAudit.authors) {
        const identity = a.login ? `@${a.login}` : (a.name || "—");
        const commits  = a.commits.map(s => `\`${s}\``).join(" ");
        md += `| ${identity} | \`${a.email || "—"}\` | ${a.role} | ${commits} |\n`;
    }

    return md + "\n";
}

// ─── Shared CSS ───────────────────────────────────────────────────────────────

const SHARED_CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.6; color: #24292f; background: #f6f8fa;
        max-width: 1100px; margin: 0 auto; padding: 24px;
    }
    h1  { font-size: 1.6em; border-bottom: 2px solid #d0d7de; padding-bottom: 10px; margin-bottom: 20px; }
    h2  { font-size: 1.2em; margin-bottom: 14px; }
    h3.section-sub { font-size: 1em; margin: 16px 0 8px; color: #57606a; }
    .card {
        background: #fff; border: 1px solid #d0d7de; border-radius: 8px;
        padding: 16px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.06);
    }
    .card-header {
        display: flex; justify-content: space-between; align-items: center;
        border-bottom: 1px solid #eaecef; padding-bottom: 10px; margin-bottom: 14px;
    }
    .card-title { font-size: 1.1em; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; }
    .badge {
        display: inline-block; padding: 2px 9px; border-radius: 20px;
        font-weight: 700; font-size: .78em; text-transform: uppercase; letter-spacing: .04em;
    }
    .badge-pass { background: #dafbe1; color: #1a7f37; }
    .badge-fail { background: #ffeef0; color: #cf222e; }
    .badge-warn { background: #fff8c5; color: #9a6700; }
    .badge-info { background: #ddf4ff; color: #0969da; }
    .rule-list  { list-style: none; }
    .rule-item  { padding: 9px 0; border-bottom: 1px solid #eaecef; }
    .rule-item:last-child { border-bottom: none; }
    .rule-header { display: flex; justify-content: space-between; font-weight: 600; }
    .rule-pass   { color: #1a7f37; }
    .rule-fail   { color: #cf222e; }
    .rule-comment { color: #57606a; font-size: .88em; margin-top: 3px; }
    .audit-table { width: 100%; border-collapse: collapse; font-size: .88em; }
    .audit-table th {
        background: #f6f8fa; border: 1px solid #d0d7de;
        padding: 6px 10px; text-align: left; font-weight: 600;
    }
    .audit-table td { border: 1px solid #d0d7de; padding: 6px 10px; vertical-align: top; }
    .audit-table tr:nth-child(even) td { background: #f6f8fa; }
    code { background: #eef0f3; padding: 1px 5px; border-radius: 4px; font-size: .9em; }
    .empty { color: #57606a; font-style: italic; }
`;

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generates the full HTML report and its GitHub Step Summary markdown.
 * Writes the HTML to `<workspace>/ci-report.html`.
 * Returns the raw HTML string (for archive) and the markdown string (for PR comment).
 *
 * @param {string} workspace
 * @param {{ found: object[], missing: object[], warnings: string[] }} [artifactReport]
 * @param {{ commits: object[], authors: object[] }}                   [commitAudit]
 * @returns {{ html: string, markdown: string }}
 */
function generateReport(workspace, artifactReport, commitAudit) {
    const reportsDir  = path.join(workspace, "reports");
    const outputFile  = path.join(workspace, "ci-report.html");
    const reportsData = [];

    if (fs.existsSync(reportsDir)) {
        for (const d of fs.readdirSync(reportsDir)) {
            const dirPath = path.join(reportsDir, d);
            if (!fs.statSync(dirPath).isDirectory()) continue;

            for (const f of fs.readdirSync(dirPath)) {
                // Only load summary files — ignore SARIF, JUnit, LCOV, CycloneDX etc.
                if (!f.endsWith("-summary.json")) continue;
                try {
                    const content = fs.readFileSync(path.join(dirPath, f), "utf8");
                    const parsed  = JSON.parse(content);
                    if (parsed.job && parsed.status) {
                        reportsData.push(parsed);
                    }
                } catch {
                    reportsData.push({
                        job:     f,
                        status:  "error",
                        reports: [{ name: "Parse Error", status: "error", comment: `Failed to parse ${f}` }]
                    });
                }
            }
        }
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CI Governance Report</title>
    <style>${SHARED_CSS}</style>
</head>
<body>
    <h1>CI Governance Report</h1>
    <h2>Job Results</h2>
    ${renderJobReportsHtml(reportsData)}
    ${renderArtifactProbeHtml(artifactReport)}
    ${renderCommitAuditHtml(commitAudit)}
</body>
</html>`;

    fs.writeFileSync(outputFile, html);
    console.log(`[GOVERNANCE][SYSTEM] Generated HTML report at ${outputFile}`);

    let markdown = `# CI Governance Report\n\n`;
    markdown += renderJobReportsMd(reportsData);
    markdown += renderArtifactProbeMd(artifactReport);
    markdown += renderCommitAuditMd(commitAudit);

    if (process.env.GITHUB_STEP_SUMMARY) {
        try {
            fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
            console.log("[GOVERNANCE][SYSTEM] Appended report to GITHUB_STEP_SUMMARY");
        } catch (err) {
            console.error("[GOVERNANCE][SYSTEM] Failed to write to GITHUB_STEP_SUMMARY:", err);
        }
    }

    return { html, markdown };
}

// Keep backward-compatible export for any callers still using generateHTMLReport
function generateHTMLReport(workspace) {
    const { markdown } = generateReport(workspace, null, null);
    return markdown;
}

module.exports = { generateReport, generateHTMLReport };
