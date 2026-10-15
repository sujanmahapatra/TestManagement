# Test Case Generator

Expands a short note about a UI component into a structured test case
(title, preconditions, numbered steps, expected results, target
environments) and files it in Jira, Confluence, Azure DevOps, TFS, or an
Excel workbook.

```
┌─────────────┐  /api/create-test-case  ┌──────────────┐   adapters    ┌──────────────┐
│ React + MUI │ ──────────────────────► │ Express      │ ────────────► │ Jira         │
│ (web/)      │ ◄────────────────────── │ (server/)    │               │ Confluence   │
└─────────────┘  { success, items[] }    └──────────────┘               │ Azure DevOps │
                                         tokens in memory              │ TFS          │
                                                                       │ Excel        │
                                                                       └──────────────┘
```

The browser never sees a token. Only the Express service holds credentials,
and Atlassian access/refresh tokens live in process memory — never on disk.

## Two modes

`APP_MODE` picks what the app is:

- **`management`** (default) — test management with an AI generator:
  projects (each with its own folders, test cases and TC numbering), a test
  case list with search, filters and columns, and **Generate with AI**, which
  adds approved cases to a folder. Saved cases export to Jira, Azure DevOps or
  Excel. **Review duplicates** (beside the new-folder button) compares the
  folder's or project's cases, has the AI verify which really test the same
  thing, and lets you choose which to keep before removing the rest.
- **`generator`** — only the AI generator, as the whole screen. The same view
  is always at **`/generator`** (for example
  `https://your-app.onrender.com/generator`), whatever `APP_MODE` is. There are no
  projects, folders or saved list; approved cases are exported straight to
  Excel, Jira or Azure DevOps (the **Export to** choice beside **Export**),
  and the agent does not scan saved cases.

## Generating

A note expands into **one or more** test cases. Three options multiply or
reshape what comes out:

| Option | Effect |
| --- | --- |
| `testType` | `smoke` trims to the critical path; `regression` adds the platform checks; `negative` asserts on error handling; `boundary` adds limit steps and limit assertions. |
| `negativeVariants` | Derives one extra case per configured failure mode — invalid input, interrupted, backend failure. Always on for `testType: negative`. |
| `parameters` | A data table. Each row becomes its own case, with `{{column}}` substituted in the name, description and expected result. |

They compose: 3 data rows with variants on produces 12 cases (3 × (1 happy
path + 3 variants)), filed as 12 issues or as one workbook with 12 sheets.

Platforms, test types and the variant catalogue live in
`server/config/generation.json` — not in code. Edit that file to retune the
boilerplate or add a platform; `GENERATION_CONFIG_PATH` points at your own
file instead. The UI reads them from `/api/options`, so nothing in the
front-end needs to change.

### Importing requirements

Instead of typing one note, switch the form to **Import requirements** and
read them from a document you already have. Paste it or load a text file,
choose what kind of document it is, and **Extract requirements**. Every item
found is listed and ticked. Untick the ones you don't want, then preview or
create as usual.

| Source | What becomes one requirement |
| --- | --- |
| Test plan document | Each section under a heading. Planning sections (Scope, Schedule, Risks, Entry/Exit criteria, …) are skipped, and a "Features to be tested" bullet list gives one requirement per bullet. |
| Requirements document | Each ID-prefixed line (`REQ-12`, `FR-3.1`). With no IDs, each "shall" / "must" / "should" sentence. |
| Backlog / issue tracker | Each row of a Jira or Azure DevOps CSV export, or each pasted story (`PROJ-123 …`, `As a … I want …`). |
| Existing test suite / acceptance criteria | Each Gherkin `Scenario` (`Given` becomes setup steps, `Then` the expected result, and each `Examples` row of an outline its own requirement), each row of a test-case CSV, or each ID-prefixed case. |

Lines after an `Expected:`, `Acceptance criteria:` or `Then` label become
the expected result. Everything else becomes the steps. An ID is placed at
the front of the test-case title (`[Web] REQ-12 …`), so every case traces
back to its requirement.

