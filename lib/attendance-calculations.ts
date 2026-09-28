export type AttendanceInputRecord = {
  id?: string;
  userId?: string;
  date?: string;
  status?: string;
  checkIn?: unknown;
  checkInAt?: unknown;
  checkOut?: unknown;
  checkOutAt?: unknown;
  totalHours?: number;
  notes?: string;
  requiredWorkday?: boolean;
  isRequiredWorkday?: boolean;
  compensationWorkday?: boolean;
  isHoliday?: boolean;
  [key: string]: unknown;
};

export type AttendanceLeaveRecord = {
  id?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  leaveType?: string;
  reason?: string;
  paid?: boolean;
  isPaid?: boolean;
  [key: string]: unknown;
};

export type MonthlyAttendanceDay = {
  date: string;
  record?: AttendanceInputRecord;
  leave?: AttendanceLeaveRecord;
  status: string;
  hours: number;
  sundayWork: boolean;
  requiredWorkday: boolean;
};

export type MonthlyAttendanceSummary = {
  workingDays: number;
  presentDays: number;
  leaveDays: number;
  absentDays: number;
  sundayWorkedDays: number;
  totalWorkedDays: number;
  totalHours: number;
  averageHoursPerDay: number;
  lateDays: number;
  overtimeHours: number;
  attendancePercentage: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  halfDays: number;
  days: MonthlyAttendanceDay[];
};

export function attendanceHours(record?: AttendanceInputRecord): number {
  if (!record) return 0;
  const start = record.checkInAt || record.checkIn;
  const end = record.checkOutAt || record.checkOut;
  if (!start || !end) return 0;
  if (
    typeof record.totalHours === "number" &&
    Number.isFinite(record.totalHours) &&
    record.totalHours > 0
  ) {
    return record.totalHours;
  }
  const millis = (value: unknown): number => {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return value;
    if (typeof value === "string") return new Date(value).getTime();
    if (
      value &&
      typeof value === "object" &&
      "toDate" in value &&
      typeof value.toDate === "function"
    ) {
      return (value.toDate as () => Date)().getTime();
    }
    if (
      value &&
      typeof value === "object" &&
      "seconds" in value &&
      typeof value.seconds === "number"
    ) {
      return value.seconds * 1000;
    }
    return Number.NaN;
  };
  const startMs = millis(start),
    endMs = millis(end);
  return Number.isFinite(startMs) && Number.isFinite(endMs)
    ? Math.max(0, (endMs - startMs) / 3_600_000)
    : 0;
}

export function calculateMonthlyAttendance(
  month: string,
  records: AttendanceInputRecord[],
  leaves: AttendanceLeaveRecord[],
  options: { asOf?: Date; standardHoursPerDay?: number } = {},
): MonthlyAttendanceSummary {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const asOf = options.asOf || new Date();
  const asOfKey = key(asOf);
  const recordsByDate = new Map(
    records
      .filter((r) => r.date?.startsWith(month))
      .map((record) => [record.date!, record]),
  );
  const approved = leaves.filter(
    (leave) => leave.status?.toUpperCase() === "APPROVED",
  );
  const days: MonthlyAttendanceDay[] = [];
  let workingDays = 0,
    presentDays = 0,
    leaveDays = 0,
    absentDays = 0;
  let sundayWorkedDays = 0,
    totalHours = 0,
    lateDays = 0,
    overtimeHours = 0;
  let paidLeaveDays = 0,
    unpaidLeaveDays = 0,
    halfDays = 0,
    scheduledLeaveDays = 0;
  const standardHours =
    options.standardHoursPerDay && options.standardHoursPerDay > 0
      ? options.standardHoursPerDay
      : 8;

  for (let index = 1; index <= lastDay; index++) {
    const dateObj = new Date(first.getFullYear(), first.getMonth(), index);
    const date = key(dateObj);
    const weekday = dateObj.getDay();
    const isSunday = weekday === 0;
    const record = recordsByDate.get(date);
    const statusFromRecord = (record?.status || "")
      .trim()
      .toUpperCase()
      .replace(/[_-]+/g, " ");
    const leave = approved.find(
      (item) =>
        item.startDate &&
        item.endDate &&
        date >= item.startDate &&
        date <= item.endDate,
    );
    const hasAttendance = Boolean(
      record?.checkIn ||
      record?.checkInAt ||
      statusFromRecord === "PRESENT" ||
      statusFromRecord === "LATE" ||
      statusFromRecord === "HALF DAY",
    );
    const requiredWorkday = Boolean(
      record?.requiredWorkday ||
      record?.isRequiredWorkday ||
      record?.compensationWorkday ||
      statusFromRecord === "REQUIRED WORKDAY" ||
      statusFromRecord === "COMPENSATION WORKDAY",
    );
    const holiday =
      record?.isHoliday === true || statusFromRecord === "HOLIDAY";
    const standardWorkday = weekday !== 0;
    if ((standardWorkday || (isSunday && requiredWorkday)) && !holiday)
      workingDays++;

    let status = "—";
    let sundayWork = false;
    const hours = attendanceHours(record);
    if (holiday) status = "HOLIDAY";
    else if (leave || statusFromRecord === "LEAVE") {
      status = "LEAVE";
      leaveDays++;
      if (!isSunday || requiredWorkday) scheduledLeaveDays++;
      if (leave?.paid === true || leave?.isPaid === true) paidLeaveDays++;
      else if (leave?.paid === false || leave?.isPaid === false)
        unpaidLeaveDays++;
    } else if (hasAttendance) {
      status = statusFromRecord.includes("HALF")
        ? "HALF DAY"
        : statusFromRecord === "LATE"
          ? "LATE"
          : "PRESENT";
      presentDays++;
      if (status === "LATE") lateDays++;
      if (status === "HALF DAY") halfDays++;
      if (isSunday) {
        sundayWork = true;
        sundayWorkedDays++;
      }
      totalHours += hours;
      overtimeHours += Math.max(0, hours - standardHours);
    } else if (isSunday && !requiredWorkday) status = "OFF";
    else if ((standardWorkday || requiredWorkday) && date <= asOfKey) {
      status = "ABSENT";
      absentDays++;
    }
    days.push({
      date,
      record,
      leave,
      status,
      hours,
      sundayWork,
      requiredWorkday,
    });
  }

  const denominator = Math.max(0, workingDays - scheduledLeaveDays);
  return {
    workingDays,
    presentDays,
    leaveDays,
    absentDays,
    sundayWorkedDays,
    totalWorkedDays: presentDays,
    totalHours,
    averageHoursPerDay: presentDays ? totalHours / presentDays : 0,
    lateDays,
    overtimeHours,
    attendancePercentage: denominator
      ? Math.min(100, Math.round((presentDays / denominator) * 100))
      : 0,
    paidLeaveDays,
    unpaidLeaveDays,
    halfDays,
    days,
  };
}

function key(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
