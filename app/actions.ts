"use server";

import { redirect } from "next/navigation";
import { checkPassword, setAuthCookie, clearAuthCookie, requireUser, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { checkLockout, recordFail, clearAttempts } from "@/lib/loginLockout";
import { sendSlackOorAlert } from "@/lib/notify";
import { parseSubmissionDateInput } from "@/lib/dateRange";
import { headers, cookies } from "next/headers";

export async function loginAction(formData: FormData) {
  const password = formData.get("password") as string;

  // 잠금 체크
  const lock = await checkLockout("user");
  if (lock.locked) {
    const secs = Math.ceil((lock.remainingMs ?? 0) / 1000);
    redirect(`/login?error=locked&remaining=${secs}`);
  }

  if (await checkPassword(password)) {
    await clearAttempts("user");
    await setAuthCookie();
    await logAudit({ action: "LOGIN", entityType: "User" });
    redirect("/");
  } else {
    const r = await recordFail("user");
    await logAudit({ action: "LOGIN_FAIL", entityType: "User", detail: { failCount: r.failCount } });
    if (r.locked) {
      const secs = Math.ceil((r.remainingMs ?? 0) / 1000);
      redirect(`/login?error=locked&remaining=${secs}`);
    }
    redirect(`/login?error=1&attempts=${r.failCount}`);
  }
}

export async function logoutAction() {
  await logAudit({ action: "LOGOUT", entityType: "User" });
  await clearAuthCookie();
  redirect("/login");
}

export async function adminLoginAction(formData: FormData) {
  const password = formData.get("password") as string;
  const { checkAdminPw, setAdminCookie } = await import("@/lib/auth");

  const lock = await checkLockout("admin");
  if (lock.locked) {
    const secs = Math.ceil((lock.remainingMs ?? 0) / 1000);
    redirect(`/SWJ/login?error=locked&remaining=${secs}`);
  }

  if (await checkAdminPw(password)) {
    await clearAttempts("admin");
    await setAdminCookie();
    await logAudit({ action: "LOGIN", entityType: "Admin" });
    redirect("/SWJ");
  } else {
    const r = await recordFail("admin");
    await logAudit({ action: "LOGIN_FAIL", entityType: "Admin", detail: { failCount: r.failCount } });
    if (r.locked) {
      const secs = Math.ceil((r.remainingMs ?? 0) / 1000);
      redirect(`/SWJ/login?error=locked&remaining=${secs}`);
    }
    redirect(`/SWJ/login?error=1&attempts=${r.failCount}`);
  }
}

export async function changeAppPasswordAction(formData: FormData) {
  await requireAdmin();
  const current  = formData.get("current")  as string;
  const next     = formData.get("next")     as string;
  const confirm  = formData.get("confirm")  as string;
  if (!current || !next || next !== confirm) redirect("/SWJ/settings?error=match");
  const { checkAppPassword, setAppPassword } = await import("@/lib/config");
  if (!(await checkAppPassword(current))) redirect("/SWJ/settings?error=wrong");
  await setAppPassword(next);
  redirect("/SWJ/settings?success=app");
}

export async function changeAdminPasswordAction(formData: FormData) {
  await requireAdmin();
  const current  = formData.get("current")  as string;
  const next     = formData.get("next")     as string;
  const confirm  = formData.get("confirm")  as string;
  if (!current || !next || next !== confirm) redirect("/SWJ/settings?error=match");
  const { checkAdminPassword, setAdminPassword } = await import("@/lib/config");
  if (!(await checkAdminPassword(current))) redirect("/SWJ/settings?error=wrong");
  await setAdminPassword(next);
  redirect("/SWJ/settings?success=admin");
}

// 앱 브랜딩 문구 수정 (config.json 저장)
export async function saveBrandingAction(formData: FormData) {
  await requireAdmin();
  const { setBranding } = await import("@/lib/config");
  setBranding({
    brandLabel: (formData.get("brandLabel") as string ?? "").trim() || undefined,
    appTitle: (formData.get("appTitle") as string ?? "").trim() || undefined,
    homeSubtitle: (formData.get("homeSubtitle") as string ?? "").trim() || undefined,
  });
  await logAudit({ action: "UPDATE_BRANDING", entityType: "Settings" });
  redirect("/SWJ/settings?success=branding");
}

// 이 기기(태블릿)의 이름 설정. 쿠키에 1년 저장되어 감사 로그에 함께 기록됨.
// 어드민 비번을 "확인"만 함 (작업자가 함부로 못 바꾸게). admin 쿠키는 심지 않으므로
// 태블릿은 계속 일반 유저 상태로 남아 로그가 "user (기기이름)"으로 정상 기록됨.
export async function setDeviceNameAction(formData: FormData) {
  await requireUser();
  const name = (formData.get("deviceName") as string ?? "").trim();
  const adminPw = (formData.get("adminPw") as string ?? "");
  const { checkAdminPassword } = await import("@/lib/config");
  if (!(await checkAdminPassword(adminPw))) {
    redirect("/device?error=pw");
  }
  const cookieStore = await cookies();
  if (name) {
    cookieStore.set("qc_device", name, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1년
    });
  } else {
    cookieStore.delete("qc_device");
  }
  redirect("/device?success=1");
}

