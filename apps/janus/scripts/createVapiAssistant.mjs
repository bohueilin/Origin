// Creates a Vapi assistant with two FUNCTION tools that call our thin operator
// webhook (PUBLIC_BASE_URL/api/vapi/tools). Reads VAPI_API_KEY + PUBLIC_BASE_URL
// from .env.local. Never prints the key.
//
//   node scripts/createVapiAssistant.mjs
//
// Vapi only ever calls our server-owned endpoints — it holds no sponsor secret.

import fs from 'node:fs'

const env = Object.fromEntries(
  fs
    .readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1)]
    }),
)

const KEY = env.VAPI_API_KEY
const BASE = (env.PUBLIC_BASE_URL || '').replace(/\/+$/, '')
if (!KEY || KEY.startsWith('__')) throw new Error('VAPI_API_KEY missing in .env.local')
if (!BASE) throw new Error('PUBLIC_BASE_URL missing in .env.local')

const serverUrl = `${BASE}/api/vapi/tools`

const tools = [
  {
    type: 'function',
    function: {
      name: 'run_autonomy_episode',
      description:
        'Run one server-owned autonomy episode and return whether autonomy was earned. The server loads the canonical scenario, runs the policy, runs the deterministic verifier, computes the license, and persists tamper-evident evidence.',
      parameters: {
        type: 'object',
        properties: {
          scenarioId: { type: 'string', description: 'Scenario id, e.g. com-1, ops-2, rob-2.' },
          policyMode: { type: 'string', enum: ['mock', 'nebius'], description: 'Which policy runs.' },
        },
        required: ['scenarioId', 'policyMode'],
      },
    },
    server: { url: serverUrl },
  },
  {
    type: 'function',
    function: {
      name: 'get_evidence_status',
      description:
        'Summarize the latest verified evidence: current license, evidence source, and digest/trusted counts.',
      parameters: {
        type: 'object',
        properties: {
          refresh: { type: 'boolean', description: 'Force a fresh read-back from InsForge.' },
        },
      },
    },
    server: { url: serverUrl },
  },
]

const assistant = {
  name: 'Autonomy Trace Console Operator',
  firstMessage:
    'Autonomy operator here. Ask me to run an episode and I will tell you whether autonomy was earned.',
  model: {
    provider: 'openai',
    model: 'gpt-4o',
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          'You are the voice operator for Autonomy Trace Console. You can run a server-owned autonomy episode and summarize verified evidence. You must call the tools for any factual claim — never compute verifier results, license levels, or digest status yourself. Never claim autonomy is earned unless the server evidence says so. When asked to run a Nebius episode, call run_autonomy_episode with policyMode "nebius", then read back the scenario, the action, pass or fail, the current license level, the evidence source, and the trusted/digest counts from the tool result.',
      },
    ],
    tools,
  },
  voice: { provider: 'vapi', voiceId: 'Elliot' },
}

const resp = await fetch('https://api.vapi.ai/assistant', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
  body: JSON.stringify(assistant),
})
const text = await resp.text()
console.log('create-assistant HTTP', resp.status)
try {
  const j = JSON.parse(text)
  console.log('assistant id:', j.id ?? '(none)')
  console.log('tool server url:', serverUrl)
  if (j.id) console.log('\nCall it from the Vapi dashboard (Assistants -> this one -> Talk to Assistant).')
} catch {
  console.log(text.slice(0, 500))
}
