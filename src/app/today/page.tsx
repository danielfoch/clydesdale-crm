import Link from "next/link";
import { BriefcaseBusiness, ChevronDown, Mail, MessageSquareText, Phone, Timer, UserRound } from "lucide-react";
import {
  approveDraftAction,
  assignContactAction,
  assignDealAction,
  completeLifecycleTouchAction,
  createDealAction,
  logCallAction,
  markTaskDoneAction,
  queueAiIsaCallAction,
  queueVoicemailDropAction,
  sendContactMessageAction,
  snoozeContactAction,
  snoozeDealAction,
} from "@/app/actions";
import { Button, PageHeader, Panel } from "@/components/ui";
import { contactTypeLabel, formatDue, stageLabel } from "@/lib/display";
import { getPrisma } from "@/lib/prisma";
import { getTodayRecommendations, type TodayRecommendation } from "@/lib/recommended-actions";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

function SecondaryButton({ children }: { children: React.ReactNode }) {
  return <button className="rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">{children}</button>;
}

function PriorityBadge({ priority }: { priority: TodayRecommendation["priority"] }) {
  const className =
    priority === "High"
      ? "bg-[#fef3c7] text-[#78350f]"
      : priority === "Medium"
        ? "bg-[#e0f2fe] text-[#075985]"
        : "bg-[#ecfdf5] text-[#166534]";
  return <span className={`rounded px-2 py-1 text-xs font-semibold ${className}`}>{priority}</span>;
}

