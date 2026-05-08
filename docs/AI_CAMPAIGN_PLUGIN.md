# Warhorse AI Campaign Plugin

Use this API when an external AI agent needs to draft a simple nurture sequence for Warhorse CRM.

## Generate A Campaign

`POST /api/ai/campaigns/generate`

```json
{
  "contactType": "buyer",
  "goal": "Convert buyer leads into appointments",
  "tone": "direct",
  "numberOfSteps": 5,
  "totalDurationDays": 14,
  "channels": ["sms", "email", "call"],
  "prompt": "Keep it concise and appointment-focused."
}
```

Allowed `contactType` values:

- `buyer`
- `seller`
- `tenant`
- `landlord`

Allowed channels:

- `sms`
- `email`
- `note`
- `call`

The endpoint returns structured JSON for review. It does not auto-send messages.

## Guardrails

- Do not invent facts about a lead, client, property, area, budget, or timeline.
- Do not bypass opt-out rules.
- Do not promise results the agent cannot guarantee.
- Keep campaigns simple: numbered steps, day offsets, one action per step.
- Text/email steps create drafts for approval.
- Task/call steps create reminders.

## LLM Key

The in-app builder uses a server-side LLM API key saved in Settings or `OPENAI_API_KEY`.

ChatGPT App/MCP OAuth is a future integration path. It is not required for this in-app campaign generator.
