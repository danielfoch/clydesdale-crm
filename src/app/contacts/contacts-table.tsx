"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Mail, MessageSquareText, Phone, Search, Send, UserRound } from "lucide-react";
import {
  assignContactAction,
  createDealAction,
  draftContactMessageAction,
  logCallAction,
  markTaskDoneAction,
  sendContactMessageAction,
  snoozeContactAction,
} from "@/app/actions";
import { inputClass } from "@/components/ui";
import { contactTypeBadgeClass, formatDue } from "@/lib/display";

type ContactMode = "call" | "text" | "email" | "details";

type MiniTask = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
};

export type ContactsTablePerson = {
  id: string;
  name: string;
  email: string;
  phone: string;
  stage: string;
  rawStage: string;
  type: string;
  rawType: string;
  urgency: string;
  urgencyScore: number;
  source: string;
  aiSummary: string | null;
  nextAction: string;
  nextActionReason: string | null;
  nextActionDue: string;
  nextActionDueIso: string;
  lastTouch: string;
  textDraft: string;
  emailSubject: string;
  emailDraft: string;
  callScript: string;
  notes: { body: string; createdAt: string }[];
  messages: { channel: string; status: string; body: string; createdAt: string }[];
  tasks: MiniTask[];
  deals: { id: string; name: string; stage: string; nextAction: string }[];
};

function scoreClass(score: number) {
  if (score >= 75) return "bg-[#fef3c7] text-[#78350f]";
  if (score >= 40) return "bg-[#e0f2fe] text-[#075985]";
  return "bg-[#ecfdf5] text-[#166534]";
}