export type SubmitResult =
  | { ok: true; submissionId: number; hasOutOfRange: boolean }
  | { ok: false; error: string };

export async function submitChecklist(
  templateId: number,
  lineId: number,
  modelId: number,
  date: string,
  shift: number,
  meta: {
    shift1LE: string;
    shift2LE: string;
    shift3LE: string;
    shift1QC: string;
    shift2QC: string;
    shift3QC: string;
    shift1SV: string;
    shift2SV: string;
    shift3SV: string;
    partNumberBuild: string;
    partNumberId?: number;
  },
  values: { itemId: number; shift: number; partNo: number; valueText: string }[]
): Promise<SubmitResult> {
  await requireUser();
  const partNumberId = meta.partNumberId;

  // 작업자 — 부서 분담 여부에 따라 필수 검증은 아래(items 조회 후)에서 처리
  const le = shift === 1 ? meta.shift1LE : shift === 2 ? meta.shift2LE : meta.shift3LE;
  const qc = shift === 1 ? meta.shift1QC : shift === 2 ? meta.shift2QC : meta.shift3QC;
  const sv = shift === 1 ? meta.shift1SV : shift === 2 ? meta.shift2SV : meta.shift3SV;

  // 스냅샷용 데이터 조회
  const [modelRecord, lineRecord, templateRecord] = await Promise.all([
    prisma.model.findUnique({ where: { id: modelId }, select: { name: true, lineId: true } }),
    prisma.line.findUnique({ where: { id: lineId }, include: { company: true } }),
    prisma.checksheetTemplate.findUnique({ where: { id: templateId }, select: { code: true, name: true, version: true } }),
  ]);

  // ID 관계 검증: URL 조작으로 연결되지 않은 조합이 들어오는 것을 방지
  if (!modelRecord || !lineRecord || !templateRecord) {
    return { ok: false, error: "Invalid submission: entity not found" };
  }
  if (modelRecord.lineId !== lineId) {
    return { ok: false, error: "Invalid submission: model does not belong to line" };
  }
  // 템플릿-모델 연결 검증:
  // 경로 A: TemplateModel (직접 연결)
  // 경로 B: PartNumber → PartNumberTemplate (파트넘버 경유)
  const templateLinkedDirect = await prisma.templateModel.findUnique({
    where: { templateId_modelId: { templateId, modelId } },
  });
  const templateLinkedViaPn = partNumberId
    ? await prisma.partNumber.findFirst({
        where: {
          id: partNumberId,
          modelId,
          OR: [
            { templateId },
            { templateLinks: { some: { templateId } } },
          ],
        },
      })
    : null;
  if (!templateLinkedDirect && !templateLinkedViaPn) {
    return { ok: false, error: "Invalid submission: template not linked to model" };
  }

  const items = await prisma.checkItem.findMany({
    where: { templateId },
    include: { specRanges: true },
  });

  // 템플릿에 없는 itemId 거부
  const validItemIds = new Set(items.map((i) => i.id));
  const invalidItems = values.filter((v) => !validItemIds.has(v.itemId));
  if (invalidItems.length > 0) {
    return { ok: false, error: "Invalid submission: unknown itemId in values" };
  }

  // 이번 제출이 어느 부서 항목인지 — 부서별 독립 제출(병합) 판단
  const submittedItemIds = [...new Set(values.map((v) => v.itemId))];
  const submittedItems = items.filter((i) => submittedItemIds.includes(i.id));
  const hasDeptItems = items.some((i) => i.department === "QC" || i.department === "PROD");
  const isProdSubmit = hasDeptItems && submittedItems.length > 0 && submittedItems.every((i) => i.department === "PROD");

  // 작업자 필수 검증 (부서별: Production→라인리더, Quality→QC 검사자 / 분담 없음→3명)
  if (hasDeptItems) {
    if (isProdSubmit && !le?.trim()) return { ok: false, error: "Line Leader is required." };
    if (!isProdSubmit && !qc?.trim()) return { ok: false, error: "QC Inspector is required." };
  } else if (!le?.trim() || !qc?.trim() || !sv?.trim()) {
    return { ok: false, error: "Line Leader, QC Inspector, and QC Supervisor are all required before submitting." };
  }

  // 범위 계산 (partNumberId 우선)
  const checkedValues = values.map((v) => {
    const item = items.find((i) => i.id === v.itemId);
    if (!item) return { ...v, isOutOfRange: false };

    // ok_ng 타입: NG면 OOR
    if (item.inputType === "ok_ng") {
      return { ...v, isOutOfRange: v.valueText === "NG" };
    }

    if (item.inputType !== "number" || v.valueText === "N/A" || v.valueText === "") {
      return { ...v, isOutOfRange: false };
    }
    const num = parseFloat(v.valueText);
    if (isNaN(num)) return { ...v, isOutOfRange: false };

    const spec =
      (partNumberId ? item.specRanges.find((s) => s.partNumberId === partNumberId) : null) ??
      item.specRanges.find((s) => s.lineId === lineId && s.modelId === modelId && !s.partNumberId) ??
      item.specRanges.find((s) => s.lineId === lineId && s.modelId === null && !s.partNumberId) ??
      item.specRanges.find((s) => s.lineId === null && s.modelId === modelId && !s.partNumberId) ??
      item.specRanges.find((s) => s.lineId === null && s.modelId === null && !s.partNumberId);

    if (!spec) return { ...v, isOutOfRange: false };
    const outOfRange =
      (spec.minVal !== null && num < spec.minVal) ||
      (spec.maxVal !== null && num > spec.maxVal);
    return { ...v, isOutOfRange: outOfRange };
  });

  const submissionDate = parseSubmissionDateInput(date);
  // 잘못된 날짜 문자열(Invalid Date)이 저장/조회되어 정합성이 깨지는 것 방지
  if (isNaN(submissionDate.getTime())) {
    return { ok: false, error: "Invalid submission date" };
  }
  submissionDate.setHours(0, 0, 0, 0);
  const nextDay = new Date(submissionDate);
  nextDay.setDate(nextDay.getDate() + 1);

  // 같은 (체크시트 + 파트넘버 + 라인 + 모델 + 날짜) 조합의 submission 조회.
  // templateId/partNumberId 까지 봐야 한 모델에 여러 체크시트가 붙어 있어도
  // 서로 다른 칸으로 분리 저장되어 덮어쓰기(데이터 손상)가 발생하지 않는다.
  const existing = await prisma.submission.findFirst({
    where: {
      templateId,
      partNumberId: partNumberId ?? null,
      lineId,
      modelId,
      date: { gte: submissionDate, lt: nextDay },
    },
    include: { values: true },
  });

  let submissionId: number;
  let hasOutOfRange: boolean;

  if (existing) {
    // 병합: 이번에 제출한 항목만 교체하고 나머지(다른 부서/시프트) 값은 보존.
    // hasOutOfRange = 보존되는 기존 OOR + 이번 새 값의 OOR
    const preservedOor = existing.values.some((v) => {
      const willReplace = v.shift === shift && submittedItemIds.includes(v.itemId);
      return !willReplace && v.isOutOfRange;
    });
    hasOutOfRange = preservedOor || checkedValues.some((v) => v.isOutOfRange);

    // 부서별 제출이면 해당 부서 작업자 필드만 갱신 (다른 부서가 채운 값 보존)
    const workerData = hasDeptItems
      ? (isProdSubmit
          ? (shift === 1 ? { shift1LE: meta.shift1LE } : shift === 2 ? { shift2LE: meta.shift2LE } : { shift3LE: meta.shift3LE })
          : (shift === 1 ? { shift1QC: meta.shift1QC } : shift === 2 ? { shift2QC: meta.shift2QC } : { shift3QC: meta.shift3QC }))
      : (shift === 1
          ? { shift1LE: meta.shift1LE, shift1QC: meta.shift1QC, shift1SV: meta.shift1SV }
          : shift === 2
          ? { shift2LE: meta.shift2LE, shift2QC: meta.shift2QC, shift2SV: meta.shift2SV }
          : { shift3LE: meta.shift3LE, shift3QC: meta.shift3QC, shift3SV: meta.shift3SV });

    // 삭제 → 삽입 → 업데이트를 트랜잭션으로 묶어 중간 실패 시 데이터 손실 방지
    await prisma.$transaction([
      prisma.checkValue.deleteMany({
        where: { submissionId: existing.id, shift, itemId: { in: submittedItemIds } },
      }),
      prisma.checkValue.createMany({
        data: checkedValues.map((v) => ({
          submissionId: existing.id,
          itemId: v.itemId,
          shift: v.shift,
          partNo: v.partNo,
          valueText: v.valueText,
          isOutOfRange: v.isOutOfRange,
        })),
      }),
      prisma.submission.update({
        where: { id: existing.id },
        data: {
          hasOutOfRange,
          partNumberBuild: meta.partNumberBuild || existing.partNumberBuild,
          ...workerData,
        },
      }),
      prisma.submissionLog.create({ data: { submissionId: existing.id, shift } }),
    ]);

    await logAudit({
      action: "EDIT_SUBMISSION",
      entityType: "Submission",
      entityId: existing.id,
      detail: { shift, hasOutOfRange, lineId, modelId, date },
    });

    submissionId = existing.id;
  } else {
    hasOutOfRange = checkedValues.some((v) => v.isOutOfRange);

    let created;
    try {
      created = await prisma.submission.create({
        data: {
          templateId,
          lineId,
          modelId,
          modelName:       modelRecord?.name    ?? null,
          companyName:     lineRecord?.company?.name ?? null,
          lineName:        lineRecord?.code     ?? null,
          templateCode:    templateRecord?.code    ?? null,
          templateName:    templateRecord?.name    ?? null,
          templateVersion: templateRecord?.version ?? null,
          partNumberId: partNumberId ?? null,
          date: submissionDate,
          shift,
          shift1LE: meta.shift1LE,
          shift2LE: meta.shift2LE,
          shift1QC: meta.shift1QC,
          shift2QC: meta.shift2QC,
          shift1SV: meta.shift1SV,
          shift2SV: meta.shift2SV,
          partNumberBuild: meta.partNumberBuild,
          hasOutOfRange,
          values: {
            create: checkedValues.map((v) => ({
              itemId: v.itemId,
              shift: v.shift,
              partNo: v.partNo,
              valueText: v.valueText,
              isOutOfRange: v.isOutOfRange,
            })),
          },
        },
      });
    } catch (e) {
      // 동시 제출 경쟁: 같은 (체크시트+라인+모델+날짜+파트넘버) 조합이 방금 생성됨 (P2002)
      if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
        return { ok: false, error: "This checklist was already submitted for this date/shift. Please reload and edit the existing entry." };
      }
      throw e;
    }
    submissionId = created.id;
    await logAudit({
      action: "SUBMIT",
      entityType: "Submission",
      entityId: created.id,
      detail: { shift, hasOutOfRange, lineId, modelId, date },
    });
  }

  // OOR 발생 시 Slack 알림 (비동기, 응답 안 기다림)
  if (hasOutOfRange) {
    const oorItems = checkedValues
      .filter((v) => v.isOutOfRange)
      .reduce<{ itemId: number; values: string[] }[]>((acc, v) => {
        const ex = acc.find((a) => a.itemId === v.itemId);
        if (ex) ex.values.push(v.valueText);
        else acc.push({ itemId: v.itemId, values: [v.valueText] });
        return acc;
      }, [])
      .map((entry) => {
        const item = items.find((i) => i.id === entry.itemId);
        const spec = item?.specRanges.find((s) => s.lineId === lineId && s.modelId === modelId)
                  ?? item?.specRanges[0];
        return {
          name: item?.characteristic ?? `Item ${entry.itemId}`,
          value: entry.values.join(", "),
          spec: spec?.label ?? (spec ? `${spec.minVal ?? "—"} ~ ${spec.maxVal ?? "—"}` : null),
        };
      });

    // baseUrl 추출 (Slack 클릭 시 정상 동작하도록)
    // 운영에서는 APP_BASE_URL 환경변수로 고정 권장 (예: https://qc.사내도메인)
    let baseUrl: string | undefined = process.env.APP_BASE_URL;
    if (!baseUrl) {
      try {
        const h = await headers();
        const host = h.get("x-forwarded-host") ?? h.get("host");
        const proto = h.get("x-forwarded-proto") ?? "http";
        if (host) baseUrl = `${proto}://${host}`;
      } catch {}
    }

    sendSlackOorAlert({
      submissionId,
      company:      lineRecord?.company?.name ?? "—",
      line:         lineRecord?.code ?? "—",
      model:        modelRecord?.name ?? "—",
      partNumber:   meta.partNumberBuild || undefined,
      shift,
      templateName: templateRecord?.name ?? "—",
      oorItems,
      baseUrl,
    });
  }

  // 머신체크의 GREASE TRACEABILITY 항목 → GreaseLog 'start' 기록으로 통합
  // (Grease Change 화면·submission 타임라인에 한 줄로 이어짐. 재제출 시 갱신)
  if (partNumberId) {
    const greaseItems = items.filter((i) => i.section === "GREASE TRACEABILITY");
    for (const gi of greaseItems) {
      const ch = gi.characteristic.toLowerCase();
      const side = ch.includes("outboard") ? "outboard" : ch.includes("inboard") ? "inboard" : null;
      if (!side) continue;
      const val = values.find((v) => v.itemId === gi.id && v.partNo === 1)?.valueText?.trim();
      if (!val) continue;
      const existing = await prisma.greaseLog.findFirst({
        where: { partNumberId, date: submissionDate, side, source: "machine" },
      });
      if (existing) {
        await prisma.greaseLog.update({ where: { id: existing.id }, data: { batchCode: val, operator: le } });
      } else {
        await prisma.greaseLog.create({
          data: {
            lineId, modelId, partNumberId,
            companyName:    lineRecord?.company?.name ?? null,
            lineName:       lineRecord?.code ?? null,
            modelName:      modelRecord?.name ?? null,
            partNumberCode: meta.partNumberBuild || null,
            date: submissionDate, side, batchCode: val, operator: le, source: "machine",
          },
        });
      }
    }
  }

  return { ok: true, submissionId, hasOutOfRange };
}

