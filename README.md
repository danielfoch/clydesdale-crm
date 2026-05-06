# Clydesdale CRM

Lean realtor revenue machine built with Next.js App Router, TypeScript, Tailwind, Prisma, and Postgres.

The product is organized around one rule: every lead, client, deal, and past client needs one clear next action.

## Main Screens

- `Today`: new leads, due follow-ups, AI drafts to approve, deals at risk, past clients due.
- `People`: searchable relationship list and fast lead add.
- `Deals`: buyer, tenant, seller, and landlord pipeline with next action and risk.
- `Campaigns`: recipes, sentence workflows, RSS/Substack content repurposing, newsletter drafts.
- `Settings`: team, sources, Gmail/Twilio placeholders, AI, webhooks, compliance.

## Local Setup

```bash
npm install
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

If you already have Postgres, set `DATABASE_URL` in `.env` and skip Docker.

## Verification

```bash
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build
```

## Webhook Smoke Test

```bash
curl -X POST http://localhost:3000/api/intake/webhook \
  -H 'content-type: application/json' \
  -d '{
    "source": "facebook",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "+15555555555",
    "message": "Looking to buy downtown",
    "raw": {}
  }'
```

This creates a contact, lead event, AI classification, task, draft message, webhook event, audit log, and next action.

## Agent Command Smoke Test

```bash
curl -X POST http://localhost:3000/api/agent/commands \
  -H 'content-type: application/json' \
  -d '{
    "command": "create_note",
    "contactId": "CONTACT_ID",
    "body": "External agent added this scoped note."
  }'
```

Allowed agent commands are `create_note`, `draft_email`, `draft_sms`, `create_task`, `update_stage`, `start_campaign`, `suggest_next_action`, and `request_human_approval`.
