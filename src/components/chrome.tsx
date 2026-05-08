import Link from "next/link";
import { Bot, BriefcaseBusiness, CalendarCheck, Settings, UsersRound, Megaphone } from "lucide-react";

const navItems = [
  { href: "/today", label: "Today", icon: CalendarCheck },
  { href: "/pipeline", label: "Pipeline", icon: UsersRound },
  { href: "/deals", label: "Deals", icon: BriefcaseBusiness },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppChrome({ children }: { children: React.ReactNode }) {
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
    </div>
  );
}
