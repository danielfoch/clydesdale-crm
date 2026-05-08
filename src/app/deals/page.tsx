import { PageHeader } from "@/components/ui";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { DealsBoard, type BoardDeal } from "./deals-board";

export const dynamic = "force-dynamic";

async function getDeals(): Promise<BoardDeal[]> {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const deals = await db.deal.findMany({
    where: { workspaceId, stage: { not: "closed" } },
    include: {
      primaryContact: { include: { emails: true, phones: true } },
      participants: { include: { contact: { include: { emails: true, phones: true } } } },
      crmTasks: { orderBy: { createdAt: "asc" }, take: 20 },
    },
    orderBy: [{ riskLevel: "desc" }, { nextActionDueAt: "asc" }],
  });

  return deals.map((deal) => {
    const participantContact = deal.participants[0]?.contact ?? null;
    const primaryContact = deal.primaryContact
      ? {
          id: deal.primaryContact.id,
          name: deal.primaryContact.name,
          urgencyScore: deal.primaryContact.urgencyScore,
          email: deal.primaryContact.emails[0]?.email,
          phone: deal.primaryContact.phones[0]?.phone,
        }
      : null;
    const contact = participantContact
      ? {
          id: participantContact.id,
          name: participantContact.name,
          urgencyScore: participantContact.urgencyScore,
          email: participantContact.emails[0]?.email,
          phone: participantContact.phones[0]?.phone,
        }
      : null;

    return {
      id: deal.id,
      name: deal.name,
      type: deal.type,
      stage: deal.stage,
      valueCents: deal.valueCents,
      propertyAddress: deal.propertyAddress,
      nextAction: deal.nextAction,
      nextActionDueAt: deal.nextActionDueAt.toISOString(),
      riskLevel: deal.riskLevel,
      notes: deal.notes,
      primaryContact,
      contact,
      tasks: deal.crmTasks.map((task) => ({
        id: task.id,
        title: task.title,
        type: task.type,
        status: task.status,
        dueAt: task.dueAt?.toISOString() ?? null,
        completedAt: task.completedAt?.toISOString() ?? null,
      })),
    };
  });
}

export default async function DealsPage() {
  const deals = await getDeals();

  return (
    <>
      <PageHeader title="Deals" subtitle="Who is already a client and what stage are they in?" />
      <DealsBoard deals={deals} />
    </>
  );
}
