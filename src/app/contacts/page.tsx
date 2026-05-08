import { PageHeader } from "@/components/ui";
import { contactTypeLabel, formatDue, stageLabel, urgencyLabel } from "@/lib/display";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { ContactsTable, type ContactsTablePerson } from "./contacts-table";

export const dynamic = "force-dynamic";

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function buildTextDraft(person: {
  name: string;
  type: string;
  nextAction: string;
  suggestedFirstResponse: string | null;
}) {
  if (person.suggestedFirstResponse) return person.suggestedFirstResponse;
  return `Hi ${firstName(person.name)}, it's Daniel. Quick follow-up on your ${contactTypeLabel(person.type).toLowerCase()} plans. ${person.nextAction}`;
}

function buildEmailDraft(person: {
  name: string;
  type: string;
  aiSummary: string | null;
  nextAction: string;
}) {
  return `Hi ${firstName(person.name)},

Wanted to follow up on your ${contactTypeLabel(person.type).toLowerCase()} plans.

${person.aiSummary ?? person.nextAction}

What is the best next step on your end?

Best,
Daniel`;
}

function buildCallScript(person: {
  name: string;
  type: string;
  aiSummary: string | null;
  nextAction: string;
}) {
  return `Hey ${firstName(person.name)}, it's Daniel. I saw your ${contactTypeLabel(person.type).toLowerCase()} notes and wanted to make this easy.

Quick question: ${person.nextAction}

If now is not a good time, what is the best next step and timing?`;
}

async function getContacts(): Promise<ContactsTablePerson[]> {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const contacts = await db.contact.findMany({
    where: { workspaceId, stage: { not: "archived" } },
    include: {
      emails: { orderBy: { isPrimary: "desc" }, select: { email: true } },
      phones: { orderBy: { isPrimary: "desc" }, select: { phone: true } },
      notes: { orderBy: { createdAt: "desc" }, take: 2, select: { body: true, createdAt: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 2, select: { channel: true, status: true, body: true, createdAt: true } },
      tasks: { orderBy: { dueAt: "asc" }, take: 3, select: { id: true, title: true, status: true, dueAt: true } },
      primaryDeals: { orderBy: { updatedAt: "desc" }, take: 2, select: { id: true, name: true, stage: true, nextAction: true } },
      dealParticipants: {
        orderBy: { deal: { updatedAt: "desc" } },
        take: 2,
        include: { deal: { select: { id: true, name: true, stage: true, nextAction: true } } },
      },
    },
    orderBy: [{ nextActionDueAt: "asc" }, { urgencyScore: "desc" }, { updatedAt: "desc" }],
  });

  return contacts.map((person) => {
    const email = person.emails[0]?.email ?? "";
    const phone = person.phones[0]?.phone ?? "";
    const deals = [
      ...person.primaryDeals,
      ...person.dealParticipants.map((participant) => participant.deal),
    ].filter((deal, index, all) => all.findIndex((item) => item.id === deal.id) === index);

    return {
      id: person.id,
      name: person.name,
      email,
      phone,
      stage: stageLabel(person.stage),
      rawStage: person.stage,
      type: contactTypeLabel(person.type),
      rawType: person.type,
      urgency: urgencyLabel(person.urgencyScore),
      urgencyScore: person.urgencyScore,
      source: person.source ?? "Unknown",
      aiSummary: person.aiSummary,
      nextAction: person.nextAction,
      nextActionReason: person.nextActionReason,
      nextActionDue: formatDue(person.nextActionDueAt),
      nextActionDueIso: person.nextActionDueAt.toISOString(),
      lastTouch: person.lastTouchAt ? formatDue(person.lastTouchAt) : "No touch yet",
      textDraft: buildTextDraft(person),
      emailSubject: `Quick follow-up, ${firstName(person.name)}`,
      emailDraft: buildEmailDraft(person),
      callScript: buildCallScript(person),
      notes: person.notes.map((note) => ({ body: note.body, createdAt: note.createdAt.toISOString() })),
      messages: person.messages.map((message) => ({
        channel: message.channel,
        status: message.status,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      })),
      tasks: person.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        dueAt: task.dueAt?.toISOString() ?? null,
      })),
      deals,
    };
  });
}

export default async function ContactsPage() {
  const contacts = await getContacts();

  return (
    <>
      <PageHeader title="Contacts" subtitle="Find anyone fast, then call, text, or email from one simple list." />
      <ContactsTable people={contacts} />
    </>
  );
}
