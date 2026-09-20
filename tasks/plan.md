# Plan: TinyEnginy take-home

Scope: 2 bug fixes, lead-fields feature, Temporal enrich-phone, IMPROVEMENTS.md. (PR review is out of scope here.)
Stack: Express + Prisma/SQLite + Temporal worker in one process (`backend/src`), React + react-query + Tailwind (`frontend/src`). Tests: vitest on both sides.

## Order and rationale

| # | Task | Why here |
|---|------|----------|
| 1 | Bug: email verification stalls | Highest impact: one bad lead hangs the whole HTTP request forever. Backend-only. Sets the Temporal retry/timeout pattern that Task 4 reuses. |
| 2 | Bug: CSV country codes | Small, frontend-only, independent. Its parser changes are touched again in Task 3, so fix first. |
| 3 | Feature: lead fields | Schema migration is the foundation for Task 4 (writes `phone`). |
| 4 | Feature: enrich phone (4a/4b/4c) | Depends on Task 3 and on the Task 1 pattern. |
| 5 | IMPROVEMENTS.md | Written last, from what was seen while doing 1-4. |

Dependency graph: `1 → 4a`, `3 → 4b`, `2 → 3 (csvParser)`, `4a → 4b → 4c`, `all → 5`.

---

## Task 1: Email verification stalls

**Root cause (found in code):** `workflows.ts` gives `verifyEmail` a `startToCloseTimeout` of 1s and **no retry policy**, so Temporal's default is unlimited retries. `activities/utils.ts` sleeps 20s for `jane.smith*`, so every attempt times out and retries forever. `index.ts` `/leads/verify-emails` awaits `client.workflow.execute` inside a sequential loop, so the request never returns and later leads never run.
Secondary: `Connection` is not closed on the error path, `workflowId` uses `Date.now()` (not idempotent), and errors are reported only as a count.

**Investigate first:** Reproduce with the `jane.smith` lead and confirm in the Temporal UI (`localhost:8233`) that the activity is retrying with attempt count growing.

**Fix:**
- Set an explicit `retry` policy (3 attempts, exponential backoff) and a realistic timeout. Decide whether the 20s sleep is meant to be a slow-but-valid case or a failure to surface; the plan assumes surfacing a failure.
- Catch `ActivityFailure`/timeout and record a distinct outcome (`emailVerified = null` plus an error entry, not a hang).
- Run leads in parallel with `Promise.allSettled`, and close the connection in `finally`.
- Frontend: show a per-lead error toast and a spinner while verifying.

**Files:** `backend/src/workflows/workflows.ts`, `backend/src/index.ts`, `frontend/src/components/LeadsList.tsx`, `frontend/src/api/types/leads/verifyEmails.ts`.

**Acceptance criteria:**
- [ ] A batch containing `jane.smith` returns within a bounded time (under ~15s) with that lead in `errors[]` and the others verified.
- [ ] The UI shows a failure message naming the lead, not an endless spinner.
- [ ] No leaked Temporal connection on failure.

**Verify:** Manual repro before/after. Add a workflow test if `@temporalio/testing` is added (otherwise unit-test the error-mapping helper).

---

## Task 2: CSV country codes

**Root cause (confirmed at parser level):** The sample CSVs are clean ASCII/UTF-8 (`file -I`; only `leads-with-errors.csv` has non-ASCII, in names), Papa Parse already strips a BOM, and `readAsText` defaults to UTF-8, so a literal "garbled characters" defect is **not reproducible from the sample files**. The real defect is that `csvParser.ts` accepts any string as `countryCode`: `XXX` (x4) and `12` in `leads-with-errors.csv` were imported as-is, and the preview modal had no Country column, so users could not see them. `KI`, `TV` and `KP` are valid ISO codes (the earlier note that `KI` is invalid was wrong).
Encoding hardening is still worth having for Excel exports (Windows-1252), so it is included as a defensive fix rather than the root cause.

