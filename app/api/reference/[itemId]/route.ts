import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readFile } from "fs/promises";
import path from "path";

const REF_DIR = path.resolve(process.cwd(), "storage", "references");

const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".heic": "image/heic", ".heif": "image/heif",
};

// 항목 참조 사진 서빙 (작업자도 조회). itemId → CheckItem.referenceImage 파일
export async function GET(_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  if (!(await isAuthenticated())) return new NextResponse("Unauthorized", { status: 401 });
  const { itemId } = await params;
  const id = Number(itemId);
  if (!Number.isFinite(id)) return new NextResponse("Not found", { status: 404 });

  const item = await prisma.checkItem.findUnique({ where: { id }, select: { referenceImage: true } });
  if (!item?.referenceImage) return new NextResponse("Not found", { status: 404 });

  const filepath = path.resolve(REF_DIR, item.referenceImage);
  if (!filepath.startsWith(REF_DIR + path.sep)) return new NextResponse("Invalid path", { status: 400 });

  try {
    const buffer = await readFile(filepath);
    const mime = EXT_MIME[path.extname(item.referenceImage).toLowerCase()] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new NextResponse("File missing", { status: 404 });
  }
}
