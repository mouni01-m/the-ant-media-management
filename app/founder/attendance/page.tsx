"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  CalendarDays,
  Check,
  Clock3,
  Download,
  Filter,
  Plane,
  RefreshCw,
  Search,
  Users,
  X,
  ArrowLeft,
  AlertCircle,
  UserCheck,
  Timer,
} from "lucide-react";

import { auth, db } from "@/lib/firebase";

type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "LEAVE" | string;

type UserRecord = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  department?: string;
  active?: boolean;
};

type AttendanceRecord = {
  id: string;
  userId?: string;
  userName?: string;
  email?: string;
  date?: string;
  status?: AttendanceStatus;
  checkInAt?: Timestamp | Date | string | null;
  checkOutAt?: Timestamp | Date | string | null;
  totalHours?: number;
};

type LeaveRecord = {
  id: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  leaveType?: string;
  reason?: string;
};

type TeamAttendance = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  department: string;
  status: AttendanceStatus;
  checkInAt: Timestamp | Date | string | null;
  checkOutAt: Timestamp | Date | string | null;
  totalHours: number;
  leaveType?: string;
};

function formatTime(value: Timestamp | Date | string | null | undefined) {
  if (!value) return "—";

  try {
    let date: Date;

    if (value instanceof Timestamp) {
      date = value.toDate();
    } else if (value instanceof Date) {
      date = value;
    } else {
      date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}

function calculateHours(
  checkIn: Timestamp | Date | string | null | undefined,
  checkOut: Timestamp | Date | string | null | undefined,
  storedHours?: number,
) {
  if (typeof storedHours === "number" && Number.isFinite(storedHours)) {
    return storedHours;
  }

  if (!checkIn || !checkOut) return 0;

  try {
    const start =
      checkIn instanceof Timestamp
        ? checkIn.toDate()
        : checkIn instanceof Date
          ? checkIn
          : new Date(checkIn);

    const end =
      checkOut instanceof Timestamp
        ? checkOut.toDate()
        : checkOut instanceof Date
          ? checkOut
          : new Date(checkOut);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return 0;
    }

    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    return Math.max(0, hours);
  } catch {
    return 0;
  }
}

function formatHours(hours: number) {
  if (!hours || hours <= 0) return "—";

  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);

  if (whole === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${whole}h`;
  }

  return `${whole}h ${minutes}m`;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDateDisplay(dateString: string) {
  try {
    const date = new Date(`${dateString}T00:00:00`);

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}

function getTodayString() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function StatusBadge({ status }: { status: AttendanceStatus }) {
  const normalized = status.toUpperCase();

  if (normalized === "PRESENT") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">
        <Check size={13} />
        PRESENT
      </span>
    );
  }

  if (normalized === "LATE") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700">
        <Clock3 size={13} />
        LATE
      </span>
    );
  }

  if (normalized === "LEAVE") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-400">
        <Plane size={13} />
        LEAVE
      </span>
    );
  }

  if (normalized === "ABSENT") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-700">
        <X size={13} />
        ABSENT
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-[var(--brand-border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--brand-black)]">
      {normalized}
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  description: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[var(--brand-red-secondary)]/30">
      <div className="relative">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--brand-red-secondary)]/10 bg-[var(--brand-red)]/10 text-[var(--brand-red)]">
          {icon}
        </div>

        <p className="text-sm font-medium text-[var(--brand-dark-gray)]">
          {label}
        </p>

        <p className="mt-2 text-4xl font-bold tracking-tight text-[var(--brand-dark-gray)]">
          {value}
        </p>

        <p className="mt-2 text-xs text-[var(--brand-medium-gray)]">
          {description}
        </p>
      </div>
    </div>
  );
}

export default function FounderAttendancePage() {
  const [selectedDate, setSelectedDate] = useState(getTodayString());

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const loadAttendance = useCallback(
    async (showRefresh = false) => {
      try {
        if (showRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const currentUser = auth.currentUser;

        if (!currentUser) {
          setError("Please login to access the attendance workspace.");
          return;
        }

        /*
         * IMPORTANT:
         *
         * We intentionally do NOT block this page using:
         *
         *   if (profile.role !== "founder")
         *
         * The Firebase security rules should control access.
         * This prevents the frontend role/profile mismatch
         * from producing the previous false error.
         */

        // --------------------------------------------------
        // 1. LOAD TEAM USERS
        // --------------------------------------------------

        const usersSnapshot = await getDocs(
          query(collection(db, "users"), where("active", "==", true)),
        );

        const loadedUsers: UserRecord[] = [];

        usersSnapshot.forEach((docSnap) => {
          const data = docSnap.data();

          // Founder is management, but attendance is for
          // employees and interns.
          if (data.role === "employee" || data.role === "intern") {
            loadedUsers.push({
              id: docSnap.id,
              name: data.name || "Unknown User",
              email: data.email || "",
              role: data.role || "",
              department: data.department || "general",
              active: data.active !== false,
            });
          }
        });

        // --------------------------------------------------
        // 2. LOAD ATTENDANCE FOR SELECTED DATE
        // --------------------------------------------------

        const attendanceSnapshot = await getDocs(
          query(
            collection(db, "attendance"),
            where("date", "==", selectedDate),
          ),
        );

        const loadedAttendance: AttendanceRecord[] = [];

        attendanceSnapshot.forEach((docSnap) => {
          const data = docSnap.data();

          loadedAttendance.push({
            id: docSnap.id,
            userId: data.userId || "",
            userName: data.userName || "",
            email: data.email || "",
            date: data.date || selectedDate,
            status: data.status || "",
            checkInAt: data.checkInAt || null,
            checkOutAt: data.checkOutAt || null,
            totalHours:
              typeof data.totalHours === "number" ? data.totalHours : undefined,
          });
        });

        // --------------------------------------------------
        // 3. LOAD APPROVED LEAVES
        // --------------------------------------------------

        const leaveSnapshot = await getDocs(
          query(
            collection(db, "leaveRequests"),
            where("status", "==", "APPROVED"),
          ),
        );

        const loadedLeaves: LeaveRecord[] = [];

        leaveSnapshot.forEach((docSnap) => {
          const data = docSnap.data();

          loadedLeaves.push({
            id: docSnap.id,
            userId: data.userId || "",
            userName: data.userName || "",
            userEmail: data.userEmail || "",
            startDate: data.startDate || "",
            endDate: data.endDate || "",
            status: data.status || "",
            leaveType: data.leaveType || "Leave",
            reason: data.reason || "",
          });
        });

        setUsers(loadedUsers);
        setAttendance(loadedAttendance);
        setLeaves(loadedLeaves);
      } catch (err: any) {
        console.error("ATTENDANCE LOAD ERROR:", err);

        if (err?.code === "permission-denied") {
          setError(
            "Firebase denied access to team attendance. Please check the Firestore security rules.",
          );
        } else if (err?.code === "failed-precondition") {
          setError(
            "Firestore needs an index for this query. Check the browser console for the Firebase index link.",
          );
        } else {
          setError(err?.message || "Unable to load attendance data.");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedDate],
  );

  // --------------------------------------------------
  // AUTH + INITIAL LOAD
  // --------------------------------------------------

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        setError("Please login to access attendance.");
        return;
      }

      await loadAttendance();
    });

    return () => unsubscribe();
  }, [loadAttendance]);

  // --------------------------------------------------
  // CREATE FINAL TEAM ATTENDANCE VIEW
  // --------------------------------------------------

  const teamAttendance = useMemo(() => {
    const attendanceMap = new Map<string, AttendanceRecord>();

    attendance.forEach((record) => {
      if (record.userId) {
        attendanceMap.set(record.userId, record);
      }
    });

    const result: TeamAttendance[] = [];

    users.forEach((user) => {
      const record = attendanceMap.get(user.id);

      // Check approved leave for selected date.
      const approvedLeave = leaves.find((leave) => {
        if (!leave.userId || leave.userId !== user.id) {
          return false;
        }

        if (!leave.startDate || !leave.endDate) {
          return false;
        }

        return selectedDate >= leave.startDate && selectedDate <= leave.endDate;
      });

      let status: AttendanceStatus = "ABSENT";

      if (approvedLeave) {
        status = "LEAVE";
      } else if (record?.status) {
        status = record.status;
      }

      const checkInAt = record?.checkInAt || null;

      const checkOutAt = record?.checkOutAt || null;

      const totalHours = calculateHours(
        checkInAt,
        checkOutAt,
        record?.totalHours,
      );

      result.push({
        id: user.id,
        userId: user.id,
        name: user.name || record?.userName || "Unknown User",
        email: user.email || record?.email || "",
        role: user.role || "",
        department: user.department || "general",
        status,
        checkInAt,
        checkOutAt,
        totalHours,
        leaveType: approvedLeave?.leaveType,
      });
    });

    return result;
  }, [users, attendance, leaves, selectedDate]);

  // --------------------------------------------------
  // FILTERING
  // --------------------------------------------------

  const filteredAttendance = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return teamAttendance.filter((person) => {
      const matchesSearch =
        !searchValue ||
        person.name.toLowerCase().includes(searchValue) ||
        person.email.toLowerCase().includes(searchValue);

      const matchesDepartment =
        departmentFilter === "ALL" || person.department === departmentFilter;

      const matchesStatus =
        statusFilter === "ALL" || person.status.toUpperCase() === statusFilter;

      return matchesSearch && matchesDepartment && matchesStatus;
    });
  }, [teamAttendance, search, departmentFilter, statusFilter]);

  // --------------------------------------------------
  // STATS
  // --------------------------------------------------

  const stats = useMemo(() => {
    const present = teamAttendance.filter(
      (item) => item.status.toUpperCase() === "PRESENT",
    ).length;

    const late = teamAttendance.filter(
      (item) => item.status.toUpperCase() === "LATE",
    ).length;

    const absent = teamAttendance.filter(
      (item) => item.status.toUpperCase() === "ABSENT",
    ).length;

    const onLeave = teamAttendance.filter(
      (item) => item.status.toUpperCase() === "LEAVE",
    ).length;

    return {
      team: teamAttendance.length,
      present,
      late,
      absent,
      onLeave,
    };
  }, [teamAttendance]);

  // --------------------------------------------------
  // DEPARTMENTS
  // --------------------------------------------------

  const departments = useMemo(() => {
    return Array.from(
      new Set(teamAttendance.map((item) => item.department).filter(Boolean)),
    ).sort();
  }, [teamAttendance]);

  // --------------------------------------------------
  // EXPORT CSV
  // --------------------------------------------------

  const exportCSV = () => {
    if (!teamAttendance.length) {
      return;
    }

    const headers = [
      "Employee",
      "Email",
      "Role",
      "Department",
      "Date",
      "Status",
      "Check In",
      "Check Out",
      "Total Hours",
    ];

    const rows = teamAttendance.map((person) => [
      person.name,
      person.email,
      person.role,
      person.department,
      selectedDate,
      person.status,
      formatTime(person.checkInAt),
      formatTime(person.checkOutAt),
      person.totalHours ? person.totalHours.toFixed(2) : "0",
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) => {
            const safeValue = String(value ?? "");

            return `"${safeValue.replace(/"/g, '""')}"`;
          })
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = `ant-media-attendance-${selectedDate}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  // --------------------------------------------------
  // NAVIGATION
  // --------------------------------------------------

  const goBack = () => {
    window.location.href = "/founder";
  };

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <main className="min-h-screen bg-white text-[var(--brand-black)]">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden"></div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--brand-border)] bg-white ">
        <div className="mx-auto flex h-[94px] max-w-[1800px] items-center justify-between px-6 lg:px-10">
          <div className="flex items-center gap-5">
            <button
              onClick={goBack}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-black)] transition hover:border-[var(--brand-red-secondary)]/30 hover:bg-[var(--brand-red)]/10 hover:text-[var(--brand-black)]"
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[var(--brand-red)]">
                Founder / Management
              </p>

              <h1 className="mt-1 text-2xl font-bold tracking-tight">
                Attendance
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadAttendance(true)}
              disabled={refreshing}
              className="hidden items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white px-5 py-3 text-sm font-semibold text-[var(--brand-black)] transition hover:border-[var(--brand-border)] hover:bg-[var(--brand-red-light)] disabled:opacity-50 sm:flex"
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>

            <button
              onClick={exportCSV}
              disabled={teamAttendance.length === 0}
              className="flex items-center gap-2 rounded-xl bg-[var(--brand-red)] px-5 py-3 text-sm font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/20 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Export</span>
            </button>

            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--brand-red)] text-lg font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/20">
              A
            </div>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1800px] px-6 py-10 lg:px-10">
        {/* Hero */}
        <section className="mb-10">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <div className="mb-5 flex items-center gap-2 text-sm font-medium text-[var(--brand-red)]">
                <CalendarDays size={17} />
                People & availability
              </div>

              <h2 className="text-5xl font-bold tracking-[-0.04em] sm:text-6xl">
                Team attendance.
              </h2>

              <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--brand-medium-gray)]">
                Monitor attendance, working hours, late arrivals, absences and
                approved leave across the workspace.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-5 py-3 text-sm font-semibold text-emerald-700 lg:self-end">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              Workspace Active
            </div>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="mb-8 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.07] p-5 text-red-700">
            <AlertCircle size={20} className="mt-0.5 shrink-0" />

            <div>
              <p className="font-semibold">Attendance could not be loaded</p>

              <p className="mt-1 text-sm text-red-700/70">{error}</p>
            </div>
          </div>
        )}

        {/* Stats */}
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            icon={<Users size={21} />}
            label="Team"
            value={stats.team}
            description="Active members"
          />

          <StatCard
            icon={<UserCheck size={21} />}
            label="Present"
            value={stats.present}
            description="Checked in"
          />

          <StatCard
            icon={<Clock3 size={21} />}
            label="Late"
            value={stats.late}
            description="Late arrivals"
          />

          <StatCard
            icon={<X size={21} />}
            label="Absent"
            value={stats.absent}
            description="No attendance"
          />

          <StatCard
            icon={<Plane size={21} />}
            label="On Leave"
            value={stats.onLeave}
            description={
              stats.team
                ? `${Math.round(
                    (stats.onLeave / stats.team) * 100,
                  )}% attendance`
                : "0% attendance"
            }
          />
        </section>

        {/* Filters */}
        <section className="mb-8 rounded-2xl border border-[var(--brand-border)] bg-white p-4 ">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_1fr_210px_180px]">
            {/* Date */}
            <div className="relative">
              <CalendarDays
                size={17}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--brand-black)]"
              />

              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="h-14 w-full rounded-xl border border-[var(--brand-border)] bg-white pl-11 pr-4 text-sm font-medium text-[var(--brand-black)] outline-none transition focus:border-[var(--brand-red-secondary)]/50"
              />
            </div>

            {/* Search */}
            <div className="relative">
              <Search
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--brand-black)]"
              />

              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employee or email..."
                className="h-14 w-full rounded-xl border border-[var(--brand-border)] bg-white pl-11 pr-4 text-sm text-[var(--brand-black)] outline-none placeholder:text-[var(--brand-black)] transition focus:border-[var(--brand-red-secondary)]/50"
              />
            </div>

            {/* Department */}
            <div className="relative">
              <Filter
                size={16}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--brand-black)]"
              />

              <select
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
                className="h-14 w-full appearance-none rounded-xl border border-[var(--brand-border)] bg-white pl-11 pr-4 text-sm font-medium text-[var(--brand-black)] outline-none transition focus:border-[var(--brand-red-secondary)]/50"
              >
                <option value="ALL">All departments</option>

                {departments.map((department) => (
                  <option key={department} value={department}>
                    {department.charAt(0).toUpperCase() + department.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-14 w-full appearance-none rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm font-medium text-[var(--brand-black)] outline-none transition focus:border-[var(--brand-red-secondary)]/50"
              >
                <option value="ALL">All status</option>
                <option value="PRESENT">Present</option>
                <option value="LATE">Late</option>
                <option value="ABSENT">Absent</option>
                <option value="LEAVE">Leave</option>
              </select>
            </div>
          </div>
        </section>

        {/* Main attendance table */}
        <section className="overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-white">
          <div className="flex flex-col justify-between gap-4 border-b border-[var(--brand-border)] px-6 py-6 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-xl font-bold">Attendance records</h3>

              <p className="mt-1 text-sm text-[var(--brand-medium-gray)]">
                {filteredAttendance.length} member
                {filteredAttendance.length !== 1 ? "s" : ""} shown for{" "}
                {formatDateDisplay(selectedDate)}
              </p>
            </div>

            <button
              onClick={() => loadAttendance(true)}
              className="flex items-center justify-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] sm:hidden"
            >
              <RefreshCw
                size={15}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="space-y-4 p-6">
              {Array.from({
                length: 5,
              }).map((_, index) => (
                <div
                  key={index}
                  className="h-20 animate-pulse rounded-xl bg-white"
                />
              ))}
            </div>
          ) : filteredAttendance.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--brand-border)] bg-white text-[var(--brand-black)]">
                <Users size={28} />
              </div>

              <h4 className="text-lg font-bold">No attendance records</h4>

              <p className="mt-2 max-w-md text-sm leading-6 text-[var(--brand-medium-gray)]">
                No team members match the current date, search and filter
                settings.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1050px]">
                  <thead>
                    <tr className="border-b border-[var(--brand-border)] text-left">
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--brand-black)]">
                        Team Member
                      </th>

                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--brand-black)]">
                        Department
                      </th>

                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--brand-black)]">
                        Check In
                      </th>

                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--brand-black)]">
                        Check Out
                      </th>

                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--brand-black)]">
                        Total Hours
                      </th>

                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[var(--brand-black)]">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredAttendance.map((person) => (
                      <tr
                        key={person.id}
                        className="border-b border-[var(--brand-border)] transition hover:bg-[var(--brand-red-light)]"
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-red)] text-sm font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/10">
                              {getInitials(person.name)}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate font-semibold text-[var(--brand-dark-gray)]">
                                {person.name}
                              </p>

                              <p className="mt-1 truncate text-xs text-[var(--brand-medium-gray)]">
                                {person.email}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-5">
                          <span className="rounded-lg border border-[var(--brand-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--brand-black)]">
                            {person.department
                              ? person.department.charAt(0).toUpperCase() +
                                person.department.slice(1)
                              : "General"}
                          </span>
                        </td>

                        <td className="px-6 py-5 text-sm text-[var(--brand-black)]">
                          {formatTime(person.checkInAt)}
                        </td>

                        <td className="px-6 py-5 text-sm text-[var(--brand-black)]">
                          {formatTime(person.checkOutAt)}
                        </td>

                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--brand-black)]">
                            <Timer
                              size={15}
                              className="text-[var(--brand-red)]"
                            />
                            {formatHours(person.totalHours)}
                          </div>
                        </td>

                        <td className="px-6 py-5">
                          <StatusBadge status={person.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="divide-y divide-[var(--brand-border)] lg:hidden">
                {filteredAttendance.map((person) => (
                  <div key={person.id} className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-red)] text-sm font-bold">
                          {getInitials(person.name)}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {person.name}
                          </p>

                          <p className="truncate text-xs text-[var(--brand-medium-gray)]">
                            {person.email}
                          </p>
                        </div>
                      </div>

                      <StatusBadge status={person.status} />
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-[var(--brand-border)] bg-white p-3">
                        <p className="text-[10px] uppercase tracking-wider text-[var(--brand-medium-gray)]">
                          Department
                        </p>

                        <p className="mt-1 text-sm font-medium text-[var(--brand-dark-gray)]">
                          {person.department}
                        </p>
                      </div>

                      <div className="rounded-xl border border-[var(--brand-border)] bg-white p-3">
                        <p className="text-[10px] uppercase tracking-wider text-[var(--brand-medium-gray)]">
                          Total Hours
                        </p>

                        <p className="mt-1 text-sm font-medium text-[var(--brand-dark-gray)]">
                          {formatHours(person.totalHours)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-[var(--brand-border)] bg-white p-3">
                        <p className="text-[10px] uppercase tracking-wider text-[var(--brand-medium-gray)]">
                          Check In
                        </p>

                        <p className="mt-1 text-sm font-medium text-[var(--brand-dark-gray)]">
                          {formatTime(person.checkInAt)}
                        </p>
                      </div>

                      <div className="rounded-xl border border-[var(--brand-border)] bg-white p-3">
                        <p className="text-[10px] uppercase tracking-wider text-[var(--brand-medium-gray)]">
                          Check Out
                        </p>

                        <p className="mt-1 text-sm font-medium text-[var(--brand-dark-gray)]">
                          {formatTime(person.checkOutAt)}
                        </p>
                      </div>
                    </div>

                    {person.status.toUpperCase() === "LEAVE" &&
                      person.leaveType && (
                        <div className="mt-3 rounded-xl border border-sky-500/10 bg-sky-500/[0.05] px-4 py-3 text-sm text-sky-300">
                          Approved leave: {person.leaveType}
                        </div>
                      )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Footer information */}
        <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-red)]/10 text-[var(--brand-red)]">
              <Check size={19} />
            </div>

            <h4 className="font-bold">Automatic tracking</h4>

            <p className="mt-2 text-sm leading-6 text-[var(--brand-medium-gray)]">
              Check-in and check-out times are recorded automatically by the
              employee workspace.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-red)]/10 text-[var(--brand-red)]">
              <Plane size={19} />
            </div>

            <h4 className="font-bold">Leave integration</h4>

            <p className="mt-2 text-sm leading-6 text-[var(--brand-medium-gray)]">
              Approved leave requests automatically appear as LEAVE in team
              attendance.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-red)]/10 text-[var(--brand-red)]">
              <Download size={19} />
            </div>

            <h4 className="font-bold">Export reports</h4>

            <p className="mt-2 text-sm leading-6 text-[var(--brand-medium-gray)]">
              Export the selected day's attendance as a CSV report for
              management records.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
