const CO_AUTHOR_PATTERN = /^Co-authored-by:\s*(.+?)\s*<([^>]+)>/gim;

/**
 * Parses `Co-authored-by: Name <email>` trailers out of a raw commit message.
 *
 * @param {string} message
 * @returns {Array<{ name: string, email: string }>}
 */
function parseCoAuthors(message) {
    const coAuthors = [];
    let match;

    CO_AUTHOR_PATTERN.lastIndex = 0;

    while ((match = CO_AUTHOR_PATTERN.exec(message)) !== null) {
        coAuthors.push({ name: match[1].trim(), email: match[2].trim() });
    }

    return coAuthors;
}

/**
 * Merges a contributor into the deduplicated author roster.
 * Keyed by email — each unique email appears exactly once.
 *
 * @param {Map<string, object>} roster
 * @param {{ email: string, login: string|null, name: string|null, role: string }} contributor
 * @param {string} sha - Short commit hash this contributor appears in
 */
function mergeIntoRoster(roster, contributor, sha) {
    const { email, login, name, role } = contributor;
    if (!email) return;

    if (roster.has(email)) {
        const entry = roster.get(email);
        if (!entry.commits.includes(sha)) {
            entry.commits.push(sha);
        }
        // Prefer a real login over null
        if (!entry.login && login) entry.login = login;
        if (!entry.name  && name)  entry.name  = name;
    } else {
        roster.set(email, {
            email,
            login:   login  || null,
            name:    name   || null,
            role,
            commits: [sha]
        });
    }
}

/**
 * Fetches all commits on a pull request, extracts per-commit author and
 * co-author data, and builds a deduplicated Author Roster.
 *
 * @param {import("@octokit/rest").Octokit} octokit
 * @param {{ number: number }}              pr
 * @param {{ roles: { maintainers: string[] } }} config
 * @param {string}                          owner
 * @param {string}                          repo
 * @returns {Promise<{
 *   commits: Array<{
 *     sha:       string,
 *     message:   string,
 *     author:    { login: string|null, email: string|null },
 *     coAuthors: Array<{ name: string, email: string }>
 *   }>,
 *   authors: Array<{
 *     email:   string,
 *     login:   string|null,
 *     name:    string|null,
 *     role:    string,
 *     commits: string[]
 *   }>
 * }>}
 */
async function auditPRCommits(octokit, pr, config, owner, repo) {
    const maintainers = config?.roles?.maintainers || [];

    const { data: rawCommits } = await octokit.rest.pulls.listCommits({
        owner,
        repo,
        pull_number: pr.number,
        per_page:    100
    });

    const roster  = new Map();
    const commits = [];

    for (const raw of rawCommits) {
        const sha     = raw.sha.substring(0, 7);
        const message = raw.commit.message || "";
        const subject = message.split("\n")[0].trim();

        const authorLogin = raw.author?.login  || null;
        const authorEmail = raw.commit.author?.email || null;
        const authorName  = raw.commit.author?.name  || null;
        const coAuthors   = parseCoAuthors(message);

        const authorRole = maintainers.includes(authorLogin)
            ? "maintainer"
            : "contributor";

        commits.push({
            sha,
            message:  subject,
            author:   { login: authorLogin, email: authorEmail, name: authorName },
            coAuthors
        });

        mergeIntoRoster(roster, {
            email: authorEmail,
            login: authorLogin,
            name:  authorName,
            role:  authorRole
        }, sha);

        for (const ca of coAuthors) {
            mergeIntoRoster(roster, {
                email: ca.email,
                login: null,
                name:  ca.name,
                role:  "co-author"
            }, sha);
        }
    }

    return {
        commits,
        authors: Array.from(roster.values())
    };
}

/**
 * Parses co-authors from push webhook commit messages (no API call needed).
 * Returns per-commit records and a deduplicated author roster.
 *
 * @param {Array<{ id: string, message: string, author: { name: string, email: string } }>} webhookCommits
 * @param {string[]} maintainers
 * @returns {{
 *   commits: Array<{ sha: string, message: string, author: object, coAuthors: object[] }>,
 *   authors: Array<object>
 * }}
 */
function auditPushCommits(webhookCommits, maintainers = []) {
    const roster  = new Map();
    const commits = [];

    for (const raw of webhookCommits) {
        const sha       = (raw.id || "").substring(0, 7);
        const message   = raw.message || "";
        const subject   = message.split("\n")[0].trim();
        const coAuthors = parseCoAuthors(message);

        const authorEmail = raw.author?.email || null;
        const authorName  = raw.author?.name  || null;

        commits.push({
            sha,
            message:  subject,
            author:   { login: null, name: authorName, email: authorEmail },
            coAuthors
        });

        mergeIntoRoster(roster, {
            email: authorEmail,
            login: null,
            name:  authorName,
            role:  "contributor"
        }, sha);

        for (const ca of coAuthors) {
            mergeIntoRoster(roster, {
                email: ca.email,
                login: null,
                name:  ca.name,
                role:  "co-author"
            }, sha);
        }
    }

    return {
        commits,
        authors: Array.from(roster.values())
    };
}

module.exports = { auditPRCommits, auditPushCommits, parseCoAuthors };
