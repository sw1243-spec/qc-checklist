"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

const workerRoles = new Set(["LE", "QC", "SV"]);

function readText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalPositiveInt(formData: FormData, field: string): number | null {
  const value = readText(formData, field);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function updateWorker(formData: FormData) {
  await requireAdmin();

  const id = readOptionalPositiveInt(formData, "id");
  const name = readText(formData, "name");
  const role = readText(formData, "role");
  const lineId = readOptionalPositiveInt(formData, "lineId");
  const shift = readOptionalPositiveInt(formData, "shift");

  if (!id || !name || !workerRoles.has(role)) return;
  if (shift !== null && shift !== 1 && shift !== 2) return;

  await prisma.worker.update({
    where: { id },
    data: { name, role, lineId, shift },
  });

  revalidatePath("/admin/workers");
  revalidatePath("/SWJ/workers");
}
