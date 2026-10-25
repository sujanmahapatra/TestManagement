"""The DeepEval judge model: Google Gemini (free tier) or Groq.

DeepEval defaults to OpenAI as the judge. This points it at an
OpenAI-compatible endpoint instead:

- Gemini (default when GEMINI_API_KEY is set): a different model family from
  the generator (GPT-OSS on Groq), so the judge does not grade its own kind.
- Groq (fallback): GPT-OSS 20B, a smaller relative of the generator.

JUDGE_PROVIDER (gemini | groq) and JUDGE_MODEL override the choice.
"""

import json
import os
import re

from deepeval.models import DeepEvalBaseLLM
from openai import AsyncOpenAI, OpenAI
from pydantic import BaseModel

PROVIDERS = {
    "gemini": {"base_url": "https://generativelanguage.googleapis.com/v1beta/openai/", "key": "GEMINI_API_KEY", "model": "gemini-3.5-flash-lite"},
    "groq": {"base_url": "https://api.groq.com/openai/v1", "key": "GROQ_API_KEY", "model": "openai/gpt-oss-20b"},
}


def default_provider() -> str:
    chosen = os.getenv("JUDGE_PROVIDER", "").strip().lower()
    if chosen in PROVIDERS:
        return chosen
    return "gemini" if os.getenv("GEMINI_API_KEY") else "groq"


class GroqJudge(DeepEvalBaseLLM):
    def __init__(self, model: str | None = None, provider: str | None = None):
        self.provider = provider or default_provider()
        settings = PROVIDERS[self.provider]
        self.model = model or os.getenv("JUDGE_MODEL") or settings["model"]
        key = os.environ[settings["key"]]
        # Free tiers allow a few requests a minute; the client waits out a 429
        # (honouring Retry-After) instead of failing the metric.
        self.client = OpenAI(api_key=key, base_url=settings["base_url"], max_retries=8)
        self.async_client = AsyncOpenAI(api_key=key, base_url=settings["base_url"], max_retries=8)

    def load_model(self):
        return self.client

    def get_model_name(self) -> str:
        return f"{self.provider}/{self.model}"

    def _request(self, prompt: str, schema: type[BaseModel] | None) -> dict:
        args = {
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "max_tokens": int(os.getenv("JUDGE_MAX_TOKENS", "4000")),
        }
        if self.provider == "groq":
            # Groq's free tier is tight: think briefly (Qwen: not at all).
            args["extra_body"] = {"reasoning_effort": "none" if "qwen" in self.model else "low"}
        if schema is not None:
            # JSON mode needs the shape spelled out in the prompt.
            shape = json.dumps(schema.model_json_schema())
            args["messages"][0]["content"] = f"{prompt}\n\nReply with only a JSON object matching this JSON schema:\n{shape}"
            args["response_format"] = {"type": "json_object"}
        return args

    @staticmethod
    def _parse(text: str, schema: type[BaseModel] | None):
        # Reasoning models may prefix their answer with <think>...</think>, and
        # some wrap JSON in a code fence.
        text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S).strip()
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text).strip()
        return schema.model_validate_json(text) if schema is not None else text

    def generate(self, prompt: str, schema: type[BaseModel] | None = None):
        res = self.client.chat.completions.create(model=self.model, **self._request(prompt, schema))
        return self._parse(res.choices[0].message.content, schema)

    async def a_generate(self, prompt: str, schema: type[BaseModel] | None = None):
        res = await self.async_client.chat.completions.create(model=self.model, **self._request(prompt, schema))
        return self._parse(res.choices[0].message.content, schema)