/* ── Company / Line / Model CRUD ─────────────────── */

export async function createCompany(formData: FormData) {
  await requireAdmin();
  const code = (formData.get("code") as string).trim().toUpperCase();
  const name = (formData.get("name") as string).trim();
  if (!code || !name) return;
  const created = await prisma.company.create({ data: { code, name } });
  await logAudit({ action: "CREATE", entityType: "Company", entityId: created.id, detail: { code, name } });
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/admin/companies");
}

export async function createLine(formData: FormData) {
  await requireAdmin();
  const companyId = Number(formData.get("companyId"));
  const code = (formData.get("code") as string).trim().toUpperCase();
  if (!companyId || !code) return;
  const created = await prisma.line.create({ data: { companyId, code } });
  await logAudit({ action: "CREATE", entityType: "Line", entityId: created.id, detail: { companyId, code } });
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/admin/companies");
}

export async function createModel(formData: FormData) {
  await requireAdmin();
  const lineId = Number(formData.get("lineId"));
  const name = (formData.get("name") as string).trim();
  if (!lineId || !name) return;
  const created = await prisma.model.create({ data: { lineId, name } });
  await logAudit({ action: "CREATE", entityType: "Model", entityId: created.id, detail: { lineId, name } });
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/admin/companies");
}

export async function deleteModel(formData: FormData) {
  await requireAdmin();
  const modelId = Number(formData.get("modelId"));
  if (!modelId) return { error: "Invalid ID" };
  // 삭제 전 모델 이름을 submission에 스냅샷으로 저장
  const model = await prisma.model.findUnique({ where: { id: modelId } });
  if (model) {
    await prisma.submission.updateMany({
      where: { modelId },
      data: { modelId: null, modelName: model.name },
    });
  }
  await prisma.templateModel.deleteMany({ where: { modelId } });
  // partNumber 관련 submission 스냅샷 처리 후 삭제
  const partNumbers = await prisma.partNumber.findMany({ where: { modelId } });
  for (const pn of partNumbers) {
    await prisma.submission.updateMany({
      where: { partNumberId: pn.id },
      data: { partNumberId: null, partNumberBuild: pn.code },
    });
    await prisma.specRange.deleteMany({ where: { partNumberId: pn.id } });
  }
  await prisma.partNumber.deleteMany({ where: { modelId } });
  await prisma.model.delete({ where: { id: modelId } });
  await logAudit({ action: "DELETE", entityType: "Model", entityId: modelId, detail: { name: model?.name } });
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/admin/companies");
}

