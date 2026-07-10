function toDiscordPayload(event) {
    const color = event.allowed ? 0x2ecc71 : 0xe74c3c;
    const statusEmoji = event.allowed ? "✅ APPROVED" : "❌ BLOCKED";
    const embeds = [];

    // ── Main Embed ───────────────────────────────────────────────────────────
    let mainTitle = `Governance — ${statusEmoji}`;
    let mainDesc = "Unknown event";

    if (event.entity?.type === "pull_request") {
        mainTitle = `PR #${event.entity.number} — ${statusEmoji}`;
        mainDesc = event.entity.title || "No title";
    } else if (event.entity?.type === "push") {
        mainTitle = `Push to ${event.entity.branch} — ${statusEmoji}`;
        mainDesc = `Push by ${event.user}`;
    }

    const mainFields = [
        { name: "User", value: event.user, inline: true },
        { name: "Role", value: event.role, inline: true },
        { name: "Type", value: event.type, inline: true },
        { name: "Reason", value: event.reason || "N/A" },
        { name: "Repository", value: event.repo }
    ];

    if (event.authors && event.authors.length > 0) {
        const authorList = event.authors.map(a => {
            const identity = a.login ? `@${a.login}` : (a.name || "unknown");
            return `${identity} <${a.email || "no-email"}> - ${a.role}`;
        }).join("\n");
        mainFields.push({ name: "Author Roster", value: authorList.substring(0, 1024) });
    }

    embeds.push({
        title: mainTitle,
        description: mainDesc.substring(0, 4096),
        color,
        fields: mainFields,
        footer: { text: `Policy v${event.policyVersion || "unknown"}` },
        timestamp: event.timestamp
    });

    // ── Commits Embed ────────────────────────────────────────────────────────
    if (event.commits && event.commits.length > 0) {
        const commitList = event.commits.map(c => {
            const author = c.author?.login ? `@${c.author.login}` : (c.author?.name || "unknown");
            const coAuthors = c.coAuthors?.length ? ` (Co: ${c.coAuthors.map(ca => ca.name).join(", ")})` : "";
            return `\`${c.sha || c.id}\` ${c.message} - ${author}${coAuthors}`;
        }).join("\n");

        embeds.push({
            title: `📋 Commit Audit (${event.commits.length} commits)`,
            description: commitList.substring(0, 4096),
            color: 0x3498db
        });
    }

    // ── CI Job Results Embed ─────────────────────────────────────────────────
    if (event.ciStatuses) {
        const ciDesc = Object.entries(event.ciStatuses).map(([job, status]) => {
            const icon = status === "true" || status === "passed" ? "✅" : (status ? "❌" : "➖");
            return `${icon} **${job}**`;
        }).join("\n");

        embeds.push({
            title: "⚙️ CI Job Statuses",
            description: ciDesc.substring(0, 4096),
            color: 0x9b59b6
        });
    }

    // ── Artifact Prober Embed ────────────────────────────────────────────────
    if (event.artifactReport) {
        let artifactDesc = "";
        
        if (event.artifactReport.found && event.artifactReport.found.length > 0) {
            artifactDesc += "**Found Artifacts:**\n" + event.artifactReport.found.map(a => `✅ \`${a.filename}\` (${a.archiveCategory})`).join("\n") + "\n\n";
        }
        
        if (event.artifactReport.missing && event.artifactReport.missing.length > 0) {
            artifactDesc += "**Missing Artifacts:**\n" + event.artifactReport.missing.map(a => `❌ \`${a.stage}\` candidates (${a.candidates.join(", ")})`).join("\n") + "\n\n";
        }

        if (event.artifactReport.warnings && event.artifactReport.warnings.length > 0) {
            artifactDesc += "**Warnings:**\n" + event.artifactReport.warnings.map(w => `⚠️ ${w}`).join("\n");
        }

        if (artifactDesc) {
            embeds.push({
                title: "📦 Artifact Prober Report",
                description: artifactDesc.substring(0, 4096),
                color: 0xe67e22
            });
        }
    }

    return {
        username: "Governance Bot",
        embeds
    };
}

module.exports = { toDiscordPayload };