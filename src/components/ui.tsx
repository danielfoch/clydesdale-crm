export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-5 flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-normal text-[#17231d]">{title}</h1>
      {subtitle ? <p className="max-w-3xl text-sm text-[#5f6a62]">{subtitle}</p> : null}
    </header>
  );
}

export function Panel({ title, children }: { title?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-[#d9ded5] bg-white">
      {title ? <h2 className="border-b border-[#e4e8df] px-4 py-3 text-sm font-semibold">{title}</h2> : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-[#e9efe6] px-2 py-1 text-xs font-medium text-[#304037]">{children}</span>;
}

export function Button({ children, type = "submit" }: { children: React.ReactNode; type?: "button" | "submit" | "reset" }) {
  return <button type={type} className="rounded bg-[#17231d] px-3 py-2 text-sm font-medium text-white hover:bg-[#26382f]">{children}</button>;
}

export const inputClass = "w-full rounded border border-[#cfd6ca] bg-white px-3 py-2 text-sm outline-none focus:border-[#72806f]";