export async function deleteLine(formData: FormData) {
  await requireAdmin();
  const lineId = Number(formData.get("lineId"));
  if (!lineId) return { error: "Invalid ID" };
  const subCount = await prisma.submission.count({ where: { lineId } });
  if (subCount > 0) return { error: `Cannot delete: ${subCount} submission record(s) exist for this line.` };
  const models = await prisma.model.findMany({ where: { lineId } });
  for (const m of models) {
    await prisma.templateModel.deleteMany({ where: { modelId: m.id } });
  }
  await prisma.model.deleteMany({ where: { lineId } });
  await prisma.line.delete({ where: { id: lineId } });
  await logAudit({ action: "DELETE", entityType: "Line", entityId: lineId });
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/admin/companies");
}

export async function deleteCompany(formData: FormData) {
  await requireAdmin();
  const companyId = Number(formData.get("companyId"));
  if (!companyId) return { error: "Invalid ID" };
  const lines = await prisma.line.findMany({ where: { companyId } });
  for (const line of lines) {
    const subCount = await prisma.submission.count({ where: { lineId: line.id } });
    if (subCount > 0) return { error: `Cannot delete: Line ${line.code} has submission records.` };
  }
  for (const line of lines) {
    const models = await prisma.model.findMany({ where: { lineId: line.id } });
    for (const m of models) {
      await prisma.templateModel.deleteMany({ where: { modelId: m.id } });
    }
    await prisma.model.deleteMany({ where: { lineId: line.id } });
  }
  await prisma.line.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await logAudit({ action: "DELETE", entityType: "Company", entityId: companyId });
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/admin/companies");
}

