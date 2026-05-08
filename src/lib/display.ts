export const leadPipelineStages = [
  {
    key: "lead",
    label: "Lead",
    description: "Contact info captured. Needs first response.",
    contactStages: ["new", "attempting_contact"],
    moveToStage: "new",
  },
  {
    key: "relationship",
    label: "Relationship",
    description: "Engaged in discussion, not yet receiving client work.",
    contactStages: ["nurturing"],
    moveToStage: "nurturing",
  },
  {
    key: "prospect",
    label: "Prospect",
    description: "Receiving listings, CMA, market report, or serious nurture.",
    contactStages: ["appointment_set"],
    moveToStage: "appointment_set",
  },
  {
    key: "client",
    label: "Client",
    description: "Met and converted. Move into Deals.",
    contactStages: ["active_client"],
    moveToStage: "active_client",
  },
] as const;

export const dealPipelineStages = [
  {
    key: "met_with_client",
    label: "Met With Client",
    description: "Consultation happened. Confirm the plan.",
    dealStages: ["new", "consultation", "valuation", "met_with_client"],
  },
  {
    key: "sending_listings",
    label: "Sending Listings",
    description: "Sending homes, CMA, or market options.",
    dealStages: ["sending_listings", "searching", "preparing"],
  },
  {
    key: "active_client",
    label: "Active Client",
    description: "Listed, showing, or actively shopping.",
    dealStages: ["active_client", "listed", "showings", "out_looking"],
  },
  {
    key: "transaction",
    label: "Transaction",
    description: "Offer, lease, conditions, or closing work.",
    dealStages: ["transaction", "under_contract", "applications", "offer", "lease_process"],
  },
] as const;

const contactTypeLabels: Record<string, string> = {
  buyer: "Buyer",
  tenant: "Tenant",
  seller: "Seller",
  landlord: "Landlord",
  investor: "Investor",
  past_client: "Past Client",
  unknown: "Unknown",
};

const stageLabels: Record<string, string> = {
  new: "Lead",
  attempting_contact: "Lead",
  nurturing: "Relationship",
  appointment_set: "Prospect",
  active_client: "Client",
  under_contract: "In Transaction",
  closed: "Closed",
  past_client: "Past Client",
  unqualified: "Unqualified",
  archived: "Archived",
  met_with_client: "Met With Client",
  sending_listings: "Sending Listings",
  listed: "Active Client",
  showings: "Active Client",
  out_looking: "Active Client",
  transaction: "Transaction",
  applications: "Transaction",
  valuation: "Met With Client",
  consultation: "Met With Client",
};

export function titleize(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function contactTypeLabel(value: string | null | undefined) {
  return value ? contactTypeLabels[value] ?? titleize(value) : "Unknown";
}

export function stageLabel(value: string | null | undefined) {
  return value ? stageLabels[value] ?? titleize(value) : "Unknown";
}

export function formatDue(date: Date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const nextDay = new Date(today);
  nextDay.setDate(today.getDate() + 2);

  if (date < now) return "Overdue";
  if (date >= today && date < tomorrow) return "Today";
  if (date >= tomorrow && date < nextDay) return "Tomorrow";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDueDelta(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((dueDay - today) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "0d";
  if (diffDays > 0 && diffDays <= 9) return `${diffDays}d`;
  if (diffDays < 0 && diffDays >= -9) return `${diffDays}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function contactTypeBadgeClass(value: string | null | undefined) {
  switch (value) {
    case "buyer":
      return "bg-[#dbeafe] text-[#1e3a8a]";
    case "tenant":
      return "bg-[#cffafe] text-[#155e75]";
    case "seller":
      return "bg-[#fee2e2] text-[#7f1d1d]";
    case "landlord":
      return "bg-[#fef3c7] text-[#78350f]";
    case "investor":
      return "bg-[#ede9fe] text-[#4c1d95]";
    case "past_client":
      return "bg-[#dcfce7] text-[#14532d]";
    default:
      return "bg-[#ecefe8] text-[#3f4b43]";
  }
}

export function urgencyLabel(score: number) {
  if (score >= 75) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

export function urgencyBadgeClass(score: number) {
  if (score >= 75) return "bg-[#fde68a] text-[#713f12]";
  if (score >= 40) return "bg-[#e0f2fe] text-[#075985]";
  return "bg-[#ecfdf5] text-[#166534]";
}
