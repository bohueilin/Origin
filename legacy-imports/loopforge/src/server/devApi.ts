import type { IncomingMessage, ServerResponse } from 'node:http'
import { createLiveRun, createRecordedRun, MissingConfigError } from './orchestrator'

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (chunks.length === 0) {
    return {}
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(payload))
}

export async function handleLoopForgeRun(
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    const body = await readBody(request)
    const mode = body.mode === 'live' ? 'live' : 'recorded'

    if (mode === 'recorded') {
      sendJson(response, 200, createRecordedRun())
      return
    }

    sendJson(response, 200, await createLiveRun())
  } catch (error) {
    if (error instanceof MissingConfigError) {
      sendJson(response, 400, {
        error: 'Live Cerebras mode is not configured.',
        missing: error.missing,
      })
      return
    }

    sendJson(response, 500, {
      error: 'LoopForge run failed before a recorded fallback could be prepared.',
    })
  }
}
