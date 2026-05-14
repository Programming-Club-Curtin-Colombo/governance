const { eventRouter } = require("./eventRouter");

async function emitAuditEvent({ octokit, entity, repo, config, payload }) {
    const event = {
        event: "governance.result",
        eventVersion: "2.0",
        timestamp: new Date().toISOString(),
        repo,
        entity,
        ...payload
    };

    console.log("[GOVERNANCE][EVENT]", JSON.stringify(event, null, 2));

    await eventRouter(event, config, {
        octokit,
        discordWebhookUrl: process.env.DISCORD_AUDIT_WEBHOOK_URL,
        governanceWebhookUrl: process.env.GOVERNANCE_WEBHOOK_URL
    });

    return event;
}

module.exports = { emitAuditEvent };