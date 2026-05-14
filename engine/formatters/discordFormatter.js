function toDiscordPayload(event) {
    const color =
        event.allowed ? 0x2ecc71 : 0xe74c3c;

    const statusEmoji =
        event.allowed ? "✅ APPROVED" : "❌ BLOCKED";

    return {
        username: "Governance Bot",
        embeds: [
            {
                title: `PR #${event.pr.number} — ${statusEmoji}`,
                description: event.pr.title,
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