Every requirement is generated with the shared options (platform, test type,
failure cases, parameters). One batch may produce up to 100 cases, and an
over-limit batch is refused before anything is generated. Parsing is
deterministic and runs on the server: no network call and no model. In
`GENERATOR=llm` mode, each selected requirement is then sent to Claude like a
typed note. Supported inputs are plain text, Markdown, `.feature` and CSV
(comma, semicolon or tab), up to 100,000 characters and 50 requirements.
Convert `.docx`, `.pdf` and `.xlsx` files to text or CSV before importing them.

### AI test case agent

The **ai agent** tab works like BrowserStack's Test Case Generator agent.
Instead of expanding one note, it reads a requirement and decides what to
test.

1. **Describe and add requirements.** Type a user story, acceptance criteria
   or part of a PRD. **+ Add requirements** then offers:
   - **Upload files**, up to 5: PDF and Word `.docx` (25 MB), PowerPoint
     `.pptx` and Excel `.xlsx` (10 MB), PNG/JPEG/GIF/WebP screenshots and
     mockups (5 MB), and text, Markdown or CSV (1 MB). Claude reads PDFs and
     images directly. The server converts Office files to text, keeping
     headings, list items, table rows, slide order and one CSV block per
     sheet. Older `.doc`/`.ppt`/`.xls` files must be re-saved first.
   - **Jira issue:** keys or links (up to 10). Fetches the summary,
     description, any acceptance-criteria field, subtasks, and up to 3
     image or PDF attachments per issue.
   - **Confluence page:** a page link or id. Fetches the page text.
   - **Azure DevOps work item:** ids (`123, 456`, `#123`) or work item links
     (up to 10). Fetches the title, type, state, description, acceptance
     criteria, repro steps, child items, and up to 3 image or PDF attachments.
   - **Figma design:** a link to a frame renders that frame. A link to a page
     or section renders up to 10 frames inside it.

   Each one appears in the attachment list, labelled with where it came from,
   and can be removed before generating. Jira and Confluence use the same
   Atlassian connection as filing, and need `jira` or `confluence` in
   `DESTINATIONS`. Confluence import adds the `read:confluence-content.all`
   scope, so an existing session must reconnect once. Azure DevOps needs
   `ADO_ORG_URL` and `ADO_PAT` (a PAT with **Work Items: Read**); it does not
   need `ado` in `DESTINATIONS` or a project. Figma needs `FIGMA_TOKEN`.
2. **Settings.** Format: *test cases (steps)*, with an expected result per
   step; *test cases (text)*; or *BDD (Gherkin)*. Optionally limit the types
   (Functional, UI/UX, Security, Performance, Compatibility, Accessibility)
   and fix a priority, or let the agent choose one per case.
3. **Generate.** Progress streams live: *Analyze your requirement → Scan for
   context → Generate a summary → Write test cases*. **Stop** cancels the
   model call.
4. **Review.** You get a summary, the assumptions the agent made, and the
   cases grouped by scenario. Every case starts selected. Filter by priority
   or type, open **Source** to see the excerpt a case came from, or **View**
   to edit it (with the payload view of what the destination would receive).
5. **Refine and add test cases.** Ask in plain language: "add edge cases for
   the discount field", "remove negative cases", "merge overlapping cases".
   If only some cases are selected, the instruction applies to those alone and
   the rest stay exactly as they are. Changed cases are marked *new* or
   *edited*, **Show changes only** filters to them, and the agent says what it
   changed and what it removed. Cases left unchanged keep your manual edits.
6. **Add.** Files the selected cases to the chosen destination exactly as
   reviewed: one issue or work item per case, or one sheet per case in Excel.

Agent cases carry `priority`, `category`, `scenario`, `tags`, `description`
and `stepResults` (one expected result per step). Every exporter uses them:

- **Azure DevOps and TFS:** each step's expected result goes in its own row
  of the Steps grid, and priority maps to `Microsoft.VSTS.Common.Priority`
  (1–4).
- **Excel:** expected results go in the per-step column.
- **Jira and Confluence:** each step is followed inline by its expected
  result.

