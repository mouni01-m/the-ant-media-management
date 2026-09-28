"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Download,
  Save,
  Settings2,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { calculateMonthlyAttendance } from "@/lib/attendance-calculations";
type P = {
  name?: string;
  email?: string;
  role?: string;
  department?: string;
  active?: boolean;
  monthlySalary?: number | null;
  monthlyStipend?: number | null;
  dailyStipend?: number | null;
  workingDaysPerMonth?: number | null;
  standardHoursPerDay?: number | null;
  overtimeRate?: number | null;
  paidLeaveLimit?: number | null;
  bonus?: number | null;
  otherDeductions?: number | null;
};
type A = {
  id: string;
  userId?: string;
  date?: string;
  status?: string;
  checkIn?: unknown;
  checkInAt?: unknown;
  checkOut?: unknown;
  checkOutAt?: unknown;
  totalHours?: number;
  notes?: string;
};
type L = {
  id: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  leaveType?: string;
  reason?: string;
  paid?: boolean;
  isPaid?: boolean;
};
const first = (m: string) =>
  new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1);
const key = (d: Date) =>
  d.getFullYear() +
  "-" +
  String(d.getMonth() + 1).padStart(2, "0") +
  "-" +
  String(d.getDate()).padStart(2, "0");
const cash = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
const hours = (a?: A) => {
  if (!a || !(a.checkInAt || a.checkIn) || !(a.checkOutAt || a.checkOut))
    return 0;
  if (typeof a.totalHours === "number" && a.totalHours > 0) return a.totalHours;
  const s = new Date(String(a.checkInAt || a.checkIn)).getTime(),
    e = new Date(String(a.checkOutAt || a.checkOut)).getTime();
  return Number.isFinite(s) && Number.isFinite(e)
    ? Math.max(0, (e - s) / 3600000)
    : 0;
};
const fmtTime = (v: unknown) => {
  if (!v) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
};
const dur = (n: number) =>
  n ? Math.floor(n) + "h " + Math.round((n % 1) * 60) + "m" : "—";
