"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Search,
  Users,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { calculateMonthlyAttendance } from "@/lib/attendance-calculations";

type Person = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  active: boolean;
  [key: string]: unknown;
};
type Attendance = {
  id: string;
  userId: string;
  date: string;
  status: string;
  checkIn?: unknown;
  checkInAt?: unknown;
  checkOut?: unknown;
  checkOutAt?: unknown;
  totalHours?: number;
  [key: string]: unknown;
};
type Leave = {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  status: string;
  leaveType: string;
  paid?: boolean;
  isPaid?: boolean;
  [key: string]: unknown;
};
const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const fromMonth = (m: string) =>
  new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1);
const dateLabel = (m: string) =>
  fromMonth(m).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export default function FounderAttendancePage() {
  const router = useRouter();
  const [month, setMonth] = useState(monthKey(new Date()));
  const [people, setPeople] = useState<Person[]>([]);
  const [records, setRecords] = useState<Attendance[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("ALL");
  const [kind, setKind] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (!auth.currentUser)
        throw new Error("Please login to access attendance.");
      const [us, ats, ls] = await Promise.all([
        getDocs(query(collection(db, "users"), where("active", "==", true))),
        getDocs(
          query(
            collection(db, "attendance"),
            where("date", ">=", `${month}-01`),
            where("date", "<=", `${month}-31`),
          ),
        ),
        getDocs(collection(db, "leaveRequests")),
      ]);
      setPeople(
        us.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Person)
          .filter((p) => ["employee", "intern"].includes(p.role)),
      );
      setRecords(
        ats.docs.map((d) => ({ id: d.id, ...d.data() }) as Attendance),
      );
      setLeaves(ls.docs.map((d) => ({ id: d.id, ...d.data() }) as Leave));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load attendance.");
    } finally {
      setLoading(false);
    }
  }, [month]);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setLoading(false);
        setError("Please login to access attendance.");
        return;
      }
      void load();
    });
    return () => unsub();
  }, [load]);
  const rows = useMemo(
    () =>
      people.map((p) => {
        const own = records.filter((r) => r.userId === p.id);
        const ownLeaves = leaves.filter((l) => l.userId === p.id);
        const summary = calculateMonthlyAttendance(month, own, ownLeaves);
        return {
          p,
          days: summary.workingDays,
          present: summary.presentDays,
          leave: summary.leaveDays,
          absent: summary.absentDays,
          total: summary.totalHours,
          late: summary.lateDays,
          percent: summary.attendancePercentage,
          sundayWorked: summary.sundayWorkedDays,
        };
      }),
    [people, records, leaves, month],
  );
  const departments = Array.from(
    new Set(rows.map((r) => r.p.department || "General")),
  ).sort();
  const visible = rows.filter((r) => {
    const q = search.toLowerCase().trim();
    const s = r.absent
      ? "ABSENT"
      : r.leave
        ? "LEAVE"
        : r.late
          ? "LATE"
          : r.present
            ? "PRESENT"
            : "UPCOMING";
    return (
      (!q || `${r.p.name} ${r.p.email}`.toLowerCase().includes(q)) &&
      (department === "ALL" || r.p.department === department) &&
      (kind === "ALL" || r.p.role === kind.toLowerCase()) &&
      (status === "ALL" || s === status)
    );
  });
  const stepMonth = (amount: number) => {
    const d = fromMonth(month);
    d.setMonth(d.getMonth() + amount);
    setMonth(monthKey(d));
  };
  const exportCSV = () => {
    const header = [
      "Employee",
      "Email",
      "Department",
      "Role",
      "Month",
      "Working Days",
      "Present",
      "Leave",
      "Absent",
      "Sunday Worked",
      "Total Worked Days",
      "Hours",
      "Attendance %",
    ];
    const lines = visible.map(({ p, ...r }) => [
      p.name,
      p.email,
      p.department,
      p.role,
      month,
      r.days,
      r.present,
      r.leave,
      r.absent,
      r.sundayWorked,
      r.present,
      r.total.toFixed(2),
      r.percent,
    ]);
    const csv = [header, ...lines]
      .map((row) =>
        row.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className="min-h-screen bg-white text-[var(--brand-black)]">
      <header className="border-b border-[var(--brand-border)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/founder")}
              aria-label="Back"
              className="rounded-xl border border-[var(--brand-border)] p-3"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-[var(--brand-red)]">
                Founder / Management
              </p>
              <h1 className="text-2xl font-bold">Team Attendance</h1>
            </div>
          </div>
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-red)] px-4 py-3 text-sm font-semibold text-white"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-9">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <h2 className="text-4xl font-bold tracking-tight">
              Monthly overview
            </h2>
            <p className="mt-2 text-[var(--brand-medium-gray)]">
              Attendance and working hours for employees and interns.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[var(--brand-border)] p-2">
            <button
              onClick={() => stepMonth(-1)}
              aria-label="Previous month"
              className="rounded-lg p-2 hover:bg-gray-50"
            >
              <ChevronLeft size={18} />
            </button>
            <CalendarDays size={17} />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border-0 bg-transparent px-1 py-2 text-sm font-semibold outline-none"
            />
            <button
              onClick={() => stepMonth(1)}
              aria-label="Next month"
              className="rounded-lg p-2 hover:bg-gray-50"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm">
          <button
            onClick={() => stepMonth(-1)}
            className="inline-flex items-center gap-2 text-gray-600"
          >
            <ArrowLeft size={15} />
            Previous Month
          </button>
          <span className="font-semibold">{dateLabel(month)}</span>
          <button
            onClick={() => stepMonth(1)}
            className="inline-flex items-center gap-2 text-gray-600"
          >
            Next Month
            <ArrowRight size={15} />
          </button>
        </div>
        {error && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle size={18} />
            {error}
          </div>
        )}
        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_200px_160px_160px]">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={17}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee or intern"
              className="h-12 w-full rounded-xl border border-[var(--brand-border)] pl-10 pr-3 text-sm outline-none focus:border-[var(--brand-red)]"
            />
          </div>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="h-12 rounded-xl border border-[var(--brand-border)] px-3 text-sm"
          >
            <option value="ALL">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-12 rounded-xl border border-[var(--brand-border)] px-3 text-sm"
          >
            <option value="ALL">All types</option>
            <option value="employee">Employees</option>
            <option value="intern">Interns</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-12 rounded-xl border border-[var(--brand-border)] px-3 text-sm"
          >
            <option value="ALL">All statuses</option>
            <option value="PRESENT">Present</option>
            <option value="LATE">Late</option>
            <option value="LEAVE">On leave</option>
            <option value="ABSENT">Absent</option>
            <option value="UPCOMING">Upcoming</option>
          </select>
        </div>
        <div className="mt-5 flex items-center gap-2 text-sm text-gray-500">
          <Users size={16} />
          {visible.length} team members · {dateLabel(month)}
        </div>
        {loading ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-52 animate-pulse rounded-2xl bg-gray-100"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-[var(--brand-border)] p-12 text-center text-gray-500">
            No team members match these filters.
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map(
              ({
                p,
                days,
                present,
                leave,
                absent,
                total,
                percent,
                late,
                sundayWorked,
              }) => (
                <button
                  key={p.id}
                  onClick={() =>
                    router.push(
                      `/founder/attendance/${encodeURIComponent(p.id)}?month=${month}`,
                    )
                  }
                  className="rounded-2xl border border-[var(--brand-border)] bg-white p-5 text-left transition hover:border-[var(--brand-red)] hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 font-semibold">
                      {initials(p.name || p.email || "?")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold">
                        {p.name || "Unnamed member"}
                      </h3>
                      <p className="truncate text-xs text-gray-500">
                        {p.department || "General"} · {p.role}
                      </p>
                      <p className="mt-1 truncate text-xs text-gray-400">
                        {p.email}
                      </p>
                    </div>
                    <span className="rounded-full border px-2 py-1 text-[10px] font-bold uppercase">
                      {p.role}
                    </span>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-y-3 border-t border-gray-100 pt-4 text-sm">
                    <div>
                      <span className="block text-xs text-gray-500">
                        Working days
                      </span>
                      <b>{days}</b>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500">
                        Present
                      </span>
                      <b>{present}</b>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500">Leave</span>
                      <b>{leave}</b>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500">
                        Absent
                      </span>
                      <b>{absent}</b>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500">
                        Sunday worked
                      </span>
                      <b>{sundayWorked}</b>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500">
                        Total hours
                      </span>
                      <b className="inline-flex items-center gap-1">
                        <Clock3 size={13} />
                        {total.toFixed(1)}h
                      </b>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500">
                        Attendance
                      </span>
                      <b>{percent}%</b>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-between border-t border-gray-100 pt-3 text-xs">
                    <span className="text-gray-500">
                      {late} late {late === 1 ? "day" : "days"} ·{" "}
                      {p.active === false ? "Inactive" : "Active"}
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-[var(--brand-red)]">
                      View attendance
                      <ArrowRight size={14} />
                    </span>
                  </div>
                </button>
              ),
            )}
          </div>
        )}
      </div>
    </main>
  );
}
