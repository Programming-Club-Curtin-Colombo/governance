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
            .map(c => `\`${c.id}\` ${c.message}`)
            .join("\n");
            
        description = commitList || `Commits: ${event.commitCount || 0}`;
    }

    return {
        username: "Governance Bot",
        embeds: [
            {
                title,
                description,
                color,

                fields: [
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
                ],

                footer: {
                    text: `Policy v${event.policyVersion || "unknown"}`
                },

                timestamp: event.timestamp
            }
        ]
    };
}

module.exports = { toDiscordPayload };