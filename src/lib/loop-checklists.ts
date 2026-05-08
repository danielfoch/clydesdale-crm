export type LoopChecklistItem = {
  key: string;
  label: string;
};

const pipelineLoops: Record<string, LoopChecklistItem[]> = {
  new: [
    { key: "first_response", label: "First response sent" },
    { key: "call_attempted", label: "Call attempted" },
    { key: "need_identified", label: "Need identified" },
  ],
  attempting_contact: [
    { key: "first_response", label: "First response sent" },
    { key: "call_attempted", label: "Call attempted" },
    { key: "need_identified", label: "Need identified" },
  ],
  nurturing: [
    { key: "conversation_started", label: "Conversation started" },
    { key: "motivation_confirmed", label: "Motivation confirmed" },
    { key: "value_offer_chosen", label: "Next value offer chosen" },
  ],
  appointment_set: [
    { key: "value_sent", label: "Listings, CMA, or market info sent" },
    { key: "appointment_asked", label: "Appointment asked for" },
    { key: "appointment_confirmed", label: "Appointment confirmed" },
  ],
  active_client: [
    { key: "client_confirmed", label: "Client commitment confirmed" },
    { key: "deal_created", label: "Deal created" },
    { key: "deal_plan_set", label: "Deal plan set" },
  ],
};

const dealLoops: Record<string, LoopChecklistItem[]> = {
  met_with_client: [
    { key: "criteria_confirmed", label: "Criteria confirmed" },
    { key: "timeline_confirmed", label: "Timeline confirmed" },
    { key: "next_service_set", label: "Next service step set" },
  ],
  sending_listings: [
    { key: "knowledge_shared", label: "Knowledge shared" },
    { key: "feedback_requested", label: "Feedback requested" },
    { key: "appointment_prompted", label: "Appointment or next step prompted" },
  ],
  active_client: [
    { key: "active_plan_confirmed", label: "Active plan confirmed" },
    { key: "weekly_update_sent", label: "Client update sent" },
    { key: "next_showing_or_listing_step", label: "Next showing/listing step set" },
  ],
  transaction: [
    { key: "missing_items_checked", label: "Missing items checked" },
    { key: "deadline_confirmed", label: "Deadline confirmed" },
    { key: "client_updated", label: "Client updated" },
  ],
};

export function getPipelineLoopItems(stage: string) {
  return pipelineLoops[stage] ?? pipelineLoops.nurturing;
}

export function getDealLoopItems(stage: string) {
  return dealLoops[stage] ?? dealLoops.met_with_client;
}

export function loopTaskType(scope: "pipeline" | "deal", stage: string, key: string) {
  return `loop:${scope}:${stage}:${key}`;
}
