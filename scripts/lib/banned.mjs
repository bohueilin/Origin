// 1. BANNED — regex + human label. Matched case-insensitively against visible text.
export const BANNED = [
  [/\bunhackable\b/i, 'claims code is unhackable'],
  [/\bbulletproof\b/i, 'claims bulletproof security'],
  [/\bprovably safe\b/i, '"provably safe" — we prove reproducibility, not safety'],
  [/\b100%\s*(safe|secure|accurate|reliable)\b/i, 'claims 100% safe/secure/accurate'],
  [/\bzero[-\s]?risk\b/i, 'claims zero risk'],
  [/\bmilitary[-\s]?grade\b/i, 'empty "military-grade" superlative'],
  [/\bcannot be (hacked|breached|fooled|bypassed)\b/i, 'absolute "cannot be X" claim'],
  [/\bguarantees?\s+(safety|security|correctness|compliance)\b/i, 'guarantees safety/security/correctness'],
  [/\bcompletely (safe|secure)\b/i, 'claims completely safe/secure'],
  [/\b(fully|totally) (safe|secure|autonomous)\b/i, 'absolute "fully/totally safe/secure/autonomous"'],
  [/\bnever fails\b/i, 'claims it never fails'],
  [/\bprevents (all|every|any|prompt injection\b)/i, 'claims to PREVENT (we contain, we do not prevent)'],
  [/\bguaranteed safe\b/i, '"guaranteed safe" — we say "reproducible under this verifier," never "safe"'],
  [/\bcan['’]?t (cheat|reward[-\s]?hack|be tricked|be gamed)\b/i, 'absolute "can\'t cheat/reward-hack/be tricked" (cheating scores zero — it is not impossible)'],
  // "certification" is legally reserved for accredited bodies (TÜV, UL, SGS, exida, CertX —
  // all now NVIDIA Halos partners). Said in a robotics/safety context it ends the
  // conversation, and Origin issues no certificates: the customer's gate decides.
  // Use: release gate, admission control, evidence, independently verifiable record.
  // Scoped deliberately to AFFIRMATIVE equations only. Negated disclaimers ("not a
  // regulatory certification", "not reviewer-accepted or certified") and scoped
  // definitions ('"Certified" here means …') are the APPROVED phrasings and must keep
  // passing — flagging them would train people to delete the disclaimer, which is worse
  // than the word. So match the shape that actually overclaims: asserting that some
  // artifact IS a certificate.
  [/\bsafety certificate\b/i, '"safety certificate" — a trace is evidence, not a certificate'],
  // Bare assurance adverbs. The banned-word list has always included safe/secure, but
  // the gate had NO rule for them — so "Approve it safely" and "We send this securely
  // to our team" both shipped through a green lint. A gate that reports clean while
  // the words it exists to catch are on the page is worse than no gate: it gives the
  // person relying on it false assurance, which for this company is the worst possible
  // category of bug.
  //
  // Scoped to the ADVERBS and to copular assertions. The approved phrasings — the
  // negated form (never "safe" or "correct"), quoted prior-work descriptions, and
  // hyphenated domain compounds like frontier-safety — must keep passing, or people
  // learn to delete the disclaimer instead of the claim.
  [/\b(safely|securely)\b/i, 'bare "safely"/"securely" — we say "reproducible under this verifier," never an assurance adverb'],
  [/\b(is|are|keeps?|makes?)\s+(it\s+|you\s+|your\s+\w+\s+)?(safe|secure)\b/i, 'asserts something IS safe/secure — scope the claim to the verifier instead'],

  [/\b(is|are|as)\s+(the\s+|a\s+|your\s+)?(safety\s+|compliance\s+)?certificates?\b/i, 'asserts an artifact IS a certificate — Origin issues none; say evidence / independently verifiable record'],
  [/\bwe\s+certify\b/i, '"we certify" — Origin does not certify; the customer\'s gate decides'],
  [/\bbrain that can['’]?t\b/i, 'absolute "a brain that can\'t X" claim'],
  [/\bprovably (means )?safer\b/i, '"provably safer" — the oracle proves reproducibility of a score, not safety'],
  [/\bcan never reward[-\s]?hack\b/i, 'absolute "can never reward-hack" (the verifier itself is the attack surface Cobra/Chronos harden)'],
  // Found by the 2026-09-24 design review. Origin serves the verifier JS and owns the
  // battery and oracle, and public browser evidence verifies as UNTRUSTED, so a reader
  // does not verify "without trusting us"; the scope that is true is "without trusting
  // our server" (packages/verifier-core/sigil.mjs).
  [/\bwithout trusting us\b/i, '"without trusting us" — the verifier, battery and oracle are Origin\'s; say what is checked offline instead'],
  // There are no design partners, pilots or customers today (index.html #evidence,
  // llms.txt). Onboarding and procurement copy implies a customer pipeline that does not exist.
  [/\bwe['’]re onboarding\b/i, '"we\'re onboarding" — there are no design partners or customers to onboard today'],
  [/\bno procurement (required|needed)\b/i, '"no procurement required" — procurement is the customer\'s process, not Origin\'s to waive'],
  // The gates strip reads a LOCAL `make gates-all` run; no CI job writes it.
  [/\benforced in CI on every push\b/i, '"enforced in CI on every push" — the gates summary is a local run; CI runs its own checks'],
  // The tool evaluates a selected policy; it never contacts or executes the named agent.
  [/\bcheck an agent\b/i, '"check an agent" — the reference check evaluates a selected policy, not the agent'],
  // /auth is owner-only (AuthProvider.tsx; insforge.toml disable_signup): nobody is invited.
  [/\binvite[-\s]only\b/i, '"invite-only" — the console is owner-only; there are no invited customer accounts'],
]

// Shared by prose, social-card and recording-caption checks.
export function checkText(text) {
  const normalized = String(text).replace(/\s+/g, ' ').trim()
  return BANNED.flatMap(([pattern, label]) => {
    const match = normalized.match(pattern)
    return match ? [{ label, match: match[0].trim() }] : []
  })
}