function ContactMenu({ item }: { item: TodayRecommendation & { contact: NonNullable<TodayRecommendation["contact"]> } }) {
  const defaultText = item.suggestedMessage ?? `Hi ${item.contact.name.split(" ")[0] || "there"}, quick check-in. Are you free for a quick call today?`;

  return (
    <details className="relative [&>summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer rounded bg-[#17231d] px-3 py-2 text-sm font-medium text-white hover:bg-[#26382f]">
        Contact
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-[min(92vw,340px)] space-y-3 rounded-md border border-[#d9ded5] bg-white p-4 shadow-xl">
        <div>
          <div className="text-sm font-semibold">{item.contact.name}</div>
          <div className="mt-1 text-xs text-[#68736a]">{item.contact.phone ?? item.contact.email ?? "No contact info"}</div>
        </div>
        <div className="grid gap-2">
          <form action={logCallAction}>
            <input type="hidden" name="contactId" value={item.contact.id} />
            <input type="hidden" name="body" value="Call started from Today contact menu." />
            <button className="flex w-full items-center justify-between rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">
              <span className="inline-flex items-center gap-2"><Phone size={14} /> Call</span>
              <span className="text-xs text-[#68736a]">{item.contact.phone ?? "No phone"}</span>
            </button>
          </form>
          <form action={sendContactMessageAction}>
            <input type="hidden" name="contactId" value={item.contact.id} />
            <input type="hidden" name="channel" value="sms" />
            <input type="hidden" name="body" value={defaultText} />
            <button className="flex w-full items-center gap-2 rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">
              <MessageSquareText size={14} /> Send text
            </button>
          </form>
          <form action={queueVoicemailDropAction}>
            <input type="hidden" name="contactId" value={item.contact.id} />
            <input type="hidden" name="body" value="Voicemail drop queued from Today contact menu." />
            <button className="flex w-full items-center gap-2 rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">
              <Phone size={14} /> Send voicemail drop
            </button>
          </form>
          <form action={queueAiIsaCallAction}>
            <input type="hidden" name="contactId" value={item.contact.id} />
            <input type="hidden" name="body" value="AI ISA call queued from Today contact menu." />
            <button className="flex w-full items-center gap-2 rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">
              <UserRound size={14} /> Send AI ISA call
            </button>
          </form>
          <form action={snoozeContactAction}>
            <input type="hidden" name="contactId" value={item.contact.id} />
            <input type="hidden" name="hours" value="24" />
            <button className="flex w-full items-center gap-2 rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">
              <Timer size={14} /> Snooze
            </button>
          </form>
        </div>
      </div>
    </details>
  );
}

function PrimaryAction({ item }: { item: TodayRecommendation }) {
  if (item.messageId) {
    return (
      <form action={approveDraftAction}>
        <input type="hidden" name="messageId" value={item.messageId} />
        <Button>Approve</Button>
      </form>
    );
  }

  if (item.taskId) {
    return (
      <form action={markTaskDoneAction}>
        <input type="hidden" name="taskId" value={item.taskId} />
        <Button>Done</Button>
      </form>
    );
  }

  if (item.lifecycleEventId) {
    return (
      <form action={completeLifecycleTouchAction}>
        <input type="hidden" name="eventId" value={item.lifecycleEventId} />
        <Button>Approve</Button>
      </form>
    );
  }

  if (!item.contact) return null;

  if (item.actionType === "deal" && !item.deal) {
    const dealType = ["buyer", "tenant", "seller", "landlord"].includes(item.contact.type) ? item.contact.type : "buyer";
    return (
      <form action={createDealAction}>
        <input type="hidden" name="contactId" value={item.contact.id} />
        <input type="hidden" name="name" value={`${item.contact.name} client work`} />
        <input type="hidden" name="type" value={dealType} />
        <input type="hidden" name="stage" value="met_with_client" />
        <input type="hidden" name="nextAction" value="Confirm client criteria and deal plan" />
        <Button>Convert</Button>
      </form>
    );
  }

  return <ContactMenu item={item as TodayRecommendation & { contact: NonNullable<TodayRecommendation["contact"]> }} />;
}

function SecondaryActions({ item }: { item: TodayRecommendation }) {
  return (
    <div className="flex flex-wrap gap-2">
      {item.contact ? (
        <>
          <form action={logCallAction}>
            <input type="hidden" name="contactId" value={item.contact.id} />
            <input type="hidden" name="body" value="Call started from Today details." />
            <button className="inline-flex items-center gap-1.5 rounded border border-[#cfd6ca] px-2.5 py-1.5 text-xs hover:bg-[#f5f7f2]">
              <Phone size={13} /> Call
            </button>
          </form>
          {item.suggestedMessage ? (
            <form action={sendContactMessageAction}>
              <input type="hidden" name="contactId" value={item.contact.id} />
              <input type="hidden" name="channel" value="sms" />
              <input type="hidden" name="body" value={item.suggestedMessage} />
              <button className="inline-flex items-center gap-1.5 rounded border border-[#cfd6ca] px-2.5 py-1.5 text-xs hover:bg-[#f5f7f2]">
                <MessageSquareText size={13} /> Text
              </button>
            </form>
          ) : null}
          {item.suggestedMessage ? (
            <form action={sendContactMessageAction}>
              <input type="hidden" name="contactId" value={item.contact.id} />
              <input type="hidden" name="channel" value="email" />
              <input type="hidden" name="subject" value="Quick follow-up" />
              <input type="hidden" name="body" value={item.suggestedMessage} />
              <button className="inline-flex items-center gap-1.5 rounded border border-[#cfd6ca] px-2.5 py-1.5 text-xs hover:bg-[#f5f7f2]">
                <Mail size={13} /> Email
              </button>
            </form>
          ) : null}
          <form action={snoozeContactAction}>
            <input type="hidden" name="contactId" value={item.contact.id} />
            <input type="hidden" name="hours" value="24" />
            <button className="inline-flex items-center gap-1.5 rounded border border-[#cfd6ca] px-2.5 py-1.5 text-xs hover:bg-[#f5f7f2]">
              <Timer size={13} /> Snooze
            </button>
          </form>
          <form action={assignContactAction}>
            <input type="hidden" name="contactId" value={item.contact.id} />
            <SecondaryButton>Assign</SecondaryButton>
          </form>
        </>
      ) : null}

      {item.deal ? (
        <>
          <form action={snoozeDealAction}>
            <input type="hidden" name="dealId" value={item.deal.id} />
            <input type="hidden" name="hours" value="24" />
            <SecondaryButton>Snooze Deal</SecondaryButton>
          </form>
          <form action={assignDealAction}>
            <input type="hidden" name="dealId" value={item.deal.id} />
            <SecondaryButton>Assign Deal</SecondaryButton>
          </form>
        </>
      ) : null}
    </div>
  );
}

function RecommendationRow({ item, index }: { item: TodayRecommendation; index: number }) {
  return (
    <article className="py-3">
      <div className="grid gap-3 md:grid-cols-[40px_1.2fr_1fr_auto] md:items-center">
        <div className="grid size-8 place-items-center rounded bg-[#edf1e9] text-sm font-semibold text-[#304037]">{index + 1}</div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={item.priority} />
            {item.contact ? <UserRound size={15} className="text-[#68736a]" /> : <BriefcaseBusiness size={15} className="text-[#68736a]" />}
            <Link href={item.contact ? `/people/${item.contact.id}` : item.deal ? "/deals" : "/today"} className="truncate font-semibold hover:underline">
              {item.title}
            </Link>
          </div>
          <p className="mt-1 text-sm text-[#5f6a62]">{item.reason}</p>
        </div>
        <div className="min-w-0">
          <p className="line-clamp-1 text-sm font-medium text-[#26352c]">{item.suggestedMessage ?? item.evidence[0]}</p>
          <p className="mt-1 text-xs text-[#68736a]">
            {item.contact ? `${contactTypeLabel(item.contact.type)} · ${stageLabel(item.contact.stage)}` : item.deal ? `${contactTypeLabel(item.deal.type)} · ${stageLabel(item.deal.stage)}` : "CRM action"} · {formatDue(item.dueAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PrimaryAction item={item} />
          <details className="relative [&>summary::-webkit-details-marker]:hidden">
            <summary className="grid size-9 cursor-pointer place-items-center rounded border border-[#cfd6ca] hover:bg-[#f5f7f2]" aria-label="Open context">
              <ChevronDown size={16} />
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-[min(92vw,520px)] rounded-md border border-[#d9ded5] bg-white p-4 shadow-xl">
              <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
                <div>
                  <h3 className="text-sm font-semibold">Why this matters</h3>
                  <ul className="mt-2 space-y-1 text-sm text-[#5f6a62]">
                    {item.evidence.map((line) => <li key={line}>• {line}</li>)}
                  </ul>
                  <p className="mt-3 text-xs text-[#68736a]">Score {item.score}/100 · {item.confidence}% confidence</p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Context</h3>
                  <div className="mt-2 space-y-1 text-sm text-[#5f6a62]">
                    {item.contact ? <div>{item.contact.name} · {item.contact.phone ?? item.contact.email ?? "No contact info"}</div> : null}
                    {item.deal ? <div>{item.deal.name} · {stageLabel(item.deal.stage)}</div> : null}
                    <div>Due: {formatDue(item.dueAt)}</div>
                  </div>
                </div>
              </div>
              {item.suggestedMessage ? (
                <div className="mt-4 rounded bg-[#f6f7f4] p-3">
                  <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Suggested message</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[#26352c]">{item.suggestedMessage}</p>
                </div>
              ) : null}
              <div className="mt-4">
                <SecondaryActions item={item} />
              </div>
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}

export default async function TodayPage() {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const recommendations = await getTodayRecommendations(db, workspaceId);

  return (
    <>
      <PageHeader title="Today" subtitle="Your highest-value actions, ranked by AI." />
      <Panel title="What should I do now?">
        {recommendations.length ? (
          <div className="divide-y divide-[#edf0ea]">
            {recommendations.map((item, index) => <RecommendationRow key={item.id} item={item} index={index} />)}
          </div>
        ) : (
          <div className="rounded border border-dashed border-[#d9ded5] p-6 text-sm text-[#68736a]">
            No urgent moves right now. Pipeline and Deals are clean.
          </div>
        )}
      </Panel>
    </>
  );
}
