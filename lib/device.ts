export const DEVICE_NAME_COOKIE = "qc_device";
export const DEVICE_DEPARTMENT_COOKIE = "qc_device_department";

export const DEVICE_DEPARTMENTS = ["QC", "PROD"] as const;
export type DeviceDepartment = (typeof DEVICE_DEPARTMENTS)[number];

export function parseDeviceDepartment(value: string | null | undefined): DeviceDepartment | null {
  if (value === "QC" || value === "PROD") return value;
  return null;
}

export function deviceDepartmentLabel(department: DeviceDepartment): string {
  return department === "QC" ? "Quality" : "Production";
}
