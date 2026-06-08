import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { readFile, unlink } from "fs/promises";
import path from "path";

const ATTACH_DIR = path.resolve(process.cwd(), "storage", "attachments");

function safeAttachPath(filename: string): string | null {
  const resolved = path.resolve(ATTACH_DIR, filename);
  return resolved.startsWith(ATTACH_DIR + path.sep) ? resolved : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const pid = Number(id);
  if (!Number.isFinite(pid)) return new NextResponse("Not found", { status: 404 });
  const photo = await prisma.attachment.findUnique({ where: { id: pid } });
  if (!photo) return new NextResponse("Not found", { status: 404 });

  const filepath = safeAttachPath(photo.filename);
  if (!filepath) return new NextResponse("Invalid path", { status: 400 });
  try {
    const buffer = await readFile(filepath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": photo.mimeType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("File missing", { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const pid = Number(id);
  if (!Number.isFinite(pid)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const photo = await prisma.attachment.findUnique({ where: { id: pid } });
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filepath = safeAttachPath(photo.filename);
  if (!filepath) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  try { await unlink(filepath); } catch {}

  await prisma.attachment.delete({ where: { id: photo.id } });
  await logAudit({
    action: "DELETE_PHOTO",
    entityType: "Attachment",
    entityId: photo.id,
    detail: { filename: photo.filename, originalName: photo.originalName },
  });
  return NextResponse.json({ ok: true });
}
