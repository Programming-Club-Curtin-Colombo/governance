const fs = require("fs");
const path = require("path");

function generateHTMLReport(workspace) {
    const reportsDir = path.join(workspace, "reports");
    const outputFile = path.join(workspace, "ci-report.html");

    const reportsData = [];

    if (fs.existsSync(reportsDir)) {
        const dirs = fs.readdirSync(reportsDir);
        for (const d of dirs) {
            const dirPath = path.join(reportsDir, d);
            if (fs.statSync(dirPath).isDirectory()) {
                const files = fs.readdirSync(dirPath);
                for (const f of files) {
                    if (f.endsWith(".json")) {
                        try {
                            const content = fs.readFileSync(path.join(dirPath, f), "utf8");
                            reportsData.push(JSON.parse(content));
                        } catch (e) {
                            reportsData.push({
                                job: f,
                                status: "error",
                                reports: [{ name: "Parse Error", failed: true, comment: `Failed to parse ${f}` }]
                            });
                        }
                    }
                }
            }
        }
    }

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CI Governance Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 1000px; margin: 0 auto; padding: 20px; }
        h1 { border-bottom: 2px solid #eaecef; padding-bottom: 10px; }
        .job-card { background: #f6f8fa; border: 1px solid #d1d5da; border-radius: 6px; padding: 15px; margin-bottom: 20px; }
        .job-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eaecef; padding-bottom: 10px; margin-bottom: 15px; }
        .job-title { font-size: 1.2em; font-weight: bold; text-transform: uppercase; }
        .status-badge { padding: 4px 8px; border-radius: 12px; font-weight: bold; font-size: 0.85em; text-transform: uppercase; }
        .status-passed { background: #dcffe4; color: #22863a; }
        .status-failed { background: #ffeef0; color: #cb2431; }
        .status-error { background: #ffdce0; color: #cb2431; }
        .rule-list { list-style-type: none; padding: 0; margin: 0; }
        .rule-item { padding: 10px; border-bottom: 1px solid #eaecef; display: flex; flex-direction: column; }
        .rule-item:last-child { border-bottom: none; }
        .rule-header { display: flex; justify-content: space-between; font-weight: bold; }
        .rule-status-pass { color: #22863a; }
        .rule-status-fail { color: #cb2431; }
        .rule-comment { color: #586069; font-size: 0.9em; margin-top: 4px; }
    </style>
</head>
<body>
    <h1>CI Governance Report</h1>
`;

    if (reportsData.length === 0) {
        html += `<p>No job reports found.</p>\n`;
    }

    for (const data of reportsData) {
        const jobStatusClass = data.status === "passed" ? "status-passed" : (data.status === "error" ? "status-error" : "status-failed");
        html += `
    <div class="job-card">
        <div class="job-header">
            <div class="job-title">${data.job || "Unknown Job"}</div>
            <div class="status-badge ${jobStatusClass}">${data.status || "unknown"}</div>
        </div>
        <ul class="rule-list">`;
        
        if (data.reports && Array.isArray(data.reports)) {
            for (const rep of data.reports) {
                const ruleClass = rep.failed ? "rule-status-fail" : "rule-status-pass";
                const ruleText = rep.failed ? "FAILED" : "PASSED";
                html += `
            <li class="rule-item">
                <div class="rule-header">
                    <span>${rep.name || "Unnamed Rule"}</span>
                    <span class="${ruleClass}">${ruleText}</span>
                </div>
                ${rep.comment ? `<div class="rule-comment">${rep.comment}</div>` : ""}
            </li>`;
            }
        } else {
            html += `<li class="rule-item"><div class="rule-comment">No detailed reports available for this job.</div></li>`;
        }

        html += `
        </ul>
    </div>`;
    }

    html += `
</body>
</html>`;

    fs.writeFileSync(outputFile, html);
    console.log(`[GOVERNANCE][SYSTEM] Generated HTML report at ${outputFile}`);
}

module.exports = { generateHTMLReport };
