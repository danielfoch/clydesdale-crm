import Link from "next/link";
import { Bot, BriefcaseBusiness, CalendarCheck, Settings, UsersRound, Megaphone, Phone, Trophy, UserRound } from "lucide-react";

const navItems = [
  { href: "/today", label: "Today", icon: CalendarCheck },
  { href: "/contacts", label: "Contacts", icon: UserRound },
  { href: "/pipeline", label: "Pipeline", icon: UsersRound },
  { href: "/deals", label: "Deals", icon: BriefcaseBusiness },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppChrome({ children }: { children: React.ReactNode }) {
  const phoneNumber = process.env.TWILIO_FROM_NUMBER ?? process.env.TWILIO_AGENT_NUMBER;
  return (
    <div className="min-h-screen bg-[#f6f7f4] text-[#18211d]">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-[#d9ded5] bg-[#fbfcf8] px-4 py-5 md:block">
        <Link href="/today" className="mb-7 flex items-center gap-3 font-semibold">
          <span className="grid size-9 place-items-center rounded bg-[#17231d] text-white">
            <Bot size={18} />
          </span>
          Clydesdale CRM
        </Link>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[#46534b] hover:bg-[#edf1e9] hover:text-[#18211d]"
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="md:pl-60">
        <div className="mx-auto w-full max-w-7xl px-4 py-5 pb-20 sm:px-6 lg:px-8">{children}</div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-[#d9ded5] bg-[#fbfcf8] md:hidden">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className="grid flex-1 place-items-center py-2 text-[11px] text-[#46534b]">
            <item.icon size={17} />
            {item.label.split(" ")[0]}
          </Link>
        ))}
      </nav>
      <div className="group fixed bottom-20 right-4 z-40 md:bottom-5">
        <button className="flex items-center gap-2 rounded-full bg-[#17231d] px-4 py-3 text-sm font-medium text-white shadow-lg">
          <Phone size={16} /> Phone
        </button>
        <div className="pointer-events-none absolute bottom-full right-0 mb-2 w-72 translate-y-1 rounded-md border border-[#d9ded5] bg-white p-4 text-sm opacity-0 shadow-xl transition group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
          <div className="font-semibold">Live phone</div>
          <p className="mt-1 text-xs text-[#68736a]">Use Contact menus to start Twilio calls, texts, voicemail drops, or AI ISA calls.</p>
          {phoneNumber ? <div className="mt-3 rounded bg-[#f6f7f4] px-3 py-2 text-xs text-[#46534b]">{phoneNumber}</div> : null}
        </div>
      </div>
    </div>
  );
}
