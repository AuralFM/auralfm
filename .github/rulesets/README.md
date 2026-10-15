# The rule for `main`

`main.json` is the branch rule, kept here so it is read and changed like code.
It is **not applied yet**: GitHub does not enforce rules on a private
repository on the free plan. It applies once the repository is public, or the
organisation is on a paid plan.

What it does:

- `main` cannot be deleted or force-pushed, and its history stays a straight line.
- A change reaches `main` through a pull request, with every comment resolved.
- The `audit` check must pass on the latest commit first.
- No approving review is required while there is one maintainer. With a
  second reviewer, set `required_approving_review_count` to 1 and turn on
  `require_code_owner_review`.

To apply it: Settings, Rules, Rulesets, New ruleset, Import a ruleset, and
choose this file. Or:

```bash
gh api repos/AuralFM/auralfm/rulesets --method POST --input .github/rulesets/main.json
```