function RowButton({
  children,
  active,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs transition hover:bg-[#f5f7f2] ${
        active ? "border-[#17231d] bg-[#17231d] text-white" : "border-[#cfd6ca] bg-white text-[#26352c]"
      }`}
    >
      {children}
    </button>
  );
}

function DraftPanel({ person, mode }: { person: ContactsTablePerson; mode: ContactMode }) {
  if (mode === "call") {
    return (
      <div className="grid gap-4 md:grid-cols-[1fr_260px]">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Recommended call script</div>
          <pre className="mt-2 whitespace-pre-wrap rounded bg-[#f6f7f4] p-3 text-sm leading-6 text-[#26352c]">{person.callScript}</pre>
        </div>
        <div className="space-y-2">
          {person.phone ? (
            <a href={`tel:${person.phone}`} className="flex w-full items-center justify-center gap-2 rounded bg-[#17231d] px-3 py-2 text-sm font-medium text-white hover:bg-[#26382f]">
              <Phone size={14} /> Open Dialer
            </a>
          ) : null}
          <form action={logCallAction}>
            <input type="hidden" name="contactId" value={person.id} />
            <input type="hidden" name="body" value={`Call started from Contacts. Script: ${person.callScript}`} />
            <button className="flex w-full items-center justify-center gap-2 rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">
              <Phone size={14} /> Start Twilio / Log Call
            </button>
          </form>
          <form action={snoozeContactAction}>
            <input type="hidden" name="contactId" value={person.id} />
            <input type="hidden" name="hours" value="24" />
            <button className="w-full rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">Snooze 1 day</button>
          </form>
        </div>
      </div>
    );
  }

  if (mode === "text") {
    return (
      <form action={sendContactMessageAction} className="space-y-3">
        <input type="hidden" name="contactId" value={person.id} />
        <input type="hidden" name="channel" value="sms" />
        <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Recommended text</div>
        <textarea name="body" className={inputClass} defaultValue={person.textDraft} rows={4} required />
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-2 rounded bg-[#17231d] px-3 py-2 text-sm font-medium text-white hover:bg-[#26382f]">
            <Send size={14} /> Send Text
          </button>
          <button formAction={draftContactMessageAction} className="rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">
            Save Draft
          </button>
        </div>
      </form>
    );
  }

  if (mode === "email") {
    return (
      <form action={draftContactMessageAction} className="space-y-3">
        <input type="hidden" name="contactId" value={person.id} />
        <input type="hidden" name="channel" value="email" />
        <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Recommended email</div>
        <input name="subject" className={inputClass} defaultValue={person.emailSubject} required />
        <textarea name="body" className={inputClass} defaultValue={person.emailDraft} rows={7} required />
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-2 rounded bg-[#17231d] px-3 py-2 text-sm font-medium text-white hover:bg-[#26382f]">
            <Mail size={14} /> Save Email Draft
          </button>
          <button formAction={sendContactMessageAction} className="rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">
            Send / Log Email
          </button>
        </div>
      </form>
    );
  }

  return <ContactDetails person={person} />;
}

function ContactDetails({ person }: { person: ContactsTablePerson }) {
  const dealType = ["buyer", "tenant", "seller", "landlord"].includes(person.rawType) ? person.rawType : "buyer";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr_260px]">
      <div className="space-y-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Contact card</div>
          <div className="mt-2 grid gap-2 rounded bg-[#f6f7f4] p-3 text-sm">
            <div><span className="font-medium text-[#17231d]">Stage:</span> {person.stage}</div>
            <div><span className="font-medium text-[#17231d]">Type:</span> {person.type}</div>
            <div><span className="font-medium text-[#17231d]">Source:</span> {person.source}</div>
            <div><span className="font-medium text-[#17231d]">Last touch:</span> {person.lastTouch}</div>
            <div><span className="font-medium text-[#17231d]">Due:</span> {person.nextActionDue}</div>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Next action</div>
          <p className="mt-2 rounded border border-[#e4e8df] bg-white p-3 text-sm">{person.nextAction}</p>
          {person.nextActionReason ? <p className="mt-1 text-xs text-[#68736a]">{person.nextActionReason}</p> : null}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Notes</div>
          <div className="mt-2 space-y-2">
            {person.notes.length ? person.notes.map((note, index) => (
              <p key={`${note.createdAt}-${index}`} className="rounded border border-[#e4e8df] bg-white p-3 text-sm text-[#5f6a62]">{note.body}</p>
            )) : <p className="text-sm text-[#68736a]">No notes yet.</p>}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Open tasks</div>
          <div className="mt-2 space-y-2">
            {person.tasks.length ? person.tasks.map((task) => (
              <form key={task.id} action={markTaskDoneAction} className="flex items-center justify-between gap-3 rounded border border-[#e4e8df] bg-white p-3 text-sm">
                <input type="hidden" name="taskId" value={task.id} />
                <div>
                  <div className="font-medium">{task.title}</div>
                  <div className="text-xs text-[#68736a]">{task.dueAt ? formatDue(new Date(task.dueAt)) : "No due date"} · {task.status}</div>
                </div>
                <button className="rounded bg-[#dcfce7] px-2 py-1 text-xs font-medium text-[#14532d]">Done</button>
              </form>
            )) : <p className="text-sm text-[#68736a]">No tasks.</p>}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Recent history</div>
          <div className="mt-2 space-y-2">
            {person.messages.length ? person.messages.map((message, index) => (
              <div key={`${message.createdAt}-${index}`} className="rounded border border-[#e4e8df] bg-white p-3 text-sm">
                <div className="mb-1 text-xs text-[#68736a]">{message.channel} · {message.status}</div>
                <p className="line-clamp-3 text-[#5f6a62]">{message.body}</p>
              </div>
            )) : <p className="text-sm text-[#68736a]">No messages yet.</p>}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Deals</div>
          <div className="mt-2 space-y-2">
            {person.deals.length ? person.deals.map((deal) => (
              <Link key={deal.id} href="/deals" className="block rounded border border-[#e4e8df] bg-white p-3 text-sm hover:bg-[#f5f7f2]">
                <div className="font-medium">{deal.name}</div>
                <div className="text-xs text-[#68736a]">{deal.stage} · {deal.nextAction}</div>
              </Link>
            )) : <p className="text-sm text-[#68736a]">No deals yet.</p>}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <form action={logCallAction}>
          <input type="hidden" name="contactId" value={person.id} />
          <input type="hidden" name="body" value={`Call started from Contacts details. Script: ${person.callScript}`} />
          <button className="flex w-full items-center justify-center gap-2 rounded bg-[#17231d] px-3 py-2 text-sm font-medium text-white hover:bg-[#26382f]">
            <Phone size={14} /> Call
          </button>
        </form>
        <form action={snoozeContactAction}>
          <input type="hidden" name="contactId" value={person.id} />
          <input type="hidden" name="hours" value="24" />
          <button className="w-full rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">Snooze</button>
        </form>
        <form action={assignContactAction}>
          <input type="hidden" name="contactId" value={person.id} />
          <button className="w-full rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">Assign</button>
        </form>
        <form action={createDealAction}>
          <input type="hidden" name="contactId" value={person.id} />
          <input type="hidden" name="name" value={`${person.name} client work`} />
          <input type="hidden" name="type" value={dealType} />
          <input type="hidden" name="stage" value="met_with_client" />
          <input type="hidden" name="nextAction" value="Confirm client criteria and deal plan" />
          <button className="w-full rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">Create Deal</button>
        </form>
        <Link href={`/people/${person.id}`} className="block w-full rounded border border-[#cfd6ca] px-3 py-2 text-center text-sm hover:bg-[#f5f7f2]">
          Full Profile
        </Link>
      </div>
    </div>
  );
}

export function ContactsTable({ people }: { people: ContactsTablePerson[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<{ id: string; mode: ContactMode } | null>(null);
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return people;
    return people.filter((person) =>
      [person.name, person.phone, person.email, person.type, person.stage, person.nextAction]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(value)),
    );
  }, [people, query]);

  function toggle(id: string, mode: ContactMode) {
    setOpen((current) => current?.id === id && current.mode === mode ? null : { id, mode });
  }

  return (
    <section className="rounded-md border border-[#d9ded5] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#e4e8df] p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">All contacts · {filtered.length}</h2>
          <p className="mt-1 text-xs text-[#68736a]">Call, text, email, or expand without leaving the table.</p>
        </div>
        <label className="flex w-full items-center gap-2 rounded border border-[#cfd6ca] bg-white px-3 py-2 text-sm md:max-w-sm">
          <Search size={15} className="text-[#68736a]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contacts"
            className="w-full bg-transparent outline-none"
          />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-left text-sm">
          <thead className="bg-[#f6f7f4] text-xs uppercase tracking-normal text-[#68736a]">
            <tr>
              <th className="px-4 py-3 font-semibold">Person</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Next action</th>
              <th className="px-4 py-3 text-right font-semibold">Open</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((person) => {
              const isOpen = open?.id === person.id;
              return (
                <Fragment key={person.id}>
                  <tr className="border-t border-[#edf0ea] align-middle hover:bg-[#fbfcf8]">
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid size-9 shrink-0 place-items-center rounded bg-[#edf1e9] text-xs font-semibold text-[#304037]">
                          {person.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <Link href={`/people/${person.id}`} className="font-semibold text-[#17231d] hover:underline">{person.name}</Link>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${contactTypeBadgeClass(person.rawType)}`}>{person.type}</span>
                            <span className="rounded bg-[#e9efe6] px-2 py-0.5 text-[11px] text-[#304037]">{person.stage}</span>
                            <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${scoreClass(person.urgencyScore)}`}>{person.urgency}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="min-w-[112px] text-[#26352c]">{person.phone || "No phone"}</span>
                        <RowButton active={isOpen && open.mode === "call"} onClick={() => toggle(person.id, "call")} label={`Call ${person.name}`}>
                          <Phone size={13} /> Call
                        </RowButton>
                        <RowButton active={isOpen && open.mode === "text"} onClick={() => toggle(person.id, "text")} label={`Text ${person.name}`}>
                          <MessageSquareText size={13} /> Text
                        </RowButton>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="max-w-[210px] truncate text-[#26352c]">{person.email || "No email"}</span>
                        <RowButton active={isOpen && open.mode === "email"} onClick={() => toggle(person.id, "email")} label={`Email ${person.name}`}>
                          <Mail size={13} /> Email
                        </RowButton>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[280px]">
                        <p className="line-clamp-1 font-medium text-[#26352c]">{person.nextAction}</p>
                        <p className="mt-1 text-xs text-[#68736a]">{person.nextActionDue} · last touch {person.lastTouch}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggle(person.id, "details")}
                        aria-expanded={isOpen && open.mode === "details"}
                        aria-label={`Expand ${person.name}`}
                        className={`inline-grid size-9 place-items-center rounded border transition hover:bg-[#f5f7f2] ${
                          isOpen && open.mode === "details" ? "border-[#17231d] bg-[#17231d] text-white" : "border-[#cfd6ca] bg-white"
                        }`}
                      >
                        {isOpen && open.mode === "details" ? <ChevronDown size={16} /> : <UserRound size={16} />}
                      </button>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="border-t border-[#edf0ea] bg-[#fbfcf8]">
                      <td colSpan={5} className="px-4 py-4">
                        <DraftPanel person={person} mode={open.mode} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {!filtered.length ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-[#68736a]">
                  No contacts found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
