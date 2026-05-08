import { PageHeader, Panel } from "@/components/ui";
import { getLeaderboard } from "@/lib/leaderboard";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "No actions yet";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function metricLabel(value: number, singular: string) {
  return `${value} ${value === 1 ? singular : `${singular}s`}`;
}

export default async function LeaderboardPage() {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const rows = await getLeaderboard(workspaceId, db);
  const leader = rows[0];

  return (
    <>
      <PageHeader title="Leaderboard" subtitle="Rank CRM users by real actions taken." />
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-[#d9ded5] bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Leader</div>
          <div className="mt-2 text-lg font-semibold">{leader?.name ?? "No users"}</div>
          <div className="text-sm text-[#5f6a62]">{leader ? metricLabel(leader.total, "action") : "No actions yet"}</div>
        </div>
        <div className="rounded-md border border-[#d9ded5] bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Team actions</div>
          <div className="mt-2 text-lg font-semibold">{rows.reduce((sum, row) => sum + row.total, 0)}</div>
          <div className="text-sm text-[#5f6a62]">All tracked CRM actions</div>
        </div>
        <div className="rounded-md border border-[#d9ded5] bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Last 7 days</div>
          <div className="mt-2 text-lg font-semibold">{rows.reduce((sum, row) => sum + row.last7Days, 0)}</div>
          <div className="text-sm text-[#5f6a62]">Recent action count</div>
        </div>
        <div className="rounded-md border border-[#d9ded5] bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Users ranked</div>
          <div className="mt-2 text-lg font-semibold">{rows.length}</div>
          <div className="text-sm text-[#5f6a62]">Workspace members</div>
        </div>
      </div>

      <Panel title="Action leaderboard">
        {rows.length ? (
          <div className="space-y-3">
            {rows.map((row, index) => (
              <article key={row.userId} className="rounded-md border border-[#e1e6dc] bg-[#fbfcfa] p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded bg-[#17231d] text-sm font-semibold text-white">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-[#17231d]">{row.name}</div>
                      <div className="text-sm text-[#5f6a62]">{row.email} · {row.role}</div>
                    </div>
                  </div>
                  <div className="text-left md:text-right">
                    <div className="text-2xl font-semibold text-[#17231d]">{row.total}</div>
                    <div className="text-xs text-[#68736a]">{row.last7Days} in last 7 days · last action {formatDate(row.lastActionAt)}</div>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-5">
                  <div className="rounded border border-[#d9ded5] bg-white px-3 py-2">
                    <div className="font-semibold">{row.checkboxes}</div>
                    <div className="text-[#68736a]">Checkboxes</div>
                  </div>
                  <div className="rounded border border-[#d9ded5] bg-white px-3 py-2">
                    <div className="font-semibold">{row.calls}</div>
                    <div className="text-[#68736a]">Calls</div>
                  </div>
                  <div className="rounded border border-[#d9ded5] bg-white px-3 py-2">
                    <div className="font-semibold">{row.texts}</div>
                    <div className="text-[#68736a]">Texts</div>
                  </div>
                  <div className="rounded border border-[#d9ded5] bg-white px-3 py-2">
                    <div className="font-semibold">{row.emails}</div>
                    <div className="text-[#68736a]">Emails</div>
                  </div>
                  <div className="rounded border border-[#d9ded5] bg-white px-3 py-2">
                    <div className="font-semibold">{row.other}</div>
                    <div className="text-[#68736a]">Other</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded border border-dashed border-[#d9ded5] p-6 text-sm text-[#68736a]">
            No workspace users found yet.
          </div>
        )}
      </Panel>
    </>
  );
}
