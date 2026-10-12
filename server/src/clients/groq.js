import { AppError } from '../utils/errors.js';

/**
 * Groq's chat completions API (OpenAI-style), for the agent's free hosted
 * option. One call, no streaming: Groq's JSON modes do not stream, and it
 * answers in seconds anyway.
 *
 * Models that support strict JSON schemas (GPT-OSS, Qwen 3.8) are held to the
 * suite's schema exactly; others get JSON object mode, with the shape given in
 * the prompt.
 */

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const STRICT_MODELS = /^(openai\/gpt-oss-(20b|120b)|qwen\/qwen3\.8)/;
const TIMEOUT_MS = 180_000;

export const supportsStrictSchema = (model) => STRICT_MODELS.test(model);

/**
 * Strict mode requires every object to list all its properties as required
 * and to forbid extras; zod's JSON Schema leaves both implicit.
 */
export function toStrictSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toStrictSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out = Object.fromEntries(Object.entries(schema).map(([k, v]) => [k, toStrictSchema(v)]));
  if (out.type === 'object' && out.properties) {
    out.required = Object.keys(out.properties);
    out.additionalProperties = false;
  }
  return out;
}

/** Groq's error body -> an error that says what to do. */
function toError(status, body) {
  let message = '';
  try {
    message = JSON.parse(body)?.error?.message ?? '';
  } catch {
    // not JSON
  }
  const details = `${status} ${message || body.slice(0, 300)}`;
  if (status === 401 || status === 403) {
    return new AppError('Groq rejected the API key. Check GROQ_API_KEY on the server.', { status: 503, code: 'agent_unavailable', details });
  }
  if (status === 413 || /request too large|tokens per minute|TPM/i.test(message)) {
    return new AppError(
      "This requirement is too large for Groq's free tier, which allows about 8,000 tokens a minute. Shorten it, attach fewer files, or generate one section at a time.",
      { status: 422, code: 'agent_too_large', details },
    );
  }
  if (status === 429) {
    const wait = message.match(/try again in ([\d.]+m?[\d.]*s)/i)?.[1];
    return new AppError(`Groq's free-tier limit was reached. Try again${wait ? ` in ${wait}` : ' in a minute'}.`, {
      status: 429,
      code: 'agent_busy',
      details,
    });
  }
  if (status === 400 && /json_validate_failed|failed to generate json/i.test(message)) {
    return new AppError('The AI returned an unreadable answer. Please try again.', { status: 502, code: 'agent_failed', details });
  }
  if (status === 400) {
    return new AppError('Groq could not process this request. Check the model name in GROQ_MODEL.', { status: 422, code: 'agent_rejected', details });
  }
  return new AppError('Groq is unavailable. Please try again.', { status: 502, code: 'agent_failed', details });
}

/**
 * Streams a reply, passing the model's reasoning and answer along as they
 * arrive. No JSON mode -- Groq does not stream it -- so the caller asks for
 * JSON in the prompt and parses the text.
 *
 * @returns {Promise<{ text: string, finishReason: string, model: string, usage: object }>}
 */
export async function groqStream({ apiKey, model, system, user, maxTokens, signal, onReasoning, onContent }) {
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_completion_tokens: maxTokens,
    temperature: 0.3,
    stream: true,
    ...(/^openai\/gpt-oss/.test(model) && { reasoning_effort: 'low', include_reasoning: true }),
  };

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (signal?.aborted) throw new AppError('Generation was cancelled.', { status: 499, code: 'agent_cancelled' });
    throw new AppError('Could not reach Groq. Check the internet connection.', { status: 504, code: 'agent_failed', details: err.message });
  }
  if (!res.ok) throw toError(res.status, await res.text());

  let text = '';
  let finishReason = null;
  let usage = {};
  let modelName = model;
  let buffer = '';
  const decoder = new TextDecoder();

  const handle = (line) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    const chunk = JSON.parse(data);
    if (chunk.error) throw toError(500, JSON.stringify(chunk));
    modelName = chunk.model ?? modelName;
    const choice = chunk.choices?.[0];
    const delta = choice?.delta ?? {};
    const reasoning = delta.reasoning ?? delta.reasoning_content;
    if (reasoning) onReasoning?.(reasoning);
    if (delta.content) {
      text += delta.content;
      onContent?.(delta.content, text);
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    const u = chunk.x_groq?.usage ?? chunk.usage;
    if (u) usage = { input_tokens: u.prompt_tokens, output_tokens: u.completion_tokens };
  };

  try {
    for await (const piece of res.body) {
      buffer += decoder.decode(piece, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(handle);
    }
    handle(buffer);
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (signal?.aborted) throw new AppError('Generation was cancelled.', { status: 499, code: 'agent_cancelled' });
    throw new AppError('The connection to Groq dropped. Please try again.', { status: 502, code: 'agent_failed', details: err.message });
  }

  return { text, finishReason, model: modelName, usage };
}

/**
 * @returns {Promise<{ text: string, finishReason: string, model: string, usage: object }>}
 */
export async function groqChat({ apiKey, model, system, user, schema, maxTokens, signal }) {
  const strict = schema && supportsStrictSchema(model);
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_completion_tokens: maxTokens,
    temperature: 0.3,
    ...(/^openai\/gpt-oss/.test(model) && { reasoning_effort: 'low' }), // reasoning counts against the token budget
    response_format: strict
      ? { type: 'json_schema', json_schema: { name: 'test_suite', strict: true, schema: toStrictSchema(schema) } }
      : { type: 'json_object' },
  };

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (signal?.aborted) throw new AppError('Generation was cancelled.', { status: 499, code: 'agent_cancelled' });
    throw new AppError('Could not reach Groq. Check the internet connection.', { status: 504, code: 'agent_failed', details: err.message });
  }

  const text = await res.text();
  if (!res.ok) throw toError(res.status, text);

  const data = JSON.parse(text);
  const choice = data.choices?.[0] ?? {};
  return {
    text: choice.message?.content ?? '',
    finishReason: choice.finish_reason,
    model: data.model,
    usage: { input_tokens: data.usage?.prompt_tokens, output_tokens: data.usage?.completion_tokens },
    strict,
  };
}
