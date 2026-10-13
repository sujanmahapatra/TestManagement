# Agent evaluation (DeepEval)

Scores the test case generator agent's output with [DeepEval](https://deepeval.com).
Each requirement in `samples.json` is sent to the running app, and the test cases it
returns are checked for:

| Check | How | Pass mark |
| --- | --- | --- |
| Suite shape | plain asserts: enough cases, every case has steps and an expected result, no duplicate titles | must pass |
| Requirement coverage | G-Eval: every listed requirement is tested | 0.7 |
| Test case quality | G-Eval: clear steps, checkable expected results, one thing per case | 0.7 |
| Faithfulness | nothing invented beyond the requirement | 0.7 |

The judge is a Groq model (`openai/gpt-oss-20b` by default, free tier) -- a smaller model than the
generator (`gpt-oss-120b`). No OpenAI key is needed. A full run takes about 4-5 minutes, because
Groq's free tier allows one generation a minute and the script waits between samples.

## Setup (once)

1. Install Python 3.11+ from https://www.python.org/downloads/ (tick "Add python.exe to PATH").
2. In PowerShell:

   ```powershell
   cd eval
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

`GROQ_API_KEY` (and `APP_PASSWORD`, if set) are read from `server/.env`, so nothing needs retyping.

## Run

Start the app (`cd server; npm start`), then in `eval/` with the venv active:

```powershell
deepeval test run test_generator.py
```

To test the hosted site instead of your laptop:

```powershell
$env:APP_URL = "https://test-management-kxtq.onrender.com"
deepeval test run test_generator.py
```

Options (environment variables): `APP_URL` (default `http://127.0.0.1:4000`), `JUDGE_MODEL`
(any Groq model), `APP_PASSWORD`.

## Adding samples

Add an entry to `samples.json` with `name`, `platform` (`web`, `mobile`, `desktop`, `tablet`,
`api`), `testType`, the `prompt` (the PRD or story text) and `requirements` -- the list the
generated suite must cover. The app allows 10 generations a minute, so keep a run under
about 10 samples or expect rate-limit errors.
