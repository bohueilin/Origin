# Plant operating policy (unstructured domain rules)

The agent must satisfy these written policies in addition to the hard schema
constraints. They mirror tau-bench's "domain-specific policy doc": prose the agent
has to read, interpret, and apply — not machine-readable fields. The verifier
encodes the checkable subset; the rest tests judgment.

## Safety (unattended operation)
- Any machine with `uptime < 0.9` is **degraded**: schedule an `inspect` safety
  action on it before its first operation, or take it `lockout` and route around it.
- A `robot` operator must not run more than 16 continuous hours without a
  `slowdown` safety action; humans follow their `availability` windows.
- Never schedule any operation inside a machine's maintenance window.

## Commercial
- Do not promise a `due_day` you cannot meet; if a job cannot finish on time,
  prefer to `delay_job` and send a `delay_warning` customer message over silently
  shipping late.
- Only `accept` an RFQ if its `target_price_per_unit` exceeds your `est_unit_cost`
  and you have capacity before its `due_day`.
- Expedite material only when the resulting on-time revenue exceeds the expedite cost.

## Quality
- A job whose last operation is rushed past its due window should be `rework`,
  not `ship`, unless the customer explicitly accepts late delivery.