The agent is on whenever `ANTHROPIC_API_KEY` is set, whatever `GENERATOR`
is set to, and uses `GENERATOR_MODEL` (default `claude-opus-5-5`) at
`AGENT_EFFORT` (default `high`). Requests use structured outputs, so the
answer always parses into cases. The server-side refusal fallback is enabled,
and refinements re-read the attachments from the prompt cache. Like
`GENERATOR=llm`, it sends the requirement and attachments to Anthropic's API.

**DeepSeek or another Anthropic-compatible endpoint.** Set
`ANTHROPIC_BASE_URL` (for DeepSeek, `https://api.deepseek.com/anthropic`),
put that provider's key in `ANTHROPIC_API_KEY`, and set `GENERATOR_MODEL`
(for DeepSeek, `deepseek-v4-pro`). The agent then uses only what compatible
endpoints accept:

- PDFs, Word, PowerPoint and Excel files are converted to text on the server.
  A scanned PDF with no text layer is refused; attach its pages as images
  instead.
- The suite comes back through one required tool call and is validated on
  arrival, instead of through structured outputs.
- The refusal fallback, effort and prompt caching are not sent.

Requirements and attachments then go to that provider instead of Anthropic.

**Free and hosted: Groq.** Set `GROQ_API_KEY` (from console.groq.com) and,
optionally, `GROQ_MODEL` (default `openai/gpt-oss-120b`). While it is set,
the agent uses Groq's OpenAI-style API instead of the Anthropic settings.
A suite comes back in seconds:

- GPT-OSS and Qwen 3.8 models are held to the suite's JSON schema with
  strict mode. Other models get JSON mode, with the shape given in the prompt.
- Groq's JSON modes do not stream, so progress shows the stages but no
  drafted count.
- The free tier allows about 8,000 tokens a minute, so the output budget
  defaults to 6,000. A long PRD may need generating a section at a time, and
  the error says so.
- These models are text-only, so screenshots and Figma frames are refused
  with an explanation.

**Free and local: Ollama.** Ollama serves the same API on this machine, at no
cost and with nothing leaving it:

```bash
ollama pull qwen2.5:7b
# Ollama's default 4,096-token window is too small for a full suite:
printf 'FROM qwen2.5:7b\nPARAMETER num_ctx 16384\n' > Modelfile
ollama create qwen2.5-testgen -f Modelfile
```

```bash
ANTHROPIC_API_KEY=ollama            # required by the SDK, ignored by Ollama
ANTHROPIC_BASE_URL=http://localhost:11434
GENERATOR_MODEL=qwen2.5-testgen
AGENT_MAX_TOKENS=12000              # must fit inside num_ctx with the prompt
```

For a localhost URL, the agent doesn't force the tool call, which Ollama does
not support. It asks for the tool in the instructions instead, waits up to an
hour, and doesn't retry. Expect it to be slow on a CPU (a few tokens a
second, so a suite takes minutes) and less thorough than a hosted model. A
text-only model such as qwen2.5 cannot read screenshots.

### Review and edit before filing

**Preview & edit** generates without filing. Every line is editable — steps
reorder, add and delete — and submitting then sends those cases verbatim
rather than regenerating, so what was reviewed is exactly what lands in the
tracker. The edited payload is still re-validated field by field server-side;
nothing is trusted merely because the generator first produced it.

### Template or LLM

`GENERATOR=template` (default) expands deterministically from the config
file: same input, same cases, no network call, no user content leaving the
deployment. `GENERATOR=llm` has Claude write the prose instead — richer,
more specific steps for a vague note.

The LLM writes **only** the body of the happy-path case. Titles, parameter
expansion, variants and every tracker payload stay in deterministic code, so
the structure the exporters depend on is still unit-tested and cannot drift
with a model release. If the call fails or is declined, it falls back to the
template generator and marks the case `generatedBy: 'template-fallback'`.
Trade-offs: output is no longer deterministic, and the note is sent to
Anthropic's API.

## Destinations

| Key | Target | Auth | Result |
| --- | --- | --- | --- |
| `jira` | Issue of a configurable type in a project | Atlassian OAuth 2.0 | Issue key |
| `confluence` | Page in a space | Atlassian OAuth 2.0 | Page id |
| `ado` | `Test Case` work item in Azure DevOps | Personal access token | Work item id |
| `tfs` | `Test Case` work item in on-prem TFS | Personal access token | Work item id |
| `excel` | `.xlsx` workbook streamed to the browser | none | File download |

