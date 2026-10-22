# The rule for `main`

`main.json` is the branch rule, kept here so it is read and changed like code.
It is applied to this repository (ruleset `main`, id 25677610) since the
repository became public. A change to the rule is a change to this file,
then the same import again (below), so the file and GitHub never disagree.

What it does:

- `main` cannot be deleted or force-pushed, and its history stays a straight line.
- A change reaches `main` through a pull request, with every comment resolved.
- The `audit` check must pass on the latest commit first.
- No approving review is required while there is one maintainer. With a
  second reviewer, set `required_approving_review_count` to 1 and turn on
  `require_code_owner_review`.

To apply a changed file: Settings, Rules, Rulesets, the `main` ruleset, and
import this file over it. Or:

```bash
gh api repos/AuralFM/auralfm/rulesets/25677610 --method PUT --input .github/rulesets/main.json
```

With `required_linear_history`, a pull request is merged by squash or rebase;
a merge commit is refused.