**Fix:** Validate against an ISO 3166-1 alpha-2 list and uppercase/trim. Show an error or warning on the row in the preview. Handle a BOM by stripping it. Fall back to Windows-1252 when UTF-8 decoding produces `�`.

**Files:** `frontend/src/utils/csvParser.ts`, `frontend/src/utils/csvParser.test.ts`, `frontend/src/components/CsvImportModal.tsx`, optionally `backend/src/index.ts` (`/leads/bulk`) to validate server-side too.

**Acceptance criteria:**
- [ ] Every sample file in `docs/` imports with valid alpha-2 codes shown correctly in the preview and table.
- [ ] Invalid codes (`XXX`, `12`) are flagged in the preview and are not stored as valid.
- [ ] BOM/non-UTF-8 input does not corrupt headers or values.

**Verify:** `cd frontend && pnpm test` (new parser cases), then manual import of all 5 sample files.

---

## Task 3: New lead fields (phone, years at company, LinkedIn)

**Root-cause / investigation:** Field lists are duplicated across `schema.prisma`, `index.ts` bulk import, `messageGenerator.ts`, `csvParser.ts`, `MessageTemplateModal.tsx` and the API types. Note that the sample CSVs already carry `yearsInRole` and `phoneNumber` columns while the README says "years at current company". Decide the header aliases (accept `yearsInRole`, `yearsAtCompany`, `phoneNumber`, `phone`, `linkedin`/`linkedinUrl`).

**Slice A: data + import + table**
- Prisma: `phone String?`, `yearsAtCompany Int?`, `linkedinUrl String?`, then `pnpm migrate:dev`.
- `/leads/bulk`, `csvParser` (parse int, validate LinkedIn URL), API types (`getMany`, `bulkImport`), `LeadsList` columns, CSV preview and helper text.

**Slice B: message composition that scales**
- Single source of truth for the field list (a shared registry with key, label and group), used by the backend generator and the modal.
- Replace the chip row with a searchable, grouped field picker (Personal / Company / Contact), plus `{` typeahead in the textarea.
- `messageGenerator.ts`: `String()` numeric values (`yearsAtCompany`), and guard `$` replacement patterns in values.

**Files:** Slice A: `backend/prisma/schema.prisma` (+ migration), `backend/src/index.ts`, `frontend/src/utils/csvParser.ts`, `frontend/src/api/types/leads/{getMany,bulkImport}.ts`, `frontend/src/components/{LeadsList,CsvImportModal}.tsx`.
Slice B: `backend/src/utils/messageGenerator.ts` (+ test), `frontend/src/components/MessageTemplateModal.tsx`.

**Acceptance criteria:**
- [ ] The three fields appear in the table and are set from CSV (both header variants).
- [ ] `{phone}`, `{yearsAtCompany}`, `{linkedinUrl}` render in generated messages; a missing value gives the existing per-lead error.
- [ ] Adding a fourth field means one registry entry, no UI layout change; the picker stays usable at 20+ fields.

**Verify:** `pnpm test` in both packages; `pnpm build` in backend; manual import of `docs/leads-ok-1.csv` and generating a message using all three fields.

---

## Task 4: Enrich phone (Temporal)

**Investigation / open inputs:**
- Orion needs `companyWebsite`, but leads only have `companyName`. Decide: derive a domain from the email, or skip Orion when there is no website and fall through.
- Astra returns `phoneNmbr` (may be undefined), Nimbus returns `number` as a **number** (loses `+` and leading zeros) plus `countryCode`; the Nimbus base URL contains the typo `numbusLookup`. Confirm against the live endpoints with curl before coding.
- Keys are given in plain text in the README, so put them in env config, not source.
- Check that `workflowIdConflictPolicy` is available in `@temporalio/client` 1.13.

