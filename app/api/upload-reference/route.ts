import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png":  ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
};
const ALLOWED = new Set(Object.keys(MIME_EXT));

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

// 항목 참조 사진 업로드 (어드민). CheckItem.referenceImage 갱신, 기존 파일은 교체 시 삭제
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const itemId = Number(form.get("itemId"));
  const file = form.get("file") as File | null;
  if (!itemId || !file) {
    return NextResponse.json({ error: "itemId and file required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Only JPEG/PNG/WebP/HEIC images allowed" }, { status: 400 });
  }

  const item = await prisma.checkItem.findUnique({ where: { id: itemId }, select: { id: true, referenceImage: true } });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const ext = MIME_EXT[file.type];
  const filename = `${randomUUID()}${ext}`;
  const dir = path.resolve(process.cwd(), "storage", "references");
  await mkdir(dir, { recursive: true });
  const filepath = path.resolve(dir, filename);
  if (!filepath.startsWith(dir + path.sep)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!sniffImageType(buffer)) {
    return NextResponse.json({ error: "File content is not a valid image" }, { status: 400 });
  }
  await writeFile(filepath, buffer);

  // DB 갱신 — 실패 시 새 파일 정리
  try {
    await prisma.checkItem.update({ where: { id: itemId }, data: { referenceImage: filename } });
  } catch (e) {
    await unlink(filepath).catch(() => {});
    throw e;
  }

  // 기존 파일 삭제 (교체)
  if (item.referenceImage && item.referenceImage !== filename) {
    await unlink(path.resolve(dir, item.referenceImage)).catch(() => {});
  }

  await logAudit({ action: "UPLOAD_REFERENCE", entityType: "CheckItem", entityId: itemId, detail: { filename } });
  return NextResponse.json({ ok: true, filename });
}

// 참조 사진 제거
export async function DELETE(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const itemId = Number(new URL(req.url).searchParams.get("itemId"));
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  const item = await prisma.checkItem.findUnique({ where: { id: itemId }, select: { referenceImage: true } });
  if (item?.referenceImage) {
    const dir = path.resolve(process.cwd(), "storage", "references");
    await unlink(path.resolve(dir, item.referenceImage)).catch(() => {});
  }
  await prisma.checkItem.update({ where: { id: itemId }, data: { referenceImage: null } });
  await logAudit({ action: "DELETE_REFERENCE", entityType: "CheckItem", entityId: itemId });
  return NextResponse.json({ ok: true });
}
