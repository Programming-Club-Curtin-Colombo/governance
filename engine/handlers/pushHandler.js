const core = require("@actions/core");
const github = require("@actions/github");

function log(state, message) {
    console.log(
        `[GOVERNANCE][PUSH][${state.toUpperCase()}] ${message}`
    );
}

async function handlePush() {

    const payload =
        github.context.payload;

    const ref =
        payload.ref;

    const branch =
        ref.replace("refs/heads/", "");

    const pusher =
        payload.pusher?.name || "unknown";

    log("info", `Push detected on ${branch}`);
    log("info", `Pusher: ${pusher}`);

    const protectedBranches = [
        "main",
        "master"
    ];

    if (
        protectedBranches.includes(branch)
    ) {

        log(
            "approved",
            `Protected branch push validated`
        );

    } else {

        log(
            "info",
            `Non-protected branch push`
        );
    }

    core.setOutput("allowed", "true");
}

module.exports = {
    handlePush
};