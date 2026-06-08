import { prisma } from "@/lib/db";
import { cookies } from "next/headers";

type LogParams = {
  action: string;
  entityType: string;
  entityId?: number;
  detail?: unknown;
};

export async function logAudit({ action, entityType, entityId, detail }: LogParams) {
  try {
    const cookieStore = await cookies();
    const role = cookieStore.get("qc_admin")?.value
      ? "admin"
      : cookieStore.get("qc_auth")?.value
      ? "user"
      : "anonymous";
    // 기기 이름(태블릿)이 설정돼 있으면 함께 기록: "admin (Line 2 Tablet)"
    const device = cookieStore.get("qc_device")?.value;
    const actor = device ? `${role} (${device})` : role;

    await prisma.auditLog.create({
      data: {
        action,
        entityType,
        entityId: entityId ?? null,
        actor,
        detail: detail ? (typeof detail === "string" ? detail : JSON.stringify(detail)) : null,
      },
    });
  } catch (e) {
    // 로그 실패가 본 기능을 막지 않도록
    console.error("Audit log failed:", e);
  }
}
