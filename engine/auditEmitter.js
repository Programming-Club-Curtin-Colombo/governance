const { eventRouter } = require("./eventRouter");
/* test */

async function emitAuditEvent({ octokit, pr, config, payload }) {
    const event = {
        event: "pr.governance.result",
        eventVersion: "1.0",
        timestamp: new Date().toISOString(),
        repo: `${pr.base.repo.owner.login}/${pr.base.repo.name}`,
        pr: {
            number: pr.number,
            title: pr.title
        },
        ...payload
    };

    console.log("[GOVERNANCE][EVENT]", JSON.stringify(event, null, 2));

    await eventRouter(event, config, {
        octokit,
        webhookUrl: process.env.DISCORD_AUDIT_WEBHOOK_URL
    });

    return event;
}

module.exports = { emitAuditEvent };