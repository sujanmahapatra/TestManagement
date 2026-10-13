"""DeepEval quality checks for the test case generator agent.

Each sample requirement in samples.json is sent to the running app; the test
cases that come back are scored by a Groq-hosted judge model:

  * Requirement coverage -- every listed requirement has at least one case
  * Test case quality    -- clear, atomic steps with checkable expected results
  * Faithfulness         -- nothing invented that the requirement does not say

Run with:  deepeval test run test_generator.py
"""

import json
from functools import cache
from pathlib import Path

import pytest
from deepeval import assert_test
from deepeval.metrics import FaithfulnessMetric, GEval
from deepeval.test_case import LLMTestCase, SingleTurnParams

from app_client import as_text, generate
from groq_judge import GroqJudge

SAMPLES = json.loads((Path(__file__).parent / "samples.json").read_text(encoding="utf-8"))
judge = GroqJudge()

coverage = GEval(
    name="Requirement coverage",
    criteria=(
        "The expected output lists the requirements of a feature. Check that the actual output "
        "(a suite of test cases) has at least one test case that verifies each listed requirement, "
        "including its negative and boundary conditions (limits, error messages, timeouts). "
        "Penalise every requirement that no test case checks."
    ),
    evaluation_params=[SingleTurnParams.EXPECTED_OUTPUT, SingleTurnParams.ACTUAL_OUTPUT],
    model=judge,
    threshold=0.7,
)

quality = GEval(
    name="Test case quality",
    criteria=(
        "Judge the actual output as a manual QA test suite. Good test cases have a specific title, "
        "needed preconditions, numbered steps a tester can follow without guessing, and an "
        "observable, checkable expected result. Each case checks one thing. "
        "Penalise vague steps ('verify it works'), missing expected results and duplicate cases."
    ),
    evaluation_params=[SingleTurnParams.INPUT, SingleTurnParams.ACTUAL_OUTPUT],
    model=judge,
    threshold=0.7,
)

faithfulness = FaithfulnessMetric(model=judge, threshold=0.7)


@cache
def run(name: str) -> dict:
    """One generation per sample, shared by its checks."""
    sample = next(s for s in SAMPLES if s["name"] == name)
    return generate(sample)


@pytest.mark.parametrize("sample", SAMPLES, ids=[s["name"] for s in SAMPLES])
def test_suite_shape(sample):
    """Cheap checks that need no judge."""
    cases = run(sample["name"])["testCases"]
    assert len(cases) >= len(sample["requirements"]) // 2, f"only {len(cases)} cases for {len(sample['requirements'])} requirements"
    for tc in cases:
        assert tc["title"].strip(), "a case has no title"
        assert tc["steps"], f"'{tc['title']}' has no steps"
        assert tc["expectedResults"], f"'{tc['title']}' has no expected result"
    titles = [tc["title"].strip().lower() for tc in cases]
    assert len(titles) == len(set(titles)), "duplicate titles"


@pytest.mark.parametrize("sample", SAMPLES, ids=[s["name"] for s in SAMPLES])
def test_suite_quality(sample):
    result = run(sample["name"])
    test_case = LLMTestCase(
        input=sample["prompt"],
        actual_output=as_text(result["testCases"]),
        expected_output="\n".join(f"- {r}" for r in sample["requirements"]),
        retrieval_context=[sample["prompt"]],
    )
    assert_test(test_case, [coverage, quality, faithfulness])
