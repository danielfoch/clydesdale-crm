"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

const quotes = [
  { source: "Bob Hooey", text: "If you are not taking care of your customer, your competitor will." },
  { source: "Tony Hsieh", text: "Chase the vision, not the money; the money will end up following you." },
  { source: "Jeffrey Gitomer", text: "Great salespeople are relationship builders who provide value." },
  { source: "Shiv Khera", text: "90 percent of selling is conviction and 10 percent is persuasion." },
  { source: "Patricia Fripp", text: "You do not compete on price. You compete on relationships." },
  { source: "Seth Godin", text: "Do not find customers for your products; find products for your customers." },
  { source: "Katherine Barchetti", text: "Make a customer, not a sale." },
  { source: "Bill Gates", text: "Your most unhappy customers are your greatest source of learning." },
  { source: "William C. Stone", text: "Sales are contingent upon the attitude of the salesman." },
  { source: "Jim Rohn", text: "Either you run the day, or the day runs you." },
  { source: "Will Rogers", text: "Even if you are on the right track, you will get run over if you just sit there." },
  { source: "Wayne Gretzky", text: "You miss 100 percent of the shots you do not take." },
  { source: "Tim Ferriss", text: "Focus on being productive instead of being busy." },
  { source: "Mark Twain", text: "The secret of getting ahead is getting started." },
  { source: "John Wooden", text: "Do not let what you cannot do interfere with what you can do." },
  { source: "Zig Ziglar", text: "If you aim at nothing, you will hit it every time." },
  { source: "Brian Tracy", text: "Sales success is 80 percent attitude and 20 percent aptitude." },
  { source: "Thomas Freese", text: "The questions you ask are more important than the things you say." },
];

export function MotivationRotator() {
  const [index, setIndex] = useState(0);
  const nextQuote = () => setIndex((current) => (current + 1) % quotes.length);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % quotes.length);
    }, 9000);

    return () => window.clearInterval(timer);
  }, []);

  const quote = quotes[index];

  return (
    <aside className="w-full rounded-md border border-[#d9ded5] bg-white p-3 shadow-sm lg:max-w-xl" aria-live="polite">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-normal text-[#68736a]">Motivation</span>
        <div className="flex items-center gap-2">
          <span className="rounded bg-[#e9efe6] px-2 py-1 text-[10px] font-medium text-[#304037]">{quote.source}</span>
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
    </aside>
  );
}
