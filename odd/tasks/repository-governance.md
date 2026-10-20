# Repository PR and automatic release controls
Objective: prepare PR checks and automatic version-PR releases for github.com/luismarinoc/calc3d. Status: local implementation and independent correction recheck passed; saving local commits/evidence. Remote activation/publication not authorized.
Branch: feat/print3d-management; delivery_strategy=auto-chain, chain_strategy=feature-branch-chain, inherited user choice. Test runner: node --test tests/*.test.mjs; Playwright available. Risk: items 2 and 5 (repository guards, workflow permissions and CI/release environment).

## Specs

S1 — Target repository.
User: "Listo, crea un repositorio con el mismo nombre de la carpeta."
User selection: "Público".
Check: target is github.com/luismarinoc/calc3d, created by job-4 exit 0. Local project has no configured remote; do not infer another destination.

S2 — PR and release control.
User: "Necesito que este repositorio tenga control de PR y de release."
Check: prepare CI checks for the existing calculator's Node and browser tests, a PR template, and documented protected-main activation. Proposed baseline: PR required, required successful checks, no force-push/deletion; zero mandatory outside reviewers for solo maintenance unless user chooses otherwise. Do not silently require self-approval. Exact GitHub rules remain pending activation and fresh repository evidence.

S3 — Automatic releases.
User: "automatico"
Question answered: "¿releases manuales o automáticas al integrar una PR de versión?"
Check: only a merged version PR creates a versioned GitHub release, never an ordinary PR, an unmerged PR, the initial branch bootstrap, a no-version-change commit or a local test. Define an explicit documented version-PR convention; validate strict increasing stable semver and target the reviewed immutable commit. Repeating the same event must not duplicate/retarget a release. No npm package publication or application deployment is requested.

S4 — Authorization boundary and secrets.
Existing user instruction: "yo tengo una base datos , pero despues te paso los datos cuando ya esta ok todo"
Check: no production secrets needed for CI. Use GITHUB_TOKEN with minimum job-scoped permissions; no inline interpolation of untrusted PR text into shell; do not execute unmerged PR code with write permissions. Do not push local code, create/merge PRs, publish a release or mutate remote protections until specifically authorized. Repository read-only inspection is in scope. Do not claim prepared configuration is active.

S5 — Continuity.
User: "La idea de lo último que te pedí es que cuando yo te diga otra vez \"dame el plan de trabajo\", me lo des y que me digas qué está hecho y qué no está hecho, como una tabla."
Check: keep this document and its full Engram mirror under odd/repository-governance/tasks; expose prepared/verified/active differences in status. Main application roadmap stays at odd/tasks/print3d-management.md; this is a separate governance deliverable, not application completion.

## Tasks

T1 | S1-S5 | route: delegated/context backstop | status: done locally and independently verified | commit: efa7bda | Prepared CI, release guards/tests including equal-version success skip, PR template and activation guide; no remote activation. S1 target remains empty; S2-S4 prepared, not active; S5 status and evidence recorded; full mirror maintained by parent.
T2 | S2-S4 | route: independent gentle-ai-verify / Risk items 2,5 | status: done locally | commit: efa7bda | Independently verify workflow permissions, release eligibility/idempotency and local tests; parent spot check; no live release.
T3 | S5 | route: inline | status: in progress | commit: none | Record evidence, save verified local unit(s) in coherent commits and sync full document mirror. Forecast likely above advisory400; retain tests/docs and honest slice count, no publication.
T4 | S1-S4 | route: parent / remote activation | status: blocked | commit: none | Await explicit authorization to upload code/bootstrap a default branch and apply repository protections. Remote CI and releases cannot be claimed verified/active until actual approved activation. No initial release without an actual merged version PR.

## Log

L1 — User request, verbatim:
"Listo, crea un repositorio con el mismo nombre de la carpeta."

L2 — User repository visibility selection:
"Público"; gh repo create luismarinoc/calc3d --public --description "3D printing cost calculator and workshop management" job-4 exit0, URL https://github.com/luismarinoc/calc3d. No code uploaded.

L3 — User governance request, verbatim:
"Necesito que este repositorio tenga control de PR y de release."

L4 — User automatic release selection, verbatim:
"automatico"
Answered the choice between manual releases and automatic releases when a version PR is merged.

L5 — Local state and proposed technical boundaries:
Node24, npm12, Python3, Playwright devDependency and project-local Chromium/WebKit installed. App npm test15/15 and browser20/20 previously passed; no repeat claimed for this new unit. Branch feat/print3d-management, HEAD51afddf and no remote at last check. Local app commits: adf30f0 cost engine, 6279bf9 prototype, e5fd2b2 browser tooling, ea49d74 scope, 51afddf progress. Main application still lacks inventory/purchases/reports/auth/database. User controls what gets saved; no secrets in repository. No automatic PR creation/issue labeling workflow requested; do not add unrelated issue-approval ceremony.

L6 — Sources and technical direction:
GitHub official workflow event docs: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows ; branch protection REST: https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection ; release CLI: https://cli.github.com/manual/gh_release_create . gh release create without --target can create missing tags at latest default branch; always bind immutable reviewed target and validate any existing tag before publishing/retrying. Pull-request fork tokens are read-only; never introduce pull_request_target executing untrusted code. Prefer main push CI plus release eligibility tied to an associated merged version PR and increasing package version, suppress bootstrap when before is zeros. Worker may refine safe event design with evidence, not invent a release service requiring user PAT secrets. Metadata job-5 exited0: repository luismarinoc/calc3d is public and empty, defaultBranchRef.name is empty, viewerPermission ADMIN; Actions enabled with allowed_actions all. Main is a proposed new default branch, not an existing branch. There is no branch yet to protect; bootstrap/upload needs explicit authorization.

L7 — Resume:
Read this entire file and reconcile full Engram mirror plus current Git state. Delegate current T1 by reference, record exact commands/exits and unresolved proof; no claimed remote effects.

L8 — T1 local evidence (not remote verification):
Added pinned checkout v6 d23441a48e516b6c34aea4fa41551a30e30af803 and setup-node v6 249970729cb0ef3589644e2896645e5dc5ba9c38; read-only PR/main checks, release-only write token; stable Node tests and Browser tests. `node --test tests/release*.test.mjs tests/governance*.test.mjs` RED exit1 (ERR_MODULE_NOT_FOUND scripts/release.mjs, 0/1), GREEN exit0 9/9. `npm test` exit0 24/24 (original 15 preserved). `git diff --check` exit0. The release path verifies a main push, exact SHA, increasing stable version from before commit, unique associated merged same-repository version PR, and tag/release target; dry-run writes nothing. Local fake API tests only; workflow YAML/remote checks not run in Actions, and browser suite not repeated because app runtime and Playwright config unchanged. T2 independently verifies risk items 2,5. T4 requires separate consent for bootstrap/upload and protection mutation; parent owns full Engram mirror sync, work-unit commits and remote decisions. S1-S5 future remote checks remain pending until T4 authorization.

L9 — Parent spot check and independent verification started:
Parent read CI, release runner/tests and activation guide; npm test exit0 (24 passed, 0 failed/skipped) and git diff --check exit0. Assessment escalated Risk item2 (write-permission/release guard; item5 CI environment also applies), requires independent verifier; native capture unassessable due untracked files. Started gentle-ai-verify mvhaa5ao-7-td4j; includes investigation of ordinary main pushes with unchanged version failing rather than skipping. No extra browser run because app runtime and browser config unchanged. Await independent verdict before commit or activation.

L10 — T2 independent blocker and bounded correction:
Verifier mvhaa5ao-7-td4j ran npm test24/24, CLI help/invalid-option probes and isolated fake API cases; no remote writes. One blocker: ordinary non-bootstrap main push with valid equal versions throws Version must increase after one read/zero writes; release job runs on every such push. Required correction: valid equal versions return a successful read-only no-op; invalid/decreasing versions and all publication guards still reject. Reopen only T1 for this correction; T2 pending limited recheck of this blocker/direct regressions, not a new full review. Advisory only: no premerge version validation yet; no new gate requested. Verifier again used external scratch despite in-project request; parent will not access/delete it without consent. No live Actions/remote protection/release proof; T4 remains authorization-blocked. Mirror refreshed by parent with this status.

L11 — T1 bounded correction evidence (parent mirror sync pending):
`node --test tests/release-no-bump.test.mjs` RED exit1, 0/3 (ordinary and dry-run `Version must increase.`, injected executable exit1); after equality handling `node --test tests/release-no-bump.test.mjs tests/release.test.mjs` GREEN exit0, 10/10, and `npm test` exit0, 27/27. An equal valid version now returns exact `Version unchanged (1.0.0); no release` after one API read and zero writes for ordinary/dry-run; public injected command exit0, exact stdout with newline and empty stderr. Old CLI help/invalid tests and positive immutable-SHA publication tests passed unchanged; invalid/decreasing versions still fail. S3/S4 prepared locally, limited T2 blocker recheck pending; Risk items 2,5 not remotely verified. T4 remains blocked awaiting separate authorization, no commits/push/remote calls. Parent refreshes the full feature mirror.

L12 — Parent correction spot check and limited recheck:
Parent read tests/release-no-bump.test.mjs and equality placement after stable-semver validation. npm test exit0:27 passed,0 failed/skipped; git diff --check exit0. Started verifier continuation mvhaf54r-9-u4wc solely for original no-bump blocker/direct regressions; no new full review, extra browser run or remote action. T3 waits for verdict before local commit. Application and remote remain unchanged.

L13 — Limited recheck passed:
Verifier mvhaf54r-9-u4wc resolved original blocker locally. Focused node --test tests/release-no-bump.test.mjs tests/release.test.mjs exit0:10passed,0failed. Separate in-memory cases: valid2.0.0 equality ordinary/dry-run returned exact no-op after1read/0writes;2.0.0->1.9.9 rejected after1read/0writes; prerelease rejected before reads; eligible2.0.1 targeted supplied immutableSHA after4reads/1fakewrite. Event input unchanged. Previously verified guards unchanged; no new full sweep/live API/browser run. Verifier used external system scratch again; parent did not access/remove it. No local blocker remains; remote Actions/YAML execution/permissions/protection still unverified and T4 authorization-blocked. Parent updated README unit-test count15->27 (documentation only). Risk items2,5 independently verified for local preparation. Next: coherent local commit then scope/evidence commit, full Engram mirror, ask precise bootstrap/protection authorization.

L14 — Governance implementation saved locally:
Commit efa7bda, ci(governance): gate version releases on reviewed merges and passing checks, holds workflow, release runner, PR template, docs, version manifest/lock and12governance tests (382insertions/1deletion; 2lock lines generated). Risk items2,5 isolated in this coherent unit with tests/docs and independent verifier/recheck evidence. Parent git diff --cached --check exit0 before commit. Existing app15tests preserved, final npm suite27/27; browser suite not repeated because runtime/browser config unchanged. No secrets/cache/generated screenshots committed. No remote effects. T4 still blocked: user must authorize initial code upload/main creation and exact protection policy. Proposed policy: PR required including admins, required strict Node tests and Browser tests,0mandatory external approvals for solo owner, no force-push/deletion. Bootstrap publication contains the prototype and development docs; no first release will be generated. Update doc commit/evidence and mirror before asking.