export default function Detail() {
  const { userId } = useParams<{ userId: string }>(),
    id = decodeURIComponent(userId),
    router = useRouter(),
    params = useSearchParams();
  const [month, setMonth] = useState(
    params.get("month") ||
      new Date().getFullYear() +
        "-" +
        String(new Date().getMonth() + 1).padStart(2, "0"),
  );
  const [person, setPerson] = useState<P | null>(null),
    [records, setRecords] = useState<A[]>([]),
    [leaves, setLeaves] = useState<L[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState({
    monthlySalary: "",
    monthlyStipend: "",
    dailyStipend: "",
    workingDaysPerMonth: "",
    standardHoursPerDay: "8",
    overtimeRate: "",
    paidLeaveLimit: "",
    bonus: "0",
    otherDeductions: "0",
  });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!auth.currentUser) throw Error("Please log in to view attendance.");
      const [ps, as, ls, fs] = await Promise.all([
        getDoc(doc(db, "users", id)),
        getDocs(query(collection(db, "attendance"), where("userId", "==", id))),
        getDocs(
          query(collection(db, "leaveRequests"), where("userId", "==", id)),
        ),
        getDoc(doc(db, "users", auth.currentUser.uid)),
      ]);
      if (
        !fs.exists() ||
        fs.data().role !== "founder" ||
        fs.data().active === false
      )
        throw Error("Founder access is required.");
      if (!ps.exists()) throw Error("Team member not found.");
      const p = ps.data() as P;
      setPerson(p);
      setCfg({
        monthlySalary: p.monthlySalary == null ? "" : String(p.monthlySalary),
        monthlyStipend:
          p.monthlyStipend == null ? "" : String(p.monthlyStipend),
        dailyStipend: p.dailyStipend == null ? "" : String(p.dailyStipend),
        workingDaysPerMonth:
          p.workingDaysPerMonth == null ? "" : String(p.workingDaysPerMonth),
        standardHoursPerDay:
          p.standardHoursPerDay == null ? "8" : String(p.standardHoursPerDay),
        overtimeRate: p.overtimeRate == null ? "" : String(p.overtimeRate),
        paidLeaveLimit:
          p.paidLeaveLimit == null ? "" : String(p.paidLeaveLimit),
        bonus: p.bonus == null ? "0" : String(p.bonus),
        otherDeductions:
          p.otherDeductions == null ? "0" : String(p.otherDeductions),
      });
      setRecords(as.docs.map((d) => ({ id: d.id, ...d.data() }) as A));
      setLeaves(ls.docs.map((d) => ({ id: d.id, ...d.data() }) as L));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load attendance.");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    const u = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setError("Please log in to view attendance.");
        setLoading(false);
      } else void load();
    });
    return () => u();
  }, [load]);
  const calc = useMemo(() => {
    const summary = calculateMonthlyAttendance(month, records, leaves, {
      standardHoursPerDay: Number(cfg.standardHoursPerDay) || 8,
    });
    const allLeave = leaves.filter(
      (l) => l.startDate?.startsWith(month) || l.endDate?.startsWith(month),
    );
    const divisor = Number(cfg.workingDaysPerMonth) || summary.workingDays,
      monthly = Number(person?.monthlySalary || person?.monthlyStipend || 0),
      rate = divisor ? monthly / divisor : 0,
      paidCap =
        cfg.paidLeaveLimit === ""
          ? summary.paidLeaveDays
          : Number(cfg.paidLeaveLimit),
      paidDays = summary.presentDays + Math.min(summary.paidLeaveDays, paidCap),
      daily = Number(person?.dailyStipend || 0),
      pay =
        person?.role === "intern" && daily
          ? summary.presentDays * daily
          : Math.max(
              0,
              rate * paidDays -
                rate * (summary.absentDays + summary.unpaidLeaveDays) +
                Number(cfg.bonus || 0) +
                summary.overtimeHours * Number(cfg.overtimeRate || 0) -
                Number(cfg.otherDeductions || 0),
            );
    return {
      days: summary.days.map((day) => ({
        date: day.date,
        rec: day.record as A | undefined,
        lv: day.leave as L | undefined,
        status: day.status,
        h: day.hours,
        sundayWork: day.sundayWork,
      })),
      working: summary.workingDays,
      present: summary.presentDays,
      leave: summary.leaveDays,
      absent: summary.absentDays,
      late: summary.lateDays,
      half: summary.halfDays,
      total: summary.totalHours,
      ot: summary.overtimeHours,
      paid: summary.paidLeaveDays,
      unpaid: summary.unpaidLeaveDays,
      sundayWorked: summary.sundayWorkedDays,
      average: summary.averageHoursPerDay,
      percent: summary.attendancePercentage,
      allLeave,
      rate,
      pay,
      divisor,
    };
  }, [month, records, leaves, cfg, person]);
  const save = async () => {
    setSaving(true);
    try {
      const num = (x: string) => (x === "" ? null : Number(x));
      const patch = {
        monthlySalary: num(cfg.monthlySalary),
        monthlyStipend: num(cfg.monthlyStipend),
        dailyStipend: num(cfg.dailyStipend),
        workingDaysPerMonth: num(cfg.workingDaysPerMonth),
        standardHoursPerDay: num(cfg.standardHoursPerDay) || 8,
        overtimeRate: num(cfg.overtimeRate),
        paidLeaveLimit: num(cfg.paidLeaveLimit),
        bonus: num(cfg.bonus) || 0,
        otherDeductions: num(cfg.otherDeductions) || 0,
      };
      await updateDoc(doc(db, "users", id), patch);
      setPerson({ ...person, ...patch });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save pay settings.");
    } finally {
      setSaving(false);
    }
  };
  const exportFile = (salary: boolean) => {
    const rows = salary
      ? [
          [
            "Employee",
            "Department",
            "Type",
            "Month",
            "Working Days",
            "Present Days",
            "Leave Days",
            "Absent Days",
            "Sunday Worked",
            "Total Worked Days",
            "Total Hours",
            "Average Hours",
            "Late Days",
            "Overtime Hours",
            "Attendance %",
            "Monthly Pay",
            "Deductions",
            "Bonus",
            "Estimated Payable",
          ],
          [
            person?.name,
            person?.department,
            person?.role,
            month,
            calc.working,
            calc.present,
            calc.leave,
            calc.absent,
            calc.sundayWorked,
            calc.present,
            calc.total.toFixed(2),
            calc.average.toFixed(2),
            calc.late,
            calc.ot.toFixed(2),
            calc.percent,
            person?.monthlySalary ||
              person?.monthlyStipend ||
              person?.dailyStipend ||
              "Not configured",
            cfg.otherDeductions,
            cfg.bonus,
            calc.pay.toFixed(2),
          ],
        ]
      : [
          [
            "Employee",
            "Department",
            "Month",
            "Date",
            "Check In",
            "Check Out",
            "Hours",
            "Status",
            "Leave",
            "Notes",
          ],
          ...calc.days.map((x) => [
            person?.name,
            person?.department,
            month,
            x.date,
            x.rec?.checkInAt || x.rec?.checkIn || "",
            x.rec?.checkOutAt || x.rec?.checkOut || "",
            x.h.toFixed(2),
            x.status,
            x.lv?.leaveType || "",
            x.rec?.notes || x.lv?.reason || "",
          ]),
        ];
    const csv = rows
        .map((r) =>
          r
            .map((v) => '"' + String(v ?? "").replace(/"/g, '""') + '"')
            .join(","),
        )
        .join("\n"),
      url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      a = document.createElement("a");
    a.href = url;
    a.download =
      (salary ? "salary-" : "attendance-") + id + "-" + month + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const field = (name: keyof typeof cfg, label: string) => (
    <label className="text-xs text-gray-600">
      {label}
      <input
        type="number"
        min="0"
        step="any"
        value={cfg[name]}
        onChange={(e) => setCfg({ ...cfg, [name]: e.target.value })}
        className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900"
      />
    </label>
  );
  if (loading) return <main className="p-8">Loading attendance…</main>;
  return (
    <main className="min-h-screen bg-white text-gray-950">
      <header className="border-b border-gray-200">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <button
            onClick={() => router.push("/founder/attendance?month=" + month)}
            className="inline-flex items-center gap-2 text-sm font-semibold"
          >
            <ArrowLeft size={17} />
            Back to Attendance
          </button>
          <label className="flex items-center gap-2 text-sm">
            <CalendarDays size={17} />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2"
            />
          </label>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-8">
        {error && (
          <div className="mb-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle size={18} />
            {error}
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--brand-red)]">
              {person?.department || "General"} · {person?.role || "Member"}
            </p>
            <h1 className="mt-2 text-3xl font-bold">
              {person?.name || "Team member"}
            </h1>
            <p className="mt-1 text-sm text-gray-500">{person?.email}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportFile(false)}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm"
            >
              <Download size={16} />
              Export attendance
            </button>
            <button
              onClick={() => exportFile(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-red)] px-4 py-2 text-sm text-white"
            >
              <Download size={16} />
              Export pay report
            </button>
          </div>
        </div>
        <section className="mt-6 rounded-2xl border p-5">
          <b className="text-xs uppercase tracking-widest text-gray-500">
            Today
          </b>
          {(() => {
            const today = key(new Date()),
              a = records.find((x) => x.date === today),
              l = leaves.find(
                (x) =>
                  x.status?.toUpperCase() === "APPROVED" &&
                  x.startDate &&
                  x.endDate &&
                  today >= x.startDate &&
                  today <= x.endDate,
              );
            return (
              <div className="mt-2 flex flex-wrap gap-5 text-sm">
                <b>
                  {l
                    ? "On leave"
                    : a?.status ||
                      (a?.checkIn || a?.checkInAt ? "Present" : "No check-in")}
                </b>
                <span>
                  {fmtTime(a?.checkInAt || a?.checkIn)} →{" "}
                  {a?.checkOutAt || a?.checkOut
                    ? fmtTime(a.checkOutAt || a.checkOut)
                    : "In progress / —"}
                </span>
                <span>{dur(hours(a))}</span>
              </div>
            );
          })()}
        </section>
        <h2 className="mb-3 mt-7 text-lg font-bold">
          {first(month).toLocaleDateString("en-IN", {
            month: "long",
            year: "numeric",
          })}{" "}
          summary
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          {[
            ["Working days", calc.working],
            ["Present", calc.present],
            ["Leave", calc.leave],
            ["Absent", calc.absent],
            ["Sunday worked", calc.sundayWorked],
            ["Total hours", calc.total.toFixed(1) + "h"],
            ["Average hours/day", calc.average.toFixed(1) + "h"],
            ["Late days", calc.late],
            ["Overtime", calc.ot.toFixed(1) + "h"],
            ["Attendance", calc.percent + "%"],
            ["Half days", calc.half],
          ].map(([a, b]) => (
            <div key={String(a)} className="rounded-xl border p-4">
              <p className="text-xs text-gray-500">{a}</p>
              <b className="mt-2 block text-xl">{b}</b>
            </div>
          ))}
        </div>
        <section className="mt-7 overflow-hidden rounded-2xl border">
          <div className="border-b px-5 py-4">
            <h2 className="font-bold">Monthly attendance</h2>
            <p className="text-xs text-gray-500">
              Saturday is a regular working day. Sundays are optional and count
              when worked.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  {[
                    "Date",
                    "Day",
                    "Check In",
                    "Check Out",
                    "Hours",
                    "Status",
                    "Notes",
                  ].map((x) => (
                    <th key={x} className="px-4 py-3">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calc.days.map((x) => (
                  <tr key={x.date} className="border-t">
                    <td className="px-4 py-3">
                      {new Date(x.date + "T00:00:00").toLocaleDateString(
                        "en-IN",
                        { day: "2-digit", month: "short", year: "numeric" },
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {new Date(x.date + "T00:00:00").toLocaleDateString(
                        "en-IN",
                        { weekday: "long" },
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {fmtTime(x.rec?.checkInAt || x.rec?.checkIn)}
                    </td>
                    <td className="px-4 py-3">
                      {fmtTime(x.rec?.checkOutAt || x.rec?.checkOut)}
                    </td>
                    <td className="px-4 py-3">{dur(x.h)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "rounded-full border px-2 py-1 text-[10px] font-bold " +
                          (x.sundayWork
                            ? "border-[var(--brand-red)] text-[var(--brand-red)]"
                            : "")
                        }
                      >
                        {x.sundayWork ? "SUNDAY WORK · " : ""}
                        {x.status}
                      </span>
                    </td>
                    <td className="max-w-44 truncate px-4 py-3 text-gray-500">
                      {x.rec?.notes || x.lv?.reason || x.lv?.leaveType || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="mt-7 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border p-5">
            <h2 className="font-bold">Leave summary</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[
                ["Total taken", calc.leave],
                ["Paid", calc.paid],
                ["Unpaid", calc.unpaid],
                [
                  "Pending",
                  leaves.filter(
                    (l) =>
                      l.status?.toUpperCase() === "PENDING" &&
                      l.startDate?.startsWith(month),
                  ).length,
                ],
                [
                  "Approved",
                  calc.allLeave.filter(
                    (l) => l.status?.toUpperCase() === "APPROVED",
                  ).length,
                ],
              ].map(([a, b]) => (
                <p key={String(a)}>
                  {a}
                  <b className="float-right">{b}</b>
                </p>
              ))}
            </div>
            <h3 className="mt-5 border-t pt-4 text-sm font-semibold">
              Leave history
            </h3>
            {calc.allLeave.length ? (
              calc.allLeave.map((l) => (
                <p
                  key={l.id}
                  className="mt-3 flex justify-between gap-3 text-sm"
                >
                  <span>
                    {l.startDate} – {l.endDate} · {l.leaveType || "Leave"}
                  </span>
                  <span className="text-gray-500">
                    {l.status} ·{" "}
                    {l.paid === true || l.isPaid === true
                      ? "Paid"
                      : l.paid === false || l.isPaid === false
                        ? "Unpaid"
                        : "Pay type not set"}
                  </span>
                </p>
              ))
            ) : (
              <p className="mt-3 text-sm text-gray-500">
                No leave requests in this month.
              </p>
            )}
          </div>
          <div className="rounded-2xl border p-5">
            <div className="flex justify-between">
              <div>
                <h2 className="font-bold">
                  {person?.role === "intern" ? "Stipend" : "Salary"} & pay
                  summary
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Optional profile settings · estimate
                </p>
              </div>
              <Settings2 size={18} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {person?.role === "intern" ? (
                <>
                  {field("monthlyStipend", "Monthly stipend ₹")}
                  {field("dailyStipend", "Daily stipend ₹")}
                </>
              ) : (
                field("monthlySalary", "Monthly salary ₹")
              )}
              {field("workingDaysPerMonth", "Working days/month")}
              {field("paidLeaveLimit", "Paid leave limit")}
              {field("standardHoursPerDay", "Standard hours/day")}
              {field("overtimeRate", "Overtime rate/hour ₹")}
              {field("bonus", "Bonus ₹")}
              {field("otherDeductions", "Other deductions ₹")}
            </div>
            <button
              disabled={saving}
              onClick={() => void save()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"
            >
              <Save size={15} />
              {saving ? "Saving…" : "Save pay settings"}
            </button>
            <div className="mt-4 border-t pt-4 text-sm">
              <p className="flex justify-between">
                <span>Base pay</span>
                <b>
                  {person?.role === "intern"
                    ? person.monthlyStipend
                      ? cash(person.monthlyStipend)
                      : person.dailyStipend
                        ? cash(person.dailyStipend) + " / day"
                        : "Not configured"
                    : person?.monthlySalary
                      ? cash(person.monthlySalary)
                      : "Not configured"}
                </b>
              </p>
              <p className="mt-2 flex justify-between">
                <span>Daily rate</span>
                <b>{calc.rate ? cash(calc.rate) : "—"}</b>
              </p>
              <p className="mt-2 flex justify-between">
                <span>Overtime amount</span>
                <b>{cash(calc.ot * Number(cfg.overtimeRate || 0))}</b>
              </p>
              <p className="mt-2 flex justify-between">
                <span>Estimated payable</span>
                <b>
                  {person?.monthlySalary ||
                  person?.monthlyStipend ||
                  person?.dailyStipend
                    ? cash(calc.pay)
                    : "Configure pay to estimate"}
                </b>
              </p>
              <p className="mt-3 text-xs text-gray-500">
                Paid leave counts as paid only when its record explicitly marks
                it paid. Existing leave requests do not define pay type.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