export async function linkTemplateToModel(formData: FormData) {
  await requireAdmin();
  const modelId    = Number(formData.get("modelId"));
  const templateId = Number(formData.get("templateId"));
  if (!modelId || !templateId) return;
  await prisma.templateModel.upsert({
    where: { templateId_modelId: { templateId, modelId } },
    create: { templateId, modelId },
    update: {},
  });
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/admin/models/${modelId}`);
  revalidatePath("/company", "layout"); // 체크시트 선택 페이지 캐시 무효화
}

export async function unlinkTemplateFromModel(formData: FormData) {
  await requireAdmin();
  const modelId    = Number(formData.get("modelId"));
  const templateId = Number(formData.get("templateId"));
  if (!modelId || !templateId) return;
  await prisma.templateModel.deleteMany({ where: { templateId, modelId } });
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/admin/models/${modelId}`);
  revalidatePath("/company", "layout"); // 체크시트 선택 페이지 캐시 무효화
}

// 파트넘버 레벨 링크 해제 — 해당 모델의 모든 PN에서 templateId 제거
export async function unlinkTemplateFromPartNumbers(formData: FormData) {
  await requireAdmin();
  const modelId    = Number(formData.get("modelId"));
  const templateId = Number(formData.get("templateId"));
  if (!modelId || !templateId) return;
  // 해당 모델 소속 PN id 목록
  const pns = await prisma.partNumber.findMany({ where: { modelId }, select: { id: true } });
  const pnIds = pns.map((p) => p.id);
  if (pnIds.length) {
    await prisma.partNumberTemplate.deleteMany({ where: { templateId, partNumberId: { in: pnIds } } });
  }
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/admin/models/${modelId}`);
  revalidatePath("/company", "layout");
}

// 여러 PN에 템플릿 연결 (한 번에)
export async function linkTemplateToPartNumber(formData: FormData) {
  await requireAdmin();
  const templateId = Number(formData.get("templateId"));
  const pnIds = formData.getAll("partNumberId").map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
  if (!templateId || pnIds.length === 0) return;
  await prisma.$transaction(
    pnIds.map((partNumberId) =>
      prisma.partNumberTemplate.upsert({
        where: { partNumberId_templateId: { partNumberId, templateId } },
        create: { partNumberId, templateId },
        update: {},
      })
    )
  );
  const pn = await prisma.partNumber.findFirst({ where: { id: pnIds[0] }, select: { modelId: true } });
  const { revalidatePath } = await import("next/cache");
  if (pn) revalidatePath(`/admin/models/${pn.modelId}`);
  revalidatePath("/company", "layout");
}

// 특정 PN에서 템플릿 연결 해제
export async function unlinkTemplateFromPartNumber(formData: FormData) {
  await requireAdmin();
  const partNumberId = Number(formData.get("partNumberId"));
  const templateId   = Number(formData.get("templateId"));
  if (!partNumberId || !templateId) return;
  await prisma.partNumberTemplate.deleteMany({ where: { partNumberId, templateId } });
  const pn = await prisma.partNumber.findUnique({ where: { id: partNumberId }, select: { modelId: true } });
  const { revalidatePath } = await import("next/cache");
  if (pn) revalidatePath(`/admin/models/${pn.modelId}`);
  revalidatePath("/company", "layout");
}

export async function submitCorrectiveAction(formData: FormData) {
  await requireUser();
  const submissionId = Number(formData.get("submissionId"));
  const cause      = ((formData.get("cause")      as string) ?? "").trim();
  const action     = (formData.get("action")     as string).trim();
  const resolvedBy = (formData.get("resolvedBy") as string).trim();
  if (!submissionId) return;

  await prisma.correctiveAction.upsert({
    where:  { submissionId },
    create: { submissionId, cause, action, resolvedBy },
    update: { cause, action, resolvedBy },
  });
  await logAudit({
    action: "CORRECTIVE_ACTION",
    entityType: "Submission",
    entityId: submissionId,
    detail: { resolvedBy, cause: cause.slice(0, 100), action: action.slice(0, 100) },
  });

  // correctedText_${checkValueId} 형태의 필드 저장 — 트랜잭션으로 일괄(부분 저장 방지)
  const updates = [];
  for (const [key, val] of formData.entries()) {
    if (key.startsWith("correctedText_")) {
      const checkValueId = Number(key.replace("correctedText_", ""));
      const text = (val as string).trim();
      if (checkValueId) {
        updates.push(prisma.checkValue.update({
          where: { id: checkValueId },
          data: { correctedText: text || null },
        }));
      }
    }
  }
  if (updates.length) await prisma.$transaction(updates);

  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/submission/${submissionId}`);
}

