"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser, checkAdminPw } from "@/lib/auth";
import { DEVICE_DEPARTMENT_COOKIE, DEVICE_NAME_COOKIE, parseDeviceDepartment } from "@/lib/device";

const oneYearSeconds = 60 * 60 * 24 * 365;

function readText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export async function setDeviceSettingsAction(formData: FormData) {
  await requireUser();

  const name = readText(formData, "deviceName");
  const adminPw = readText(formData, "adminPw");
  const department = parseDeviceDepartment(readText(formData, "deviceDepartment"));

  if (!(await checkAdminPw(adminPw))) redirect("/device?error=pw");
  if (!department) redirect("/device?error=dept");

  const cookieStore = await cookies();
  if (name) {
    cookieStore.set(DEVICE_NAME_COOKIE, name, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: oneYearSeconds,
    });
  } else {
    cookieStore.delete(DEVICE_NAME_COOKIE);
  }

  cookieStore.set(DEVICE_DEPARTMENT_COOKIE, department, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: oneYearSeconds,
  });

  redirect("/device?success=1");
}
