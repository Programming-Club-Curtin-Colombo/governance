const { toDiscordPayload } = require("../formatters/discordFormatter");

async function sendDiscord(event, { webhookUrl }) {
    if (!webhookUrl) {
        console.warn("[AUDIT][DISCORD] Webhook URL not configured — skipping.");
        return;
    }

    const payload = toDiscordPayload(event);

    const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
    }
}

module.exports = { sendDiscord };