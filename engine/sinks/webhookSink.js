async function sendWebhook(event, { webhookUrl }) {
    if (!webhookUrl) {
        console.warn("[AUDIT][WEBHOOK] Webhook URL not configured — skipping.");
        return;
    }

    const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event)
    });

    if (!response.ok) {
        throw new Error(`Generic webhook failed: ${response.status} ${response.statusText}`);
    }
}

module.exports = { sendWebhook };