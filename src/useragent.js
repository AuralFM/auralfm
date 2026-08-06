/**
 * How AuralFM identifies itself to every server it touches.
 *
 * One definition, because it was seven, and seven copies of a contact address
 * is seven places to miss when the address changes.
 *
 * **It identifies the app, never the person using it.** That distinction is the
 * whole reason this is safe to send. A KiwiSDR operator reading their own logs
 * learns that some copy of AuralFM connected — not who, not where, not what they
 * listened to, and not that the same person came back. There is no account and
 * no persistent key, so there is nothing here to join sessions together with.
 * The header is a return address for the project, not a fingerprint for a user.
 *
 * There is deliberately no URL in it yet. It used to carry
 * `https://github.com/meltonbell3/auralfm`, which returns 404 to anyone who is
 * not the maintainer, because the repository is private. **A contact link that
 * does not resolve is worse than no contact link**: an operator who follows it
 * and lands on a 404 concludes the software is hiding, which is the opposite of
 * what the header exists to do.
 *
 * Put the URL back the moment one resolves publicly — a domain, or a public
 * organisation page. Not a personal profile: the name in a User-Agent reaching
 * hundreds of strangers' machines should be the project's, not one person's.
 */
const { version } = require("../package.json");

const UA = `AuralFM/${version}`;

module.exports = { UA };
