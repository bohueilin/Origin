import { z, type ZodType } from 'zod'
import { computeTokensPerSecond, maybeSecondsToMs } from './latency'
import type { ProviderLatency } from './schemas'

type ChatRole = 'system' | 'user' | 'assistant'

export type ChatMessage = {
  role: ChatRole
  content: string
}

type CerebrasJsonOptions<T> = {
  apiKey: string
  model: string
  task: string
  schemaName: string
  schema: ZodType<T>
  messages: ChatMessage[]
  reasoningEffort?: 'none' | 'medium'
  maxCompletionTokens?: number
  temperature?: number
}

type CerebrasTimeInfo = {
  queue_time?: number
  prompt_time?: number
  completion_time?: number
  total_time?: number
}

type CerebrasUsage = {
  prompt_tokens?: number
  completion_tokens?: number
}

type CerebrasResponse = {
  choices?: Array<{
    message?: {
      content?: MessageContent
    }
  }>
  usage?: CerebrasUsage
  time_info?: CerebrasTimeInfo
}

type MessageContent = string | Array<{ type?: string; text?: string }> | undefined

export class SafeProviderError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

function nowMs() {
  return globalThis.performance?.now() ?? Date.now()
}

function contentToText(content: MessageContent) {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? '').join('')
  }

  return ''
}

function parseJsonContent(content: string) {
  try {
    return JSON.parse(content) as unknown
  } catch {
    const start = content.indexOf('{')
    const end = content.lastIndexOf('}')

    if (start >= 0 && end > start) {
      return JSON.parse(content.slice(start, end + 1)) as unknown
    }

    throw new SafeProviderError(
      'Cerebras returned a response that was not valid JSON.',
      'CEREBRAS_JSON_PARSE',
    )
  }
}

async function postCerebras(apiKey: string, body: Record<string, unknown>) {
  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const responseText = await response.text()

  if (!response.ok) {
    throw new SafeProviderError(
      `Cerebras request failed with HTTP ${response.status}.`,
      'CEREBRAS_HTTP_ERROR',
    )
  }

  try {
    return JSON.parse(responseText) as CerebrasResponse
  } catch {
    throw new SafeProviderError(
      'Cerebras returned a non-JSON API response.',
      'CEREBRAS_API_PARSE',
    )
  }
}

function buildLatency(
  task: string,
  model: string,
  response: CerebrasResponse,
  measuredMs: number,
): ProviderLatency {
  const usage = response.usage ?? {}
  const timeInfo = response.time_info ?? {}
  const totalMs = maybeSecondsToMs(timeInfo.total_time) ?? Math.round(measuredMs)
  const queueMs = maybeSecondsToMs(timeInfo.queue_time)
  const completionMs = maybeSecondsToMs(timeInfo.completion_time)
  const completionTokens = usage.completion_tokens ?? null

  return {
    provider: 'Cerebras',
    label: task,
    model,
    mode: 'live',
    status: 'complete',
    totalMs,
    queueMs,
    completionMs,
    promptTokens: usage.prompt_tokens ?? null,
    completionTokens,
    tokensPerSecond: computeTokensPerSecond(completionTokens, completionMs),
    note: 'Live response.time_info captured from Cerebras.',
  }
}

function requestBody<T>(
  options: CerebrasJsonOptions<T>,
  responseFormat: Record<string, unknown>,
) {
  return {
    model: options.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.1,
    max_completion_tokens: options.maxCompletionTokens ?? 1200,
    reasoning_effort: options.reasoningEffort ?? 'none',
    response_format: responseFormat,
  }
}

function sanitizeSchemaForCerebras(value: unknown): unknown {
  const unsupportedKeywords = new Set([
    '$schema',
    'default',
    'description',
    'exclusiveMaximum',
    'exclusiveMinimum',
    'format',
    'maxItems',
    'maxLength',
    'maximum',
    'minItems',
    'minLength',
    'minimum',
    'multipleOf',
    'pattern',
    'propertyNames',
  ])

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSchemaForCerebras(item))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !unsupportedKeywords.has(key))
      .map(([key, entry]) => [key, sanitizeSchemaForCerebras(entry)]),
  )
}

export async function runCerebrasJson<T>(
  options: CerebrasJsonOptions<T>,
): Promise<{ value: T; latency: ProviderLatency }> {
  const schema = sanitizeSchemaForCerebras(z.toJSONSchema(options.schema, { io: 'output' }))
  const jsonSchemaFormat = {
    type: 'json_schema',
    json_schema: {
      name: options.schemaName,
      strict: true,
      schema,
    },
  }

  const started = nowMs()
  let response: CerebrasResponse

  try {
    response = await postCerebras(
      options.apiKey,
      requestBody(options, jsonSchemaFormat),
    )
  } catch (error) {
    if (!(error instanceof SafeProviderError)) {
      throw error
    }

    response = await postCerebras(
      options.apiKey,
      requestBody(options, { type: 'json_object' }),
    )
  }

  const measuredMs = nowMs() - started
  const content = contentToText(response.choices?.[0]?.message?.content)

  if (!content) {
    throw new SafeProviderError(
      'Cerebras returned an empty message.',
      'CEREBRAS_EMPTY_RESPONSE',
    )
  }

  const parsed = options.schema.safeParse(parseJsonContent(content))

  if (!parsed.success) {
    throw new SafeProviderError(
      'Cerebras JSON did not match the expected schema.',
      'CEREBRAS_SCHEMA_VALIDATION',
    )
  }

  return {
    value: parsed.data,
    latency: buildLatency(options.task, options.model, response, measuredMs),
  }
}
