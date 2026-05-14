function classifyPR(pr) {
    const files = pr?.files?.map(f => f.filename) || [];
    const title = (pr?.title || "").toLowerCase();
    const body = (pr?.body || "").toLowerCase();

    const allText = `${title} ${body}`;

    const infraPatterns = [
        ".github/",
        "dockerfile",
        "docker-compose",
        "ci",
        "workflow",
        "package.json",
        "package-lock.json"
    ];

    if (files.some(f => infraPatterns.some(p => f.toLowerCase().includes(p)))) {
        return "infra";
    }

    if (files.length > 0 && files.every(f => f.endsWith(".md") || f.includes("docs/"))) {
        return "docs";
    }

    if (allText.includes("readme") || allText.includes("documentation")) {
        return "docs";
    }

    const bugKeywords = ["fix", "bug", "error", "issue", "crash", "broken"];

    if (bugKeywords.some(k => allText.includes(k))) {
        return "bug";
    }

    return "feature";
}

module.exports = { classifyPR };