/* ── Grease Traceability ─────────────────────────────── */

// 그리스 교체 기록 추가 (라인 중간 컨테이너 교체 대응). 시각은 자동.
export async function addGreaseLog(formData: FormData) {
  await requireUser();
  const lineId       = Number(formData.get("lineId"));
  const modelId      = formData.get("modelId")      ? Number(formData.get("modelId"))      : null;
  const partNumberId = formData.get("partNumberId") ? Number(formData.get("partNumberId")) : null;
  const side         = String(formData.get("side") ?? "");
  const batchCode    = String(formData.get("batchCode") ?? "").trim();
  const operator     = String(formData.get("operator") ?? "").trim();
  if (!lineId || !batchCode) return { error: "Line and batch code are required." };
  if (!operator) return { error: "Operator is required." };
  if (side !== "outboard" && side !== "inboard") return { error: "Invalid side." };

  // 스냅샷 — 마스터 데이터가 나중에 바뀌어도 기록 보존
  const [line, model, pn] = await Promise.all([
    prisma.line.findUnique({ where: { id: lineId }, include: { company: true } }),
    modelId      ? prisma.model.findUnique({ where: { id: modelId } })            : Promise.resolve(null),
    partNumberId ? prisma.partNumber.findUnique({ where: { id: partNumberId } })  : Promise.resolve(null),
  ]);

  const date = new Date();
  date.setHours(0, 0, 0, 0);

  await prisma.greaseLog.create({
    data: {
      lineId, modelId, partNumberId,
      companyName:    line?.company?.name ?? null,
      lineName:       line?.code ?? null,
      modelName:      model?.name ?? null,
      partNumberCode: pn?.code ?? null,
      date, side, batchCode, operator,
    },
  });
  await logAudit({
    action: "GREASE_CHANGE", entityType: "GreaseLog",
    detail: { lineId, modelId, partNumberId, side, batchCode, operator },
  });

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/grease");
  return { ok: true };
}

// 그리스 교체 기록 삭제 (오입력 정정)
export async function deleteGreaseLog(id: number) {
  await requireUser();
  if (!id) return { error: "Invalid id." };
  await prisma.greaseLog.delete({ where: { id } });
  await logAudit({ action: "GREASE_CHANGE_DELETE", entityType: "GreaseLog", entityId: id });
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/grease");
  return { ok: true };
}