Each tracker destination accepts a `*_EXTRA_FIELDS` JSON object for fields a
strict project requires — Jira priority or components, Azure DevOps
`System.AreaPath` and `System.IterationPath`. Extras merge last but cannot
overwrite the fields the tool owns (summary, description, the steps grid),
so a stray key cannot silently replace the generated content.

`DESTINATIONS` controls which are enabled, and only the config blocks for
enabled destinations are validated at boot — a Jira-only deployment never
has to supply Azure DevOps settings.

Azure DevOps and TFS share one adapter: TFS is the on-prem ancestor of the
same work-item REST API, so they differ only in base URL and `api-version`
(7.0 vs 5.1). Jira and Confluence share one OAuth session but request
different scopes and address different REST hosts.

Adding a destination means one module in `exporters/` and one config block.
The generator, the service layer and the UI are untouched — that is what the
tracker-agnostic test case buys.

## Layout

```
server/src/
  config.js                  env -> validated, frozen config (fails fast at boot)
  logger.js                  pino with redaction declared once
  config/generation.json     platforms, test types, variants — data, not code
  domain/testCase.js         validation schema — the authority
  domain/generationConfig.js loads and validates that file at boot
  domain/generator.js        note -> test cases (deterministic templates)
  domain/llmGenerator.js     same contract, Claude writes the prose
  domain/generatorStrategy.js  picks one; nothing downstream knows which
  domain/requirementSources.js test plan / spec / backlog / suite -> notes
  services/testCaseService.js  validate -> generate -> dispatch to a destination
  exporters/index.js               the destination registry
  exporters/jiraExporter.js        issue    + ADF body
  exporters/confluenceExporter.js  page     + storage format
  exporters/workItemExporter.js    workitem, shared by Azure DevOps and TFS
  exporters/excelExporter.js       file     + .xlsx workbook
  clients/atlassianAuth.js   authorization code grant, refresh, cloudIds
  clients/tokenStore.js      in-memory sessions (swap for Redis to scale out)
  clients/http.js            one retry policy shared by every adapter
  routes/ middleware/        HTTP boundary only
web/src/
  components/TestCaseForm.jsx      the form; presentational only
  components/ParametersEditor.jsx  the data table that multiplies cases
  components/RequirementsImport.jsx  paste or load a document, pick requirements
  components/EditableTestCase.jsx  generated panel: case tabs, edit, payload view
  components/ui.jsx               panel, chip, field and tab primitives
  theme.js                   design tokens (light + dark) and the MUI theme
  components/FeedbackArea.jsx      the one place outcomes are reported
  hooks/                     submission state machine
  services/                  validate-then-submit rule
  domain/testCase.js         mirrors the server's length bounds only --
                             platforms and test types come from /api/options
  api/client.js              transport + error envelope
```

Each layer depends only on the one beneath it. Both generators satisfy one
`generate(input) -> testCase[]` contract, so the strategy is a config
switch, and every exporter builds its own payload, so a wire format can
change without touching transport or business logic.

## Run it

```bash
# backend
cd server
cp .env.example .env     # then fill in the values below
npm install
npm start                # http://localhost:4000

# frontend (second terminal)
cd web
npm install
npm run dev              # http://localhost:5173
```

The Vite dev server proxies `/api` and `/auth` to port 4000, so both are one
origin in the browser and the session cookie stays first-party.

Open <http://localhost:5173>, pick a destination, and create a test case.
**Preview & edit** needs no credentials for any destination, and Excel needs
none even to create.

## Configuring credentials

`.env` is listed in `.gitignore`. Never commit it, and never paste real
values into a ticket or chat.

### Jira and Confluence — API token (simplest)

1. Create a token at <https://id.atlassian.com/manage-profile/security/api-tokens>.
2. Set it with your Atlassian login email, your site and project:

