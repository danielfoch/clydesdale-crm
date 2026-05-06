import { getPrisma } from "./prisma";

export async function getDefaultWorkspaceId() {
  const prisma = getPrisma();
  const workspace = await prisma.workspace.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!workspace) {
    throw new Error("No workspace found. Run npm run db:seed first.");
  }

  return workspace.id;
}

export async function getDefaultWorkspace() {
  const prisma = getPrisma();
  const workspace = await prisma.workspace.findFirst({
    include: {
      members: { include: { user: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!workspace) {
    throw new Error("No workspace found. Run npm run db:seed first.");
  }

  return workspace;
}
