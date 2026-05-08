"use client";

import { useEffect, useState } from "react";
import { Pause, Play, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { submitMotivationQuoteAction, voteMotivationQuoteAction } from "@/app/actions";

export type MotivationQuote = {
  id: string;
  source: string;
  text: string;
  upvotes: number;
  downvotes: number;
};

export function MotivationRotator({ quotes }: { quotes: MotivationQuote[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const quote = quotes[index] ?? quotes[0];
  const nextQuote = () => setIndex((current) => (current + 1) % Math.max(quotes.length, 1));

  useEffect(() => {
    if (paused || quotes.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % quotes.length);
    }, 9000);

    return () => window.clearInterval(timer);
  }, [paused, quotes.length]);

  if (!quote) {
    return null;
  }

  return (
    <aside className="w-full rounded-md border border-[#d9ded5] bg-white p-3 shadow-sm lg:max-w-xl" aria-live="polite">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-normal text-[#68736a]">Motivation</span>
        <div className="flex items-center gap-2">
          <span className="rounded bg-[#e9efe6] px-2 py-1 text-[10px] font-medium text-[#304037]">{quote.source}</span>
          <button
            type="button"
            onClick={() => setPaused((current) => !current)}
            className="grid size-6 place-items-center rounded border border-[#d9ded5] text-[#46534b] hover:bg-[#f5f7f2]"
            aria-label={paused ? "Play quote rotation" : "Pause quote rotation"}
            title={paused ? "Play" : "Pause"}
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
          </button>
          <button
            type="button"
            onClick={nextQuote}
            className="grid size-6 place-items-center rounded border border-[#d9ded5] text-[#46534b] hover:bg-[#f5f7f2]"
            aria-label="Show another quote"
            title="Show another quote"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>
      <p className="text-sm font-medium leading-5 text-[#17231d]">{quote.text}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <form action={voteMotivationQuoteAction}>
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="direction" value="up" />
            <button className="inline-flex items-center gap-1 rounded border border-[#d9ded5] px-2 py-1 text-xs text-[#46534b] hover:bg-[#f5f7f2]" title="Upvote">
              <ThumbsUp size={12} /> {quote.upvotes}
            </button>
          </form>
          <form action={voteMotivationQuoteAction}>
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="direction" value="down" />
            <button className="inline-flex items-center gap-1 rounded border border-[#d9ded5] px-2 py-1 text-xs text-[#46534b] hover:bg-[#f5f7f2]" title="Downvote">
              <ThumbsDown size={12} /> {quote.downvotes}
            </button>
          </form>
        </div>
        <details className="relative [&>summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer rounded border border-[#d9ded5] px-2 py-1 text-xs text-[#46534b] hover:bg-[#f5f7f2]">
            Submit quote
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-[min(92vw,360px)] rounded-md border border-[#d9ded5] bg-white p-3 shadow-xl">
            <form action={submitMotivationQuoteAction} className="space-y-2">
              <textarea name="text" className="w-full rounded border border-[#cfd6ca] bg-white px-3 py-2 text-sm outline-none focus:border-[#72806f]" placeholder="Quote" rows={3} required />
              <input name="source" className="w-full rounded border border-[#cfd6ca] bg-white px-3 py-2 text-sm outline-none focus:border-[#72806f]" placeholder="Source or author" />
              <input name="submittedBy" className="w-full rounded border border-[#cfd6ca] bg-white px-3 py-2 text-sm outline-none focus:border-[#72806f]" placeholder="Your name" />
              <button className="rounded bg-[#17231d] px-3 py-2 text-sm font-medium text-white hover:bg-[#26382f]">Add quote</button>
            </form>
          </div>
        </details>
      </div>
    </aside>
  );
}