### 4a: Workflow + provider abstraction (backend core)
- `PhoneProvider` interface (`name`, `buildRequest(lead)`, `parseResponse(res) → string | null`, `canHandle(lead)`); three adapters normalise auth (header / header / query param) and response shapes.
- `enrichPhoneWorkflow(leadId)`: sequential providers, stop on first hit. Each call is an activity with a short `startToCloseTimeout` and retry (3 attempts, exponential backoff).
- Nice-to-have (rate limits): run each provider's activity on its own task queue with `maxTaskQueueActivitiesPerSecond` set per worker, so limits are config, not code.
- **Files:** `backend/src/workflows/enrichPhone.ts` (new), `backend/src/workflows/activities/phoneProviders/*` (new), `workflows/index.ts`, `worker.ts`.

### 4b: API + status persistence
- Prisma: `phoneStatus` (`pending | running | found | not_found | failed`) and `phoneProvider` on lead.
- `POST /leads/enrich-phone`: starts workflows and returns immediately with 202. Idempotent via `workflowId = enrich-phone-<leadId>` with a conflict policy of use-existing.
- An activity writes the status/phone to the DB at each step.
- **Files:** `backend/prisma/schema.prisma` (+ migration), `backend/src/index.ts`, `backend/src/workflows/activities/*`.

### 4c: Frontend feedback
- "Enrich phone" item in the Enrich menu; API module and types.
- Status badge per lead (running / found from X / no data found / failed); poll `getMany` with `refetchInterval` while any lead is running.
- **Files:** `frontend/src/components/LeadsList.tsx`, `frontend/src/api/modules/leads.ts`, `frontend/src/api/types/leads/enrichPhone.ts` (new), `getMany.ts`.

**Acceptance criteria:**
- [ ] A provider returning a phone stops the chain; later providers are not called (assert in a test).
- [ ] All three empty gives "No data found"; a provider outage retries 3x with backoff and then falls through or marks failed (decide and document).
- [ ] Triggering enrich twice for the same lead runs one workflow.
- [ ] The UI shows live status per lead without a page reload and the request does not block.
- [ ] Provider keys are read from env.

**Verify:** Workflow tests with mocked activities (`@temporalio/testing`), adapter unit tests with fixture responses, then a manual run against the live providers with the Temporal UI open.

---

## Task 5: IMPROVEMENTS.md

Write it as a project-management document (context, prioritised list, effort, risk, roadmap).
Seed list from findings so far:
- **Correctness:** frontend `update` uses PUT but the backend route is PATCH; `PATCH /leads/:id` stringifies undefined (`String(undefined)`); bulk import dedupes by first+last name only and runs an N-query create loop.
- **Infra:** `.env.sample` says MySQL but the datasource is SQLite; the API and the Temporal worker share one process; Temporal address, port and CORS `*` are hardcoded; untracked `pnpm-workspace.yaml` files.
- **Quality:** no request validation (zod), no auth, no pagination on `GET /leads`, no CI, thin test coverage, duplicated field lists, no error/observability layer.
- **Roadmap:** now (bug fixes, validation, CI), next (async jobs UI, provider rate limits, pagination), later (auth/multi-tenant, Postgres, observability).

**Acceptance criteria:**
- [ ] Each item has impact, effort and a rationale; the roadmap is phased.
- [ ] Items reference the actual files or behaviours found above, not generic advice.

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Country-code bug can't be reproduced from the sample files | Med | Timebox the repro to 10 min; fall back to validation and encoding hardening and say so |
| Live provider behaviour differs from the README | Med | curl each provider before writing adapters |
| Orion needs `companyWebsite`, which the lead model lacks | Med | Fall through with `canHandle`; raise as an open question |
| `workflowIdConflictPolicy` unavailable in SDK 1.13 | Low | Use a fixed workflowId plus `WorkflowIdReusePolicy`, or catch `WorkflowExecutionAlreadyStartedError` |
| Time (~1h expected) | High | Ship in order; 4c and Task 5 are the first to trim |

## Open questions
1. Is the 20s `jane.smith` delay meant to surface as a failure, or should verification wait long enough to succeed?
2. When a provider errors after retries, fall through to the next provider or mark the lead failed?
3. Header naming: `yearsInRole` (sample CSVs) vs `yearsAtCompany` (README). The plan accepts both.