```bash
DESTINATIONS=excel,jira
ATLASSIAN_EMAIL=you@example.com
ATLASSIAN_API_TOKEN=            # treat as a password
JIRA_BASE_URL=https://your-site.atlassian.net
JIRA_PROJECT_KEY=QA             # the prefix of its issue keys
JIRA_ISSUE_TYPE=Task            # "Test" exists only with Xray/Zephyr
```

With a token, requests go straight to the site with Basic auth. There's no
OAuth app, callback URL or browser consent, so it works the same locally and
on Render. Everything is filed as that one account.

The **Jira** badge in the top bar checks the link: sign-in, project, issue type
and link type. It says what to fix, e.g. "Project QA has no "Test" issue type.
Set JIRA_ISSUE_TYPE to one of: Task, Bug, Story".

**Traceability:** a case generated from a Jira issue carries it in **Linked
requirements**, which you can edit in the case panel. Filing to Jira creates
the test issue and links it to each one (`JIRA_LINK_TYPE`, default
`Relates`), so the story lists its tests. A link that fails is reported
without undoing the filed issue.

### Jira and Confluence — Atlassian OAuth 2.0 (3LO)

1. Go to <https://developer.atlassian.com/console/myapps/> and
   **Create → OAuth 2.0 integration**.
2. **Permissions → Add** the APIs you need, then **Configure** and grant:
   - Jira: `read:jira-work`, `write:jira-work`
   - Confluence: `read:confluence-space.summary`, `write:confluence-content`
3. **Authorization → OAuth 2.0 (3LO) → Configure** and set the callback URL
   to `http://localhost:4000/auth/callback`. It must match `REDIRECT_URI`
   byte for byte, including the scheme and any trailing path.
4. **Settings** → copy the **Client ID** and **Secret**.

```bash
CLIENT_ID=              # from the developer console
CLIENT_SECRET=          # treat as a password
REDIRECT_URI=http://localhost:4000/auth/callback

JIRA_BASE_URL=https://your-site.atlassian.net
JIRA_PROJECT_KEY=QA
JIRA_ISSUE_TYPE=Test

CONFLUENCE_SPACE_KEY=QADOCS
CONFLUENCE_PARENT_PAGE_ID=   # optional
```

`offline_access` is requested by the service itself (see `config.js`) and is
what causes Atlassian to return a refresh token. Scopes are assembled from
`DESTINATIONS`, so a Jira-only deployment never asks for Confluence access.

`JIRA_BASE_URL` builds user-facing `/browse/KEY` links. REST calls address
the site by `cloudId`, resolved from `/oauth/token/accessible-resources`
after consent — separately per product, since Jira and Confluence are
distinct entries even on one site.

### Azure DevOps and TFS — personal access token

Create a PAT with the **Work Items (read & write)** scope: in Azure DevOps
under **User settings → Personal access tokens**; in TFS under the same menu
on the collection.

```bash
ADO_ORG_URL=https://dev.azure.com/your-org
ADO_PROJECT=Payments
ADO_PAT=
ADO_WORK_ITEM_TYPE=Test Case

TFS_COLLECTION_URL=https://tfs.your-company.local/tfs/DefaultCollection
TFS_PROJECT=Legacy
TFS_PAT=
TFS_API_VERSION=5.1
```

Unlike the Atlassian destinations, these authenticate server-side — there is
no browser consent step, so they work as soon as the PAT is set.

Steps land in `Microsoft.VSTS.TCM.Steps`, the XML document behind the Steps
grid on a Test Case work item. Intermediate steps are `ActionStep`; the final
one is a `ValidateStep` carrying the assertions.

### Excel

```bash
EXCEL_SHEET_NAME=Test Case
```

No credentials and no network call. The service builds a real `.xlsx` with
`exceljs` and streams it back as an attachment; the browser saves it.

### Production

Do not ship a `.env`. Load the same keys from AWS Secrets Manager, GCP
Secret Manager, or Vault at startup and inject them as environment variables
through the orchestrator:

```bash
# example: ECS/Kubernetes pulls the value, Node only ever sees the env var
export CLIENT_SECRET="$(aws secretsmanager get-secret-value \
  --secret-id tcg/jira --query SecretString --output text | jq -r .client_secret)"
```

