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

    await octokit.rest.repos.createOrUpdateFileContents({
        owner: "Programming-Club-Curtin-Colombo",
        repo: "audit-log",
        path,
        message: `audit(event): ${event.entity.type} ${event.entity.number || event.entity.branch}`,
        content,
        sha
    });
}

module.exports = { writeRepoAudit };