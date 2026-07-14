type SubmissionDepartmentWorkers = {
  readonly shift1LE: string | null;
  readonly shift2LE: string | null;
  readonly shift3LE: string | null;
  readonly shift1QC: string | null;
  readonly shift2QC: string | null;
  readonly shift3QC: string | null;
};

function hasText(value: string | null): boolean {
  return value !== null && value.trim() !== "";
}

export function hasProductionPendingForShift(
  submission: SubmissionDepartmentWorkers,
  shift: number,
): boolean {
  const leKey = shift === 1 ? "shift1LE" : shift === 2 ? "shift2LE" : "shift3LE";
  const qcKey = shift === 1 ? "shift1QC" : shift === 2 ? "shift2QC" : "shift3QC";
  const qualityDone = hasText(submission[qcKey as keyof SubmissionDepartmentWorkers]);
  const productionDone = hasText(submission[leKey as keyof SubmissionDepartmentWorkers]);
  return qualityDone && !productionDone;
}

export function hasAnyProductionPending(submission: SubmissionDepartmentWorkers): boolean {
  return hasProductionPendingForShift(submission, 1) ||
         hasProductionPendingForShift(submission, 2) ||
         hasProductionPendingForShift(submission, 3);
}
