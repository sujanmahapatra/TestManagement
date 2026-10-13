"""Calls the test case generator agent over HTTP, the way the web UI does."""

import json
import os
import time

import requests

BASE_URL = os.getenv("APP_URL", "http://127.0.0.1:4000").rstrip("/")


def _session() -> requests.Session:
    s = requests.Session()
    password = os.getenv("APP_PASSWORD")
    if password:
        r = s.post(f"{BASE_URL}/api/login", json={"password": password}, timeout=30)
        r.raise_for_status()
    return s


# Groq's free tier allows about 8,000 tokens a minute and one generation uses
# most of that, so a run of several samples waits for the window to reset.
RATE_LIMIT_WAIT = int(os.getenv("RATE_LIMIT_WAIT", "65"))


def generate(sample: dict, attempts: int = 4) -> dict:
    """Runs one generation, waiting out Groq's per-minute limit when it is hit."""
    for attempt in range(1, attempts + 1):
        try:
            return _generate_once(sample)
        except RuntimeError as err:
            limited = "tokens a minute" in str(err) or "rate limit" in str(err).lower() or "(429)" in str(err)
            if not limited or attempt == attempts:
                raise
            print(f"\n[{sample['name']}] Groq rate limit; waiting {RATE_LIMIT_WAIT}s (attempt {attempt}/{attempts})")
            time.sleep(RATE_LIMIT_WAIT)


def _generate_once(sample: dict) -> dict:
    """Runs one generation and returns the agent's final `result` event."""
    body = {
        "platform": sample.get("platform", "web"),
        "testType": sample.get("testType", "regression"),
        "prompt": sample["prompt"],
        # Score the agent on the requirement alone, not on saved cases.
        "scanRepository": False,
    }
    with _session().post(f"{BASE_URL}/api/agent/generate", json=body, stream=True, timeout=600) as r:
        if r.status_code != 200:
            raise RuntimeError(f"generate failed ({r.status_code}): {r.text[:300]}")
        # NDJSON: one event per line; the last is `result` or `error`.
        for line in r.iter_lines(decode_unicode=True):
            if not line:
                continue
            event = json.loads(line)
            if event.get("type") == "result":
                return event
            if event.get("type") == "error":
                raise RuntimeError(f"agent error: {event.get('error')}")
    raise RuntimeError("the stream ended without a result")


def as_text(test_cases: list[dict]) -> str:
    """The suite as readable text, which is what the judge scores."""
    out = []
    for i, tc in enumerate(test_cases, 1):
        out.append(f"TC{i}: {tc['title']}  [{tc.get('priority')}, {tc.get('category')}, {tc.get('kind')}]")
        if tc.get("scenario"):
            out.append(f"  Scenario: {tc['scenario']}")
        for p in tc.get("preconditions") or []:
            out.append(f"  Precondition: {p}")
        results = tc.get("stepResults") or []
        for n, step in enumerate(tc.get("steps") or [], 1):
            expected = results[n - 1] if n - 1 < len(results) else ""
            out.append(f"  {n}. {step}" + (f"  ->  {expected}" if expected else ""))
        for e in tc.get("expectedResults") or []:
            if e not in results:
                out.append(f"  Expected: {e}")
    return "\n".join(out)
