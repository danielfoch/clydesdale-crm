"use client";

import { AlertTriangle } from "lucide-react";

export default function AppError({ error }: { error: Error & { digest?: string } }) {
  const isDatabase = error.message.includes("Can't reach database") || error.message.includes("No workspace found");

  return (
    <div className="rounded-md border border-[#d9ded5] bg-white p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 text-[#9a5b1f]" size={20} />
        <div>
          <h1 className="text-lg font-semibold">{isDatabase ? "Database setup required" : "Something went wrong"}</h1>
          <p className="mt-2 text-sm text-[#5f6a62]">
            {isDatabase
              ? "Start Postgres, run the Prisma migration and seed script, then refresh this page."
              : error.message}
          </p>
          {isDatabase ? (
            <pre className="mt-4 overflow-auto rounded bg-[#f5f7f2] p-3 text-xs">{`docker compose up -d postgres
npm run db:migrate
npm run db:seed`}</pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}
