# Todo

## Task 1: Email verification stalls
- [ ] Reproduce with `jane.smith` lead; confirm infinite retry in Temporal UI
- [x] Add retry policy + realistic timeout in `workflows.ts`
- [x] Map activity failure/timeout to a per-lead error in `/leads/verify-emails`; parallelise; close connection in `finally`
- [x] Frontend: spinner + per-lead error toast
- [x] Verify: batch with `jane.smith` returns in under ~15s with the error listed

## Task 2: CSV country codes
- [ ] Import all `docs/*.csv`; inspect preview, table and DB hex for country codes
- [x] Confirm cause (invalid codes vs encoding/BOM); note the result in the plan
- [x] Validate/normalise alpha-2 codes in `csvParser.ts`; show row errors in the preview; strip BOM; decode Windows-1252 fallback
- [x] Add parser tests
- [x] Verify: `cd frontend && pnpm test` (28 pass); all 5 files run through the parser
- [ ] Browser check: import all 5 files in the UI and confirm the Country column (not yet done)

## Checkpoint A: bugs fixed
- [ ] Tests pass, backend builds, both flows work manually, review before continuing

## Task 3: Lead fields
- [ ] 3A: Prisma migration + bulk import + `csvParser` + API types + table columns
- [ ] 3B: shared field registry; searchable grouped picker; generator handles numbers
- [ ] Verify: `pnpm test` (both), import `leads-ok-1.csv`, generate a message using all 3 fields

## Checkpoint B: fields shipped
- [ ] Migration applies cleanly on a fresh DB; end-to-end import → table → message works

## Task 4: Enrich phone
- [ ] curl the 3 providers; resolve Orion `companyWebsite` question
- [ ] 4a: `PhoneProvider` abstraction + 3 adapters + workflow + activities (timeout, 3x backoff, early stop); per-provider rate-limit queues
- [ ] 4b: status columns + migration; `POST /leads/enrich-phone` (202, idempotent workflowId); DB updates from activities
- [ ] 4c: Enrich menu item, status badges, polling
- [ ] Verify: workflow tests with mocked activities; double-trigger runs one workflow; UI updates live

## Checkpoint C: feature complete
- [ ] All acceptance criteria in `plan.md` met; keys in env, not source

## Task 5: IMPROVEMENTS.md
- [ ] Write prioritised improvements + phased roadmap using the seed list in `plan.md`
