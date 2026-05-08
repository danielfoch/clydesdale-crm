import { Activity, BarChart3, Mail, MessageSquareText, Phone, Target, TrendingUp, UsersRound } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui";
import { getSalesAnalytics, type SalesAnalytics } from "@/lib/analytics";
import { formatDue } from "@/lib/display";
import { getPrisma } from "@/lib/prisma";
import { formatRevenue } from "@/lib/revenue-estimates";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value: number) {
  return value.toLocaleString();
}

function MetricCard({
  label,
  value,
  subtext,
  icon: Icon,
}: {
  label: string;
  value: string;
  subtext: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <article className="rounded-md border border-[#d9ded5] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">{label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-normal text-[#17231d]">{value}</div>
        </div>
        <div className="grid size-9 place-items-center rounded bg-[#edf1e9] text-[#304037]">
          <Icon size={17} />
        </div>
      </div>
      <p className="mt-2 text-sm text-[#5f6a62]">{subtext}</p>
    </article>
  );
}

function BigRevenueCard({ analytics }: { analytics: SalesAnalytics }) {
  const hasValues = analytics.revenue.assignedDealValueCents > 0;
  return (
    <section className="rounded-md border border-[#d9ded5] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Estimated annualized revenue</div>
          <div className="mt-2 text-4xl font-semibold tracking-normal text-[#17231d]">
            {hasValues ? formatRevenue(analytics.revenue.annualizedRevenueCents) : "$0"}
          </div>
          <p className="mt-2 max-w-2xl text-sm text-[#5f6a62]">
            Expected commission revenue using assigned deal value, stage conversion, and completed actions. This is a working forecast, not accounting.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[420px]">
          <div className="rounded bg-[#f6f7f4] px-3 py-2">
            <div className="text-sm font-semibold text-[#17231d]">{formatRevenue(analytics.revenue.assignedDealValueCents)}</div>
            <div className="text-xs text-[#68736a]">assigned deal value</div>
          </div>
          <div className="rounded bg-[#f6f7f4] px-3 py-2">
            <div className="text-sm font-semibold text-[#17231d]">{formatRevenue(analytics.revenue.weightedRevenueCents)}</div>
            <div className="text-xs text-[#68736a]">weighted commission</div>
          </div>
          <div className="rounded bg-[#f6f7f4] px-3 py-2">
            <div className="text-sm font-semibold text-[#17231d]">{formatPercent(analytics.revenue.conversionRate)}</div>
            <div className="text-xs text-[#68736a]">weighted conversion</div>
          </div>
        </div>
      </div>
      <div className="mt-4 rounded bg-[#edf4ec] px-4 py-3 text-sm text-[#26352c]">
        {hasValues
          ? <>Complete <span className="font-semibold">{analytics.revenue.actionsToTarget}</span> more actions to push annualized pipeline toward <span className="font-semibold">{formatRevenue(analytics.revenue.targetAnnualizedRevenueCents)}</span>.</>
          : "Add deal values on Pipeline or Deals to unlock revenue forecasting."}
      </div>
    </section>
  );
}

function ActionChart({ analytics }: { analytics: SalesAnalytics }) {
  const max = Math.max(1, ...analytics.actionChart.map((point) => point.actions));
  return (
    <Panel title="Activity trend">
      <div className="flex h-56 items-end gap-2">
        {analytics.actionChart.map((point) => (
          <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-44 w-full items-end justify-center rounded bg-[#f6f7f4] px-1">
              <div
                className="w-full max-w-8 rounded-t bg-[#17231d]"
                style={{ height: `${Math.max(4, (point.actions / max) * 100)}%` }}
                title={`${point.actions} actions · ${point.calls} calls · ${point.texts} texts · ${point.emails} emails`}
              />
            </div>
            <div className="truncate text-[10px] text-[#68736a]">{point.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#68736a]">
        <span className="rounded bg-[#f6f7f4] px-2 py-1">{analytics.activity.actions30d} actions in 30 days</span>
        <span className="rounded bg-[#f6f7f4] px-2 py-1">{analytics.activity.actions7d} actions in 7 days</span>
        <span className="rounded bg-[#f6f7f4] px-2 py-1">{analytics.activity.messagesSent30d} messages sent</span>
      </div>
    </Panel>
  );
}

function FunnelPanel({ analytics }: { analytics: SalesAnalytics }) {
  const max = Math.max(1, ...analytics.funnel.map((item) => item.count));
  return (
    <Panel title="Pipeline funnel">
      <div className="space-y-3">
        {analytics.funnel.map((item) => (
          <div key={item.key}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="font-medium text-[#17231d]">{item.label}</div>
              <div className="text-xs text-[#68736a]">{item.count} people · {formatRevenue(item.valueCents)}</div>
            </div>
            <div className="mt-1 h-2 rounded bg-[#edf1e9]">
              <div className="h-2 rounded bg-[#17231d]" style={{ width: `${Math.max(3, (item.count / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function DealStagePanel({ analytics }: { analytics: SalesAnalytics }) {
  const max = Math.max(1, ...analytics.dealStages.map((item) => item.count));
  return (
    <Panel title="Deal stages">
      <div className="space-y-3">
        {analytics.dealStages.map((item) => (
          <div key={item.key}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="font-medium text-[#17231d]">{item.label}</div>
              <div className="text-xs text-[#68736a]">{item.count} deals · {formatRevenue(item.valueCents)}</div>
            </div>
            <div className="mt-1 h-2 rounded bg-[#edf1e9]">
              <div className="h-2 rounded bg-[#57705f]" style={{ width: `${Math.max(3, (item.count / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CommunicationPanel({ analytics }: { analytics: SalesAnalytics }) {
  return (
    <Panel title="Communication">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-[#e4e8df] bg-[#fbfcfa] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Phone size={15} /> Calls</div>
          <div className="mt-2 text-2xl font-semibold">{analytics.communication.callsMade30d}</div>
          <div className="text-xs text-[#68736a]">{formatPercent(analytics.communication.pickupRate)} pickup rate · {analytics.communication.answeredCalls30d} answered</div>
        </div>
        <div className="rounded border border-[#e4e8df] bg-[#fbfcfa] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><MessageSquareText size={15} /> Texts</div>
          <div className="mt-2 text-2xl font-semibold">{analytics.communication.textsSent30d}</div>
          <div className="text-xs text-[#68736a]">{formatNumber(analytics.communication.inboundReplies30d)} inbound replies</div>
        </div>
        <div className="rounded border border-[#e4e8df] bg-[#fbfcfa] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Mail size={15} /> Emails</div>
          <div className="mt-2 text-2xl font-semibold">{analytics.communication.emailsSent30d}</div>
          <div className="text-xs text-[#68736a]">{analytics.communication.failedMessages30d} failed or blocked</div>
        </div>
        <div className="rounded border border-[#e4e8df] bg-[#fbfcfa] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><Target size={15} /> Response rate</div>
          <div className="mt-2 text-2xl font-semibold">{formatPercent(analytics.communication.responseRate)}</div>
          <div className="text-xs text-[#68736a]">{analytics.communication.replyingContacts30d}/{analytics.communication.outboundContacts30d} contacted people replied</div>
        </div>
      </div>
    </Panel>
  );
}

function OpportunitiesPanel({ analytics }: { analytics: SalesAnalytics }) {
  return (
    <Panel title="Top value opportunities">
      {analytics.topOpportunities.length ? (
        <div className="divide-y divide-[#edf0ea]">
          {analytics.topOpportunities.map((item) => (
            <article key={`${item.kind}-${item.id}`} className="py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-[#edf1e9] px-2 py-1 text-xs font-semibold text-[#304037]">{item.kind}</span>
                    <div className="font-semibold text-[#17231d]">{item.name}</div>
                    <div className="text-xs text-[#68736a]">{item.stage}</div>
                  </div>
                  <p className="mt-1 text-sm text-[#5f6a62]">{item.nextAction}</p>
                </div>
                <div className="text-left sm:text-right">
                  <div className="font-semibold text-[#17231d]">{formatRevenue(item.valueCents)}</div>
                  <div className="text-xs text-[#68736a]">{formatDue(new Date(item.dueAt))}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded border border-dashed border-[#d9ded5] p-6 text-sm text-[#68736a]">
          Add deal values on Pipeline or Deals to see top opportunities.
        </div>
      )}
    </Panel>
  );
}

export default async function AnalyticsPage() {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const analytics = await getSalesAnalytics(workspaceId, db);

  return (
    <>
      <PageHeader title="Analytics" subtitle="Revenue, conversion, activity, and communication performance." />
      <div className="mb-4 flex flex-wrap gap-2 text-xs text-[#68736a]">
        <span className="rounded-full bg-[#17231d] px-3 py-1.5 text-white">Overview</span>
        <span className="rounded-full border border-[#d9ded5] bg-white px-3 py-1.5">Last 30 days</span>
        <span className="rounded-full border border-[#d9ded5] bg-white px-3 py-1.5">Generated {new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(analytics.generatedAt))}</span>
      </div>

      <div className="space-y-4">
        <BigRevenueCard analytics={analytics} />

        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard label="Lead to client" value={formatPercent(analytics.sales.leadToClientRate)} subtext={`${analytics.scorecards.activePipeline} active pipeline people`} icon={UsersRound} />
          <MetricCard label="Response rate" value={formatPercent(analytics.communication.responseRate)} subtext={`${analytics.communication.replyingContacts30d} replying contacts`} icon={MessageSquareText} />
          <MetricCard label="Pickup rate" value={formatPercent(analytics.communication.pickupRate)} subtext={`${analytics.communication.callsMade30d} calls made`} icon={Phone} />
          <MetricCard label="Action coverage" value={formatPercent(analytics.scorecards.nextActionCoverage)} subtext={`${analytics.scorecards.overdueTasks} overdue tasks`} icon={Target} />
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard label="Open actions" value={formatNumber(analytics.scorecards.openRecommendedActions)} subtext="Recommended actions waiting" icon={Activity} />
          <MetricCard label="New leads" value={formatNumber(analytics.scorecards.newLeads30d)} subtext="Created in last 30 days" icon={UsersRound} />
          <MetricCard label="Active deals" value={formatNumber(analytics.scorecards.activeDeals)} subtext={`Avg value ${formatRevenue(analytics.sales.averageActiveDealValueCents)}`} icon={BarChart3} />
          <MetricCard label="Closed deals" value={formatNumber(analytics.scorecards.closedDeals30d)} subtext={`${formatPercent(analytics.sales.dealCloseRate)} all-time close rate`} icon={TrendingUp} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <ActionChart analytics={analytics} />
          <CommunicationPanel analytics={analytics} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <FunnelPanel analytics={analytics} />
          <DealStagePanel analytics={analytics} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Panel title="Sales KPI detail">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded border border-[#e4e8df] bg-[#fbfcfa] p-3"><span className="font-semibold">{formatPercent(analytics.sales.clientToTransactionRate)}</span><div className="text-xs text-[#68736a]">Client to transaction rate</div></div>
              <div className="rounded border border-[#e4e8df] bg-[#fbfcfa] p-3"><span className="font-semibold">{formatRevenue(analytics.sales.weightedCommissionCents)}</span><div className="text-xs text-[#68736a]">Weighted commission forecast</div></div>
              <div className="rounded border border-[#e4e8df] bg-[#fbfcfa] p-3"><span className="font-semibold">{analytics.activity.tasksCompleted30d}</span><div className="text-xs text-[#68736a]">Tasks completed</div></div>
              <div className="rounded border border-[#e4e8df] bg-[#fbfcfa] p-3"><span className="font-semibold">{analytics.activity.checklistBoxes30d}</span><div className="text-xs text-[#68736a]">Stage boxes checked</div></div>
              <div className="rounded border border-[#e4e8df] bg-[#fbfcfa] p-3"><span className="font-semibold">{analytics.activity.notesCreated30d}</span><div className="text-xs text-[#68736a]">Notes created</div></div>
              <div className="rounded border border-[#e4e8df] bg-[#fbfcfa] p-3"><span className="font-semibold">{analytics.activity.campaignsEnrolled30d}</span><div className="text-xs text-[#68736a]">Campaign enrollments</div></div>
            </div>
          </Panel>
          <OpportunitiesPanel analytics={analytics} />
        </div>
      </div>
    </>
  );
}
