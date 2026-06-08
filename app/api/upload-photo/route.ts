import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
// 허용 이미지 타입 추가 시 여기에만 추가하면 ALLOWED도 자동 갱신됨
const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png":  ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
};
const ALLOWED = new Set(Object.keys(MIME_EXT));

// 파일 시그니처(매직바이트) 검사 — MIME 헤더만 믿지 않고 실제 내용이 이미지인지 확인
function sniffImageType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12).toLowerCase();
    if (["heic", "heix", "hevc", "heim", "heis", "hevm", "hevs", "mif1", "msf1", "heif"].includes(brand)) return "image/heic";
  }
  return null;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const submissionId = Number(form.get("submissionId"));
  const file = form.get("file") as File | null;
  const caption = (form.get("caption") as string | null)?.trim() || null;

  if (!submissionId || !file) {
    return NextResponse.json({ error: "submissionId and file required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Only JPEG/PNG/WebP/HEIC images allowed" }, { status: 400 });
  }

  // CorrectiveAction이 없으면 자동 생성 (사진만 먼저 올리는 경우 대비)
  const ca = await prisma.correctiveAction.upsert({
    where: { submissionId },
    create: { submissionId },
    update: {},
  });

  // 파일 저장 — 확장자는 MIME으로 결정 (file.name 신뢰 안 함)
  const ext = MIME_EXT[file.type];
  const filename = `${randomUUID()}${ext}`;
  const dir = path.resolve(process.cwd(), "storage", "attachments");
  await mkdir(dir, { recursive: true });
  const filepath = path.resolve(dir, filename);
  if (!filepath.startsWith(dir + path.sep) && filepath !== dir) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  // 매직바이트 검증 — 실제 내용이 허용 이미지인지 확인 (위장 파일 차단)
  if (!sniffImageType(buffer)) {
    return NextResponse.json({ error: "File content is not a valid image" }, { status: 400 });
  }

  await writeFile(filepath, buffer);

  // DB 기록 — 실패 시 방금 쓴 파일을 정리 (고아 파일 방지)
  let attachment;
  try {
    attachment = await prisma.attachment.create({
      data: {
        correctiveActionId: ca.id,
        filename,
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
        caption,
      },
    });
  } catch (e) {
    await unlink(filepath).catch(() => {});
    throw e;
  }

  await logAudit({
    action: "UPLOAD_PHOTO",
    entityType: "Submission",
    entityId: submissionId,
    detail: { filename, originalName: file.name, size: file.size },
  });

  return NextResponse.json({ ok: true, id: attachment.id, filename });
}
