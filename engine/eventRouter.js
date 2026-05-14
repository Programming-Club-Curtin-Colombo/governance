const { sendDiscord } = require("./sinks/discordSink");
const { writeRepoAudit } = require("./sinks/repoSink");
const { sendWebhook } = require("./sinks/webhookSink");

async function eventRouter(event, config, context) {
    const sinks = config?.audit?.sinks || {};

    if (sinks.discord) await sendDiscord(event, context);
    if (sinks.repo) await writeRepoAudit(event, context);
    if (sinks.webhook) await sendWebhook(event, context);
}

module.exports = { eventRouter };