Also: set `NODE_ENV=production` (which marks the session cookie `Secure`),
serve over HTTPS, update `REDIRECT_URI` and the registered callback to the
real host, set `CORS_ORIGIN` to the deployed front-end origin, and rotate
the client secret and PATs on a schedule.

### Verifying a project accepts the issue type

`Test` only exists if the Jira project's issue type scheme defines it (Xray,
Zephyr, or a custom scheme). Check with
`GET /rest/api/3/issue/createmeta` if creation returns a 400 naming an
unknown field or type. The same applies to `Test Case` in Azure DevOps —
it exists only in the Agile, Scrum and CMMI process templates.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/healthz` | Liveness probe. |
| `GET` | `/api/options` | Destinations, platforms, test types, variants, generator. |
| `GET` | `/api/destinations` | Enabled destinations only (kept for compatibility). |
| `GET` | `/auth/status` | `{ connected, authRequired, destinations }`. |
| `GET` | `/auth/login` | Redirects to Atlassian consent (step 1). |
| `GET` | `/auth/callback` | Exchanges the code for tokens (step 2). |
| `POST` | `/auth/logout` | Discards the in-memory tokens. |
| `POST` | `/api/import-requirements` | `{ sourceType, content }` -> extracted requirements. |
| `POST` | `/api/preview-test-case` | Expands the input, exports nothing. |
| `POST` | `/api/payload-preview` | `{ destination, testCase }` -> the request that destination would send. Sends nothing. |
| `POST` | `/api/create-test-case` | Validates, generates, exports. |
| `POST` | `/api/agent/sources` | `{ type: jira \| confluence \| figma, ref }` -> attachments for the agent. Generates nothing. |
| `POST` | `/api/agent/generate` | Runs the AI agent, or refines its cases. Streams NDJSON progress, then the result. |

Request body:

```json
{
  "destination": "jira | confluence | excel | ado | tfs",
  "platform": "mobile | web | desktop | tablet | api",
  "testType": "smoke | regression | negative | boundary",
  "negativeVariants": false,
  "parameters": { "columns": ["role"], "rows": [["admin"], ["viewer"]] },
  "name": "Login works for {{role}}",
  "description": "Sign in as {{role}}. Click the login button.",
  "expectedResult": "The {{role}} dashboard is shown",
  "testCases": null
}
```

`destination` defaults to `jira` and `testType` to `regression`.
`parameters` and `negativeVariants` are optional. Pass `testCases` — the
array returned by the preview, with your edits — to file those verbatim
instead of generating. Pass `requirements` -- the list returned by
`/api/import-requirements`, filtered to the ones you want -- in place of
`name`, `description` and `expectedResult` to generate from each in turn.

Success (`201`):

```json
{ "success": true, "destination": "jira", "kind": "issue",
  "items": [{ "ref": "QA-123", "url": "https://…/browse/QA-123", "title": "[Web] …" }],
  "issueKey": "QA-123", "url": "https://…/browse/QA-123", "testCases": [ ] }
```

`items` has one entry per case created. `issueKey` and `url` mirror the
first, for the common single-case call.

The `excel` destination instead responds with the workbook itself —
`content-disposition: attachment` plus `x-test-case-title` and
`x-test-case-steps` headers, so the UI can report what was downloaded.

Failure — every error uses one envelope, with `fieldErrors` present only on
a validation failure:

```json
{ "success": false, "code": "validation_failed", "error": "One or more fields are invalid.",
  "fieldErrors": { "name": "Test case name must be at least 5 characters." } }
