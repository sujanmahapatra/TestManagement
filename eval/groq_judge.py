"""A DeepEval judge model served by Groq (OpenAI-compatible API, free tier).

DeepEval defaults to OpenAI as the judge; this lets it score with a Groq
model instead, using the same GROQ_API_KEY the app already uses.
"""

import json
import os
import re

from deepeval.models import DeepEvalBaseLLM
from openai import AsyncOpenAI, OpenAI
from pydantic import BaseModel

GROQ_BASE_URL = "https://api.groq.com/openai/v1"


class GroqJudge(DeepEvalBaseLLM):
    def __init__(self, model: str | None = None):
        # A smaller model than the generator (gpt-oss-120b). Free-tier Groq has no
        # other judge-sized model with enough output tokens a minute; set
        # JUDGE_MODEL to use a different one.
        self.model = model or os.getenv("JUDGE_MODEL", "openai/gpt-oss-20b")
        key = os.environ["GROQ_API_KEY"]
        # The free tier allows a few thousand tokens a minute; the client waits
        # out a 429 (honouring Retry-After) instead of failing the metric.
        self.client = OpenAI(api_key=key, base_url=GROQ_BASE_URL, max_retries=8)
        self.async_client = AsyncOpenAI(api_key=key, base_url=GROQ_BASE_URL, max_retries=8)

    def load_model(self):
        return self.client

    def get_model_name(self) -> str:
        return f"groq/{self.model}"

    def _request(self, prompt: str, schema: type[BaseModel] | None) -> dict:
        # Free-tier limits are tight (Qwen: 1,000 output tokens a minute), so the judge
        # thinks briefly (or not at all) and its reply is capped.
        thinking = {"reasoning_effort": "none" if "qwen" in self.model else "low"}
        args = {
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
            "max_tokens": int(os.getenv("JUDGE_MAX_TOKENS", "4000")),
            "extra_body": thinking,
        }
        if schema is not None:
            # JSON mode needs the shape spelled out in the prompt.
            shape = json.dumps(schema.model_json_schema())
            args["messages"][0]["content"] = f"{prompt}\n\nReply with only a JSON object matching this JSON schema:\n{shape}"
            args["response_format"] = {"type": "json_object"}
        return args

    @staticmethod
    def _parse(text: str, schema: type[BaseModel] | None):
        # Reasoning models may prefix their answer with <think>...</think>.
        text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S).strip()
        return schema.model_validate_json(text) if schema is not None else text

    def generate(self, prompt: str, schema: type[BaseModel] | None = None):
        res = self.client.chat.completions.create(model=self.model, **self._request(prompt, schema))
        return self._parse(res.choices[0].message.content, schema)

    async def a_generate(self, prompt: str, schema: type[BaseModel] | None = None):
        res = await self.async_client.chat.completions.create(model=self.model, **self._request(prompt, schema))
        return self._parse(res.choices[0].message.content, schema)
