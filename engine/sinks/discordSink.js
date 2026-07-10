const { toDiscordPayload } = require("../formatters/discordFormatter");

const fs = require("fs");

async function sendDiscord(event, { discordWebhookUrl }) {
    if (!discordWebhookUrl) {
        console.warn("[AUDIT][DISCORD] Webhook URL not configured — skipping.");
        return;
    }

    const payload = toDiscordPayload(event);

    const formData = new FormData();
    formData.append("payload_json", JSON.stringify(payload));

    if (event.archivePath && fs.existsSync(event.archivePath)) {
        const fileBuffer = fs.readFileSync(event.archivePath);
        const fileBlob = new Blob([fileBuffer]);
        formData.append("file[0]", fileBlob, "artifacts.tar.gz");
    }

    const response = await fetch(discordWebhookUrl, {
        method: "POST",
        body: formData
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Discord webhook failed: ${response.status} ${response.statusText} - ${text}`);
    }
}

module.exports = { sendDiscord };