```

| Status | `code` | Meaning |
| --- | --- | --- |
| 400 | `malformed_json` | Body was not valid JSON. |
| 400 | `destination_unavailable` | Destination unknown or not enabled. |
| 401 | `not_connected` | No Atlassian session; run the consent flow. |
| 401 | `reauth_required` | Refresh failed; the session was dropped. |
| 413 | `payload_too_large` | Body exceeded 256 kB. |
| 422 | `validation_failed` | See `fieldErrors`. |
| 429 | — | Local rate limit (20 writes/min per client). |
| 502 | `export_failed` | The tracker rejected the request; message says why. |
| 503 | `export_failed` | Tracker unavailable after 3 attempts. |

## Security notes

- **Shared password (`APP_PASSWORD`).** When set, every API route except
  `/healthz` and sign-in itself needs a login. Signing in sets an HttpOnly
  cookie (Secure in production) holding an expiry and an HMAC keyed by the
  password. The password is never stored or sent back, a login lasts 30 days,
  and changing the password signs everyone out. Wrong guesses are limited to
  5 a minute per client. Unset, the app is open to anyone with its address.

- **Validation on both sides.** `server/src/domain/testCase.js` is the
  authority and re-validates every request; the client mirror exists only
  for instant feedback.
- **Validation precedes the auth check**, so a malformed request returns
  field errors instead of a 401 that hides them — and a destination needing
  no auth is never blocked by a missing session.
- **Redaction is declared once** in `logger.js` (`client_secret`,
  `access_token`, `refresh_token`, `authorization`, `cookie`, and nested
  variants), so no call site can leak a token by logging an error object.
  `scrubText` strips `Bearer …` and JWT-shaped strings out of upstream
  bodies before they are logged.
- **User content is escaped per format.** Confluence storage format and the
  Azure DevOps steps XML both escape user text, so a `<script>` in an
  expected result cannot break out of the document.
- **Errors carry two payloads.** `message` is user-facing; `details` is only
  ever logged. Unrecognised errors collapse to a generic 500 so an internal
  code never reaches the browser.
- **CSRF on the callback.** `state` is single-use; a replayed callback URL
  fails.
- **The cookie holds an opaque session id**, not a token, and is `httpOnly`,
  `SameSite=Lax`, and `Secure` in production.
- **Retries are bounded** — 3 attempts, exponential backoff, `Retry-After`
  honoured, capped at 10 s, and only for `429`/`5xx`/network errors. One
  policy in `clients/http.js` covers every destination.

## Known limitations

Documented rather than hidden; all three are tracked work, not surprises.

- **A retried create can file a duplicate.** `clients/http.js` retries on
  network error, timeout and `5xx` for every method, including the `POST`
  that creates an issue. If the tracker commits the write and the response is
  then lost, the retry files a second copy. Multi-case runs widen the window,
  since each case is its own request. The cheap fix is to stop retrying
  creates and let the user retry deliberately; the thorough fix is a
  search-before-create on a deterministic marker per destination.
- **The OAuth layer has no automated tests.** Token refresh, the expiry skew,
  refresh-token rotation and the clear-session-on-failed-refresh path are all
  covered only by manual testing. So are the routes and the error handler.
- **Single instance only.** The token store and the rate limiter both hold
  state in process memory, so two replicas behind a load balancer will not
  share sessions and will effectively double the rate limit. Both sit behind
  narrow interfaces for exactly this reason.

## Tests

```bash
cd server && npm test
```

84 tests covering step generation per platform, determinism, schema
rejection and trimming, the registry contract every exporter must satisfy,
Jira ADF structure, Confluence escaping, the TCM steps XML and patch
document, and that the Excel export is a real xlsx container — plus test
types, negative variants, parameter substitution, extra-field merging
(including that extras cannot hijack owned fields), edited-case validation,
one sheet per case with legal unique names, and requirement import from
every source kind (sections, IDs, CSV exports, Gherkin outlines) through to
generation and the case limit. The agent tests replay a scripted model
stream, so they need no API key. They check the request sent to the model,
the stage events, conversion into fileable cases, scoped refinement, enum
normalisation, and per-step expected results in each exporter. Source tests
build real .docx, .pptx and .xlsx files, parse Jira, Confluence and Figma
links, and fetch Figma frames against a stubbed `fetch`.

## Docker

```bash
cd server && docker build -t tcg-api .
docker run --rm -p 4000:4000 --env-file .env tcg-api
```

Or `docker compose up --build` from the repo root. The image runs as the
unprivileged `node` user with `dumb-init` as PID 1 so `SIGTERM` reaches Node
and the graceful shutdown runs. Secrets arrive as environment variables at
run time and are never baked into a layer.
