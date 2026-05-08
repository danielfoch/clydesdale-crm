"use client";

import { useEffect, useState } from "react";

const quotes = [
  { source: "Sales", text: "Speed wins. Follow up before the lead forgets why they raised their hand." },
  { source: "Hormozi-style", text: "Make the offer clearer, the action smaller, and the follow-up faster." },
  { source: "Dan Pena-style", text: "High standards beat soft intentions. Pick up the phone." },
  { source: "GaryVee-style", text: "Attention is rented. Trust is earned. Do the next useful thing." },
  { source: "Yoda-style", text: "Follow up or follow out. No maybe pipeline." },
  { source: "Sales", text: "The lead does not need a perfect CRM. They need a useful response now." },
  { source: "Hormozi-style", text: "More volume with cleaner intent. More reps with better notes." },
  { source: "Dan Pena-style", text: "If the deal matters, stop admiring it and move it." },
  { source: "GaryVee-style", text: "Care louder than the next agent. Then document everything." },
  { source: "Yoda-style", text: "A next action, every relationship must have." },
  { source: "Sales", text: "Pipeline is not storage. Pipeline is motion." },
  { source: "Clydesdale", text: "No lead waits. No deal stalls. No past client goes cold." },
];

export function MotivationRotator() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % quotes.length);
    }, 9000);

    return () => window.clearInterval(timer);
  }, []);

  const quote = quotes[index];

  return (
    <aside className="w-full rounded-md border border-[#d9ded5] bg-white p-3 shadow-sm sm:max-w-sm" aria-live="polite">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-normal text-[#68736a]">Motivation</span>
        <span className="rounded bg-[#e9efe6] px-2 py-1 text-[10px] font-medium text-[#304037]">{quote.source}</span>
      </div>
      <p className="text-sm font-medium leading-5 text-[#17231d]">{quote.text}</p>
    </aside>
  );
}
