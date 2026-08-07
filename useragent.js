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
 * The URL is the organisation page, not a personal profile and not the
 * application repository. This matters twice over. A GitHub organisation's
 * profile README renders publicly even while every repository inside it is
 * private, so operators get a real destination without the source being opened.
 * And the name reaching hundreds of strangers' machines should be the
 * project's rather than one person's.
 *
 * It previously carried `github.com/meltonbell3/auralfm`, which returns 404 to
 * anyone who is not the maintainer. **A contact link that does not resolve is
 * worse than no contact link** — an operator who follows it and lands on a 404
 * concludes the software is hiding, which is the opposite of the point. If the
 * organisation page ever stops resolving, remove this rather than leave it.
 */
const { version } = require("../package.json");

const UA = `AuralFM/${version} (+https://github.com/auralfm)`;

module.exports = { UA };
