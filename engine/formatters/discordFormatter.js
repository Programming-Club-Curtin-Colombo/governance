function toDiscordPayload(event) {
    const color =
        event.allowed ? 0x2ecc71 : 0xe74c3c;

    const statusEmoji =
        event.allowed ? "✅ APPROVED" : "❌ BLOCKED";

    let title = `Governance — ${statusEmoji}`;
    let description = "Unknown event";

    if (event.entity?.type === "pull_request") {
        title = `PR #${event.entity.number} — ${statusEmoji}`;
        description = event.entity.title || "No title";
    } else if (event.entity?.type === "push") {
        title = `Push to ${event.entity.branch} — ${statusEmoji}`;
        
        const commitList = (event.commits || [])
            .map(c => {
                const author = c.author?.login ? `@${c.author.login}` : (c.author?.name || "unknown");
                const coAuthors = c.coAuthors?.length ? ` (Co: ${c.coAuthors.map(ca => ca.name).join(", ")})` : "";
                return `\`${c.sha || c.id}\` ${c.message} - ${author}${coAuthors}`;
            })
            .join("\n");
            
        description = commitList || `Commits: ${event.commitCount || 0}`;
    }

    const fields = [
        {
            name: "User",
            value: event.user,
            inline: true
        },
        {
            name: "Role",
            value: event.role,
            inline: true
        },
        {
            name: "Type",
            value: event.type,
            inline: true
        },
        {
            name: "Reason",
            value: event.reason || "N/A"
        },
        {
            name: "Repository",
            value: event.repo
        }
    ];

    if (event.authors && event.authors.length > 0) {
        const authorList = event.authors.map(a => {
            const identity = a.login ? `@${a.login}` : (a.name || "unknown");
            return `${identity} <${a.email || "no-email"}> - ${a.role}`;
        }).join("\n");
        
        fields.push({
            name: "Author Roster",
            value: authorList.substring(0, 1024)
        });
    }

    return {
        username: "Governance Bot",
        embeds: [
            {
                title,
                description: description.substring(0, 4096),
                color,
                fields,
                footer: {
                    text: `Policy v${event.policyVersion || "unknown"}`
                },
                timestamp: event.timestamp
            }
        ]
    };
}

module.exports = { toDiscordPayload };