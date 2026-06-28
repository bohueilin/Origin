// Reusable support form — Subject / Category / How can we help / File ticket. Used both
// in Account Settings → Support and in the proving-ground "Report it" popup, so they look
// and behave identically. Files to the RLS-scoped support_tickets table when signed in;
// falls back to an email prompt when not.
import { useState } from 'react'
import { fileTicket } from '../adminStore'
import { useAuth } from '../auth/AuthProvider'
import './supportForm.css'

export function SupportForm({ defaultCategory = 'general', onFiled }: { defaultCategory?: string; onFiled?: () => void }) {
  const auth = useAuth()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState(defaultCategory)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (!auth.user) {
      setMsg({ ok: false, text: 'Please sign in to file a ticket — or email support@origin.ai.' })
      return
    }
    setBusy(true)
    const ok = await fileTicket(subject, body, category)
    setBusy(false)
    if (!ok) { setMsg({ ok: false, text: 'Could not file the ticket. Try again, or email support@origin.ai.' }); return }
    setSubject(''); setBody('')
    setMsg({ ok: true, text: 'Thanks — your ticket was filed. We’ll get back to you.' })
    onFiled?.()
  }

  return (
    <form className="sf-form" onSubmit={submit}>
      <label className="sf-field"><span>Subject</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="Short summary" />
      </label>
      <label className="sf-field"><span>Category</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="general">General</option>
          <option value="account">Account</option>
          <option value="billing">Billing</option>
          <option value="bug">Bug report</option>
        </select>
      </label>
      <label className="sf-field"><span>How can we help?</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} required placeholder="Tell us what happened" />
      </label>
      {msg && <div className={`sf-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <div className="sf-actions">
        <button className="sf-submit" type="submit" disabled={busy}>{busy ? 'Filing…' : 'File ticket'}</button>
      </div>
    </form>
  )
}
