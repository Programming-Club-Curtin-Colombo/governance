async function writeRepoAudit(event, { octokit }) {
    const repoName =
        `${event.repo}`.replace("/", "__");

    const path = `events/${repoName}.jsonl`;

    let sha;
    let existingContent = "";

    try {
        const existing = await octokit.rest.repos.getContent({
            owner: "Programming-Club-Curtin-Colombo",
            repo: "audit-log",
            path
        });

        sha = existing.data.sha;
        if (existing.data.content) {
            existingContent = Buffer.from(existing.data.content, "base64").toString("utf-8");
        }
    } catch (e) {
        // file does not exist
    }

    const content = Buffer.from(
        existingContent + JSON.stringify(event) + "\n"
    ).toString("base64");

    try {
        await octokit.rest.repos.createOrUpdateFileContents({
            owner: "Programming-Club-Curtin-Colombo",
            repo: "audit-log",
            path,
            message: `audit(event): ${event.entity.type} ${event.entity.number || event.entity.branch}`,
            content,
            sha
        });
    } catch (e) {
        if (e.status === 404 || e.status === 403) {
            console.warn(`[AUDIT][REPO] Failed to write to audit-log repo (HTTP ${e.status}). If you are using the default GITHUB_TOKEN, it does not have cross-repository access. Please provide a Personal Access Token (PAT) with 'repo' scope to the github-token input.`);
        } else {
            console.error(`[AUDIT][REPO] Unexpected error writing to audit-log: ${e.message}`);
        }
    }
}

module.exports = { writeRepoAudit };