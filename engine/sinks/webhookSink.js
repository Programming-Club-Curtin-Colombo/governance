async function sendWebhook(event, { governanceWebhookUrl }) {
    if (!governanceWebhookUrl) {
        console.warn("[AUDIT][WEBHOOK] Webhook URL not configured — skipping.");
        return;
    }

    const response = await fetch(governanceWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event)
    });

    if (!response.ok) {
        throw new Error(`Generic webhook failed: ${response.status} ${response.statusText}`);
    }
}

module.exports = { sendWebhook };