# AI Agent Recommended Actions

This document explains how an external AI agent should use Clydesdale CRM.

## Job

Find the highest-value real estate actions and push them to the top of `Today`.

The agent should answer:

```txt
Who should the realtor contact right now, why, and what should they say?
```

## Product Model

The CRM has five user-facing surfaces:

- `Today`: ranked recommended actions
- `Pipeline`: pre-client board
- `Deals`: active client board
- `Campaigns`: warm-up at scale
- `Settings`: configuration

Do not create dashboards, reports, raw tables, bulk-send flows, or extra lifecycle pages.

## Data To Read

Use CRM API/data only. Do not invent facts.

Read:

- contacts
- pipeline stage
- deals
- tasks
- notes
- messages
- lead source
- last touch
- due dates
- opt-out status
- deal status
- client lifecycle events

## Recommended Action Shape

Every recommendation should have:

```json
{
  "person_id": "contact id",
  "deal_id": "optional deal id",
  "action_type": "call | text | email | approve | task | deal | check_in | move_stage",
  "title": "Call Ben Walsh",
  "reason": "Hot buyer lead. No completed call is logged yet.",
  "evidence": [
    "Lead stage",
    "High urgency",
    "No call logged"
  ],
  "suggested_message": "Hi Ben, saw your note. Are you free for a quick call today?",
  "priority": "High",
  "score": 94,
  "confidence": 88,
  "due_at": "2026-05-08T14:00:00.000Z",
  "status": "open"
}
```

## Ranking Rules

Rank higher when:

- New lead has not received a first touch.
- Hot lead has no completed call.
- Prospect is receiving value and should be moved toward an appointment.
- Client has converted but has no deal.
- Deal is stalled or has a deadline coming up.
- Past client is due for a client-for-life check-in.
- Task is overdue.
- AI draft is waiting for approval.

Rank lower when:

- Contact is opted out.
- A call or message already happened recently.
- Recommendation duplicates another open action.
- Contact is archived, closed-lost, or unqualified.

## Stage Logic

Pipeline stages:

- `lead`: contact info exists, no first response yet
- `relationship`: engaged, but no client-work has started
- `prospect`: receiving CMA, listings, market report, search, or similar value
- `client`: converted and should move to Deals

Deal stages:

- `met_with_client`
- `sending_listings`
- `active_client`
- `transaction`

Past clients should not clutter Pipeline. Surface them in Today only when they are due for a touch.

## Safety Rules

Never:

- delete records
- export the database
- bulk send
- change billing
- change permissions
- text or email opted-out contacts
- auto-send unless a user-approved workflow explicitly allows it

Default behavior:

```txt
AI drafts. Human approves.
```

## Current Implementation

The app currently includes a deterministic recommendation engine in:

```txt
src/lib/recommended-actions.ts
```

It powers:

```txt
/today
```

## API

List stored recommendations:

```http
GET /api/recommended-actions?status=open
```

Generate and upsert system recommendations from CRM data:

```http
POST /api/recommended-actions/generate
```

Upsert an external agent recommendation:

```http
POST /api/recommended-actions/upsert
Content-Type: application/json

{
  "externalKey": "agent:hot-lead:contact_123",
  "contactId": "contact_123",
  "actionType": "call",
  "title": "Call Ben Walsh",
  "reason": "Hot buyer lead. No completed call is logged yet.",
  "evidence": ["Lead stage", "High urgency", "No call logged"],
  "suggestedMessage": "Hi Ben, are you free for a quick call today?",
  "priority": "High",
  "score": 94,
  "confidence": 88,
  "dueAt": "2026-05-08T14:00:00.000Z"
}
```

Update, snooze, dismiss, stale, or complete a recommendation:

```http
PATCH /api/recommended-actions/{id}
Content-Type: application/json

{
  "status": "dismissed",
  "dismissReason": "Handled manually"
}
```

Valid statuses:

```txt
open
snoozed
done
dismissed
stale
```

External agents should use these endpoints and the safe command layer as it evolves.

## Contact Action API

Use this for direct contact actions exposed in the Today contact menu.

```http
POST /api/contact-actions
Content-Type: application/json

{
  "contactId": "contact_123",
  "action": "call",
  "body": "Call started by external agent."
}
```

Allowed actions:

```txt
call
send_text
voicemail_drop
ai_isa_call
```

Provider notes:

- `call` uses Twilio Voice when configured, otherwise logs the call attempt.
- `send_text` uses Twilio SMS when configured, otherwise logs/sends through the existing message abstraction.
- `voicemail_drop` is queued as a Slybroadcast placeholder.
- `ai_isa_call` is queued as a Vapi placeholder.
