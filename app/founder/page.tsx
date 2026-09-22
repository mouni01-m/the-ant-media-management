"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Target,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  X,
  Zap,
} from "lucide-react";

import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import BrandLogo from "@/app/components/brand-logo";

type Task = {
  id: string;
  title?: string;
  description?: string;
  assignedTo?: string;
  assignedToId?: string;
  assignedUserId?: string;
  assignedToName?: string;
  submittedByName?: string;
  teamMemberIds?: string[];
  teamMembers?: Array<{
    id?: string;
    name?: string;
    email?: string;
    role?: string;
    department?: string;
    isTeamLead?: boolean;
  }>;
  client?: string;
  clientName?: string;
  department?: string;
  priority?: string;
  deadline?: string;
  deadlineDate?: string;
  deadlineTime?: string;
  status?: string;
  createdAt?: any;
  updatedAt?: any;
};

type UserProfile = {
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
  role?: string;
  department?: string;
  date?: string;
  checkIn?: any;
  checkOut?: any;
  status?: string;
  totalHours?: number;
};

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatTodayLong() {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getTimestampMillis(value: any) {
  try {
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (typeof value?.toDate === "function") return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    if (typeof value === "string" || typeof value === "number")
      return new Date(value).getTime();
  } catch {}
  return 0;
}

function normalizeStatus(status?: string) {
  return String(status || "TO DO")
    .toUpperCase()
    .replace(/[\\_-]+/g, " ")
    .trim();
}

function isCompleted(status?: string) {
  return normalizeStatus(status) === "COMPLETED";
}

function isActiveTask(task: Task) {
  return !isCompleted(task.status);
}

function getTaskDateKey(task: Task) {
  const raw = task.deadlineDate || task.deadline || "";
  if (!raw) return "";
  return String(raw).slice(0, 10);
}

function isTaskOverdue(task: Task) {
  if (!task.deadline && !task.deadlineDate) return false;
  if (isCompleted(task.status)) return false;

  const raw = task.deadline || task.deadlineDate || "";
  const value =
    task.deadlineTime && !String(raw).includes("T")
      ? `${raw}T${task.deadlineTime}`
      : raw;
  const date = new Date(value);

  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function getWorkloadLabel(value: number) {
  if (value <= 0) return "No active tasks";
  if (value >= 50) return "Largest share";
  if (value >= 25) return "Significant share";
  return "Active";
}

function getPriorityClass(priority?: string) {
  const value = String(priority || "MEDIUM").toUpperCase();
  if (value === "URGENT" || value === "HIGH")
    return "bg-red-500/10 text-red-700 border-red-500/20";
  if (value === "MEDIUM")
    return "bg-amber-500/10 text-amber-700 border-amber-500/20";
  return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
}

export default function FounderDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [activePage, setActivePage] = useState("Overview");
  const [employeeNotificationCount, setEmployeeNotificationCount] = useState(0);
  const [founderName, setFounderName] = useState("Founder");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [liveTasks, setLiveTasks] = useState<Task[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>(
    [],
  );
  const [todayApprovedLeaveIds, setTodayApprovedLeaveIds] = useState<string[]>(
    [],
  );

  /*
   * LIVE FOUNDER OVERVIEW DATA
   * Everything shown in the operational dashboard below is derived from
   * the current Firestore workspace — no demo task/team/attendance values.
   */
  useEffect(() => {
    let unsubscribeUsers: (() => void) | null = null;
    let unsubscribeTasks: (() => void) | null = null;
    let unsubscribeAttendance: (() => void) | null = null;
    let unsubscribeLeaveRequests: (() => void) | null = null;
    let unsubscribeNotifications: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setEmployeeNotificationCount(0);
        setFounderName("Founder");
        setUsers([]);
        setLiveTasks([]);
        setTodayAttendance([]);
        setTodayApprovedLeaveIds([]);
        unsubscribeUsers?.();
        unsubscribeTasks?.();
        unsubscribeAttendance?.();
        unsubscribeNotifications?.();
        return;
      }

      setFounderName(
        user.displayName || user.email?.split("@")[0] || "Founder",
      );

      unsubscribeUsers?.();
      unsubscribeUsers = onSnapshot(
        collection(db, "users"),
        (snapshot) => {
          const members = snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }) as UserProfile)
            .filter(
              (item) =>
                item.active === true &&
                (item.role === "employee" || item.role === "intern"),
            )
            .sort((a, b) =>
              String(a.name || a.email || "").localeCompare(
                String(b.name || b.email || ""),
              ),
            );

          setUsers(members);
        },
        (error) => {
          console.error("Founder users listener error:", error);
          setUsers([]);
        },
      );

      unsubscribeTasks?.();
      unsubscribeTasks = onSnapshot(
        collection(db, "tasks"),
        (snapshot) => {
          const items = snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }) as Task)
            .sort(
              (a, b) =>
                getTimestampMillis(b.updatedAt || b.createdAt) -
                getTimestampMillis(a.updatedAt || a.createdAt),
            );

          setLiveTasks(items);
        },
        (error) => {
          console.error("Founder tasks listener error:", error);
          setLiveTasks([]);
        },
      );

      const todayKey = getTodayKey();
      unsubscribeAttendance?.();
      unsubscribeAttendance = onSnapshot(
        collection(db, "attendance"),
        (snapshot) => {
          const records = snapshot.docs
            .map(
              (item) => ({ id: item.id, ...item.data() }) as AttendanceRecord,
            )
            .filter(
              (record) =>
                record.date === todayKey || record.id.endsWith(`_${todayKey}`),
            );

          setTodayAttendance(records);
        },
        (error) => {
          console.error("Founder attendance listener error:", error);
          setTodayAttendance([]);
        },
      );

      unsubscribeLeaveRequests?.();
      unsubscribeLeaveRequests = onSnapshot(
        collection(db, "leaveRequests"),
        (snapshot) => {
          const leaveIds = snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }) as any)
            .filter((request) => {
              if (String(request.status || "").toUpperCase() !== "APPROVED")
                return false;
              if (!request.userId || !request.startDate || !request.endDate)
                return false;
              return (
                request.startDate <= todayKey && request.endDate >= todayKey
              );
            })
            .map((request) => String(request.userId));

          setTodayApprovedLeaveIds([...new Set(leaveIds)]);
        },
        (error) => {
          console.error("Founder leave listener error:", error);
          setTodayApprovedLeaveIds([]);
        },
      );

      unsubscribeNotifications?.();
      unsubscribeNotifications = onSnapshot(
        query(collection(db, "notifications"), where("userId", "==", user.uid)),
        (snapshot) => {
          const count = snapshot.docs.filter((item) => {
            const data = item.data() as any;
            return (
              data.read !== true &&
              (data.direction || "received") === "received" &&
              !!data.senderId &&
              data.senderId !== user.uid
            );
          }).length;
          setEmployeeNotificationCount(count);
        },
        (error) => {
          console.error("Founder notification badge error:", error);
          setEmployeeNotificationCount(0);
        },
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeUsers?.();
      unsubscribeTasks?.();
      unsubscribeAttendance?.();
      unsubscribeLeaveRequests?.();
      unsubscribeNotifications?.();
    };
  }, []);

  const memberStats = users.map((member) => {
    const memberTasks = liveTasks.filter((task) => {
      const teamIds = Array.isArray(task.teamMemberIds)
        ? task.teamMemberIds
        : [];
      const nestedTeam = Array.isArray(task.teamMembers)
        ? task.teamMembers.some((item) => item?.id === member.id)
        : false;

      return (
        task.assignedTo === member.id ||
        task.assignedToId === member.id ||
        task.assignedUserId === member.id ||
        teamIds.includes(member.id) ||
        nestedTeam
      );
    });

    const activeCount = memberTasks.filter(isActiveTask).length;
    const attendance = todayAttendance.find(
      (record) => record.userId === member.id,
    );
    const attendanceStatus = normalizeStatus(attendance?.status);
    const onLeave =
      attendanceStatus === "LEAVE" || todayApprovedLeaveIds.includes(member.id);
    const present =
      Boolean(attendance?.checkIn) && !onLeave && attendanceStatus !== "ABSENT";

    return {
      member,
      activeCount,
      present,
      onLeave,
    };
  });

  const totalActiveTasks = liveTasks.filter(isActiveTask).length;
  const overdueTaskCount = liveTasks.filter(isTaskOverdue).length;
  const todayTasks = liveTasks.filter(
    (task) => getTaskDateKey(task) === getTodayKey() && isActiveTask(task),
  );
  const presentCount = memberStats.filter((item) => item.present).length;
  const leaveCount = memberStats.filter((item) => item.onLeave).length;
  const absentCount = Math.max(0, users.length - presentCount - leaveCount);
  const attendanceRate = users.length
    ? Math.round((presentCount / users.length) * 100)
    : 0;
  const busiestMember = [...memberStats].sort(
    (a, b) => b.activeCount - a.activeCount,
  )[0];
  const busiestCount = busiestMember?.activeCount || 0;
  const maxActiveTasks = Math.max(
    1,
    ...memberStats.map((item) => item.activeCount),
  );
  const overallWorkloadShare = totalActiveTasks
    ? Math.round((busiestCount / maxActiveTasks) * 100)
    : 0;

  const recentActivities = liveTasks.slice(0, 4).map((task) => ({
    icon:
      normalizeStatus(task.status) === "COMPLETED" ? CheckCircle2 : FileText,
    title: `${task.title || "Untitled task"} — ${normalizeStatus(task.status).toLowerCase()}`,
    person: task.assignedToName || task.submittedByName || "Team task",
    time: getTimestampMillis(task.updatedAt || task.createdAt)
      ? new Date(
          getTimestampMillis(task.updatedAt || task.createdAt),
        ).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Recent",
  }));

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.href = "/";
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const navItems = [
    { label: "Overview", icon: LayoutDashboard, path: "/founder" },
    { label: "Tasks", icon: Target, path: "/founder/tasks" },
    { label: "Recycle Bin", icon: Trash2, path: "/founder/recycle-bin" },
    { label: "Reports", icon: TrendingUp, path: "/founder/reports" },
    { label: "Team", icon: Users, path: "/founder/team" },
    { label: "Attendance", icon: UserCheck, path: "/founder/attendance" },
    { label: "Clients", icon: ShieldCheck, path: "/founder/clients" },
    {
      label: "Content Calendar",
      icon: CalendarDays,
      path: "/founder/content-calendar",
    },
    { label: "Notifications", icon: Bell, path: "/founder/notifications" },
  ];

  return (
    <main className="min-h-screen bg-white text-[var(--brand-black)]">
      {/* =====================================================
          BACKGROUND
      ====================================================== */}

      <div className="pointer-events-none fixed inset-0 border-t-2 border-[var(--brand-red)] bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:40px_40px]" />

      {/* =====================================================
          MOBILE OVERLAY
      ====================================================== */}

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/60  lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* =====================================================
          SIDEBAR
      ====================================================== */}

      <motion.aside
        animate={{
          width: collapsed ? 82 : 260,
        }}
        transition={{ duration: 0.25 }}
        className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-[var(--brand-border)] bg-white  ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="flex h-[78px] items-center border-b border-[var(--brand-border)] px-5">
          <div className="flex min-w-0 items-center gap-3">
            {collapsed ? (
              <BrandLogo compact />
            ) : (
              <BrandLogo className="h-[68px] w-[160px]" priority />
            )}
          </div>

          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto rounded-lg p-2 text-[var(--brand-black)] hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)] lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Workspace */}
        {!collapsed && (
          <div className="px-4 pt-5">
            <div className="rounded-2xl border border-[var(--brand-red-secondary)]/10 bg-[var(--brand-red)]/10 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-red)]/15 text-sm font-bold text-[var(--brand-red)]">
                  A
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">
                    Founder Workspace
                  </p>

                  <p className="mt-0.5 truncate text-[10px] text-[var(--brand-medium-gray)]">
                    Full access
                  </p>
                </div>

                <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_2px_8px_rgba(0,0,0,0.04)]" />
              </div>
            </div>
          </div>
        )}

        <div className="px-3 pb-3">
          <button
            onClick={handleLogout}
            title={collapsed ? "Sign out" : undefined}
            className="flex w-full items-center gap-3 rounded-xl border border-red-500/10 bg-red-500/[0.04] px-3 py-3 text-sm font-medium text-red-700/80 transition hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-700"
          >
            <LogOut size={18} />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-6 flex-1 space-y-1 px-3">
          {!collapsed && (
            <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-dark-gray)]">
              Workspace
            </p>
          )}

          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.label;

            return (
              <button
                key={item.label}
                onClick={() => {
                  setActivePage(item.label);
                  setSidebarOpen(false);
                  window.location.href = item.path;
                }}
                title={collapsed ? item.label : undefined}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                  active
                    ? "border border-[var(--brand-red)]/35 bg-[var(--brand-red)]/15 text-[var(--brand-black)]"
                    : "text-[var(--brand-black)] hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
                }`}
              >
                <Icon
                  size={18}
                  className={`shrink-0 ${
                    active
                      ? "text-[var(--brand-red)]"
                      : "text-[var(--brand-black)] group-hover:text-[var(--brand-black)]"
                  }`}
                />

                {!collapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>

                    {item.label === "Notifications" &&
                      employeeNotificationCount > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500/15 px-1.5 text-[9px] font-bold text-red-700">
                          {employeeNotificationCount > 99
                            ? "99+"
                            : employeeNotificationCount}
                        </span>
                      )}
                  </>
                )}
              </button>
            );
          })}

          {!collapsed && (
            <p className="mb-3 mt-7 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-dark-gray)]">
              System
            </p>
          )}

          <Link
            href="/founder/settings"
            title={collapsed ? "Settings" : undefined}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
          >
            <Settings size={18} />
            {!collapsed && <span>Settings</span>}
          </Link>
        </nav>

        {/* Collapse */}
        <div className="border-t border-[var(--brand-border)] p-3">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden w-full items-center justify-center rounded-xl p-3 text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)] lg:flex"
          >
            <ChevronRight
              size={18}
              className={`transition-transform ${
                collapsed ? "" : "rotate-180"
              }`}
            />
          </button>
        </div>
      </motion.aside>

      {/* =====================================================
          MAIN CONTENT
      ====================================================== */}

      <div
        className={`relative min-h-screen transition-[margin] duration-300 ${
          collapsed ? "lg:ml-[82px]" : "lg:ml-[260px]"
        }`}
      >
        {/* ===================================================
            TOPBAR
        ==================================================== */}

        <header className="sticky top-0 z-30 flex h-[78px] items-center justify-between border-b border-[var(--brand-border)] bg-white px-4  sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl border border-[var(--brand-border)] bg-white p-2.5 text-[var(--brand-black)] lg:hidden"
            >
              <Menu size={19} />
            </button>

            <div>
              <p className="text-xs text-[var(--brand-medium-gray)]">
                Founder / Workspace
              </p>

              <h1 className="mt-0.5 text-lg font-bold">{activePage}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Search */}
            <button className="hidden items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-xs text-[var(--brand-black)] transition hover:border-[var(--brand-border)] hover:text-[var(--brand-black)] sm:flex">
              <Search size={15} />
              <span>Search</span>
              <span className="ml-3 rounded-md border border-[var(--brand-border)] px-1.5 py-0.5 text-[9px]">
                Ctrl K
              </span>
            </button>

            {/* Notifications */}
            <Link
              href="/founder/notifications"
              className="relative rounded-xl border border-[var(--brand-border)] bg-white p-2.5 text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
              aria-label="Notifications"
            >
              <Bell size={18} />

              {employeeNotificationCount > 0 && (
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-400" />
              )}
            </Link>

            {/* Profile */}
            <button className="flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white p-1.5 pr-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-red)] text-xs font-bold">
                A
              </div>

              <div className="hidden text-left sm:block">
                <p className="text-xs font-semibold">Akash</p>

                <p className="text-[9px] text-[var(--brand-medium-gray)]">
                  Founder
                </p>
              </div>

              <ChevronDown
                size={14}
                className="hidden text-[var(--brand-black)] sm:block"
              />
            </button>
          </div>
        </header>

        {/* ===================================================
            DASHBOARD
        ==================================================== */}

        <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
          {/* Greeting */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"
          >
            <div>
              <p className="mb-1 text-sm text-[var(--brand-medium-gray)]">
                {formatTodayLong()}
              </p>

              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Good morning,{" "}
                <span className="text-[var(--brand-red)]">{founderName}</span>.
              </h2>

              <p className="mt-1 text-sm text-[var(--brand-medium-gray)]">
                Here&apos;s what&apos;s happening across The Ant Media.
              </p>
            </div>

            <Link
              href="/founder/tasks?create=1"
              className="flex w-fit items-center gap-2 rounded-xl bg-[var(--brand-red)] px-4 py-2.5 text-sm font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/15 transition hover:scale-[1.02]"
            >
              <Plus size={17} />
              Create Task
            </Link>
          </motion.div>

          {/* =================================================
              STATS
          ================================================== */}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                label: "Team Members",
                value: String(users.length),
                detail: `${users.filter((u) => u.role === "employee").length} employees · ${users.filter((u) => u.role === "intern").length} interns`,
                icon: Users,
                trend: "Live from Firestore",
              },
              {
                label: "Active Tasks",
                value: String(totalActiveTasks),
                detail: `${todayTasks.length} due today`,
                icon: Target,
                trend: "Live task count",
              },
              {
                label: "Overdue",
                value: String(overdueTaskCount),
                detail: overdueTaskCount
                  ? "Needs attention"
                  : "Nothing overdue",
                icon: AlertCircle,
                trend: "Live deadline status",
              },
              {
                label: "Today Attendance",
                value: `${presentCount}/${users.length}`,
                detail: `${attendanceRate}% present · ${leaveCount} on leave · ${absentCount} absent`,
                icon: UserCheck,
                trend: "Live attendance records",
              },
            ].map((stat, index) => {
              const Icon = stat.icon;

              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.06 }}
                  className="group relative overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-white p-4 transition hover:border-[var(--brand-border)] sm:p-5"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-red)]/10 text-[var(--brand-red)]">
                      <Icon size={18} />
                    </div>
                    <ArrowUpRight
                      size={15}
                      className="text-[var(--brand-black)] transition group-hover:text-[var(--brand-black)]"
                    />
                  </div>
                  <p className="mt-4 text-xs text-[var(--brand-medium-gray)]">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--brand-medium-gray)]">
                    {stat.detail}
                  </p>
                  <div className="mt-3 flex items-center gap-1.5 text-[10px] text-emerald-700/70">
                    <TrendingUp size={12} />
                    {stat.trend}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* =================================================
              TEAM PULSE + WORKLOAD
          ================================================== */}

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
            {/* Team Pulse */}
            <section className="rounded-2xl border border-[var(--brand-border)] bg-white p-5 ">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Activity size={17} className="text-[var(--brand-red)]" />

                    <h3 className="font-semibold">Team Pulse</h3>
                  </div>

                  <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                    Live team workload overview
                  </p>
                </div>

                <button className="flex items-center gap-1 text-xs text-[var(--brand-red)] hover:text-[var(--brand-red)]">
                  View team
                  <ChevronRight size={14} />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {memberStats.map(
                  ({ member, activeCount, present, onLeave }, index) => (
                    <motion.div
                      key={member.name}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.04 }}
                      className="rounded-xl border border-[var(--brand-border)] bg-white p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-red)]/20 text-xs font-bold">
                            {String(member.name || member.email || "?")
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <span
                            className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--dark-elevated)] ${
                              present ? "bg-emerald-400" : "bg-amber-400"
                            }`}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold">
                            {member.name}
                          </p>

                          <p className="truncate text-[10px] text-[var(--brand-medium-gray)]">
                            {member.department || member.role || "Team member"}
                          </p>
                        </div>

                        <MoreHorizontal
                          size={15}
                          className="text-[var(--brand-black)]"
                        />
                      </div>

                      <div className="mt-4">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-[10px] text-[var(--brand-black)]">
                            Relative workload
                          </span>

                          <span className="text-[10px] font-medium text-[var(--brand-black)]">
                            {activeCount} active{" "}
                            {activeCount === 1 ? "task" : "tasks"}
                          </span>
                        </div>

                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--brand-border)]">
                          <div
                            className="h-full rounded-full bg-[var(--brand-red)]"
                            style={{
                              width: `${Math.round((activeCount / maxActiveTasks) * 100)}%`,
                            }}
                          />
                        </div>

                        <div className="mt-2 flex justify-between">
                          <span
                            className={`text-[9px] ${
                              present
                                ? "text-emerald-700/70"
                                : "text-amber-700/70"
                            }`}
                          >
                            {onLeave
                              ? "On leave"
                              : present
                                ? "Present"
                                : "Not checked in"}
                          </span>

                          <span className="text-[9px] text-[var(--brand-black)]">
                            {getWorkloadLabel(
                              Math.round((activeCount / maxActiveTasks) * 100),
                            )}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ),
                )}
              </div>
            </section>

            {/* Workload Insight */}
            <section className="relative overflow-hidden rounded-2xl border border-[var(--brand-red)]/25 bg-white p-5">
              <div className="relative">
                <div className="flex items-center gap-2">
                  <Zap size={17} className="text-[var(--brand-red)]" />

                  <h3 className="font-semibold">Smart Workload</h3>
                </div>

                <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                  Automatic workload analysis
                </p>

                <div className="mt-6">
                  <p className="text-4xl font-bold">{totalActiveTasks}</p>

                  <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                    Active tasks across the team
                  </p>
                </div>

                <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--brand-border)]">
                  <div
                    className="h-full rounded-full bg-[var(--brand-red)]"
                    style={{ width: `${overallWorkloadShare}%` }}
                  />
                </div>

                <p className="mt-2 text-[9px] text-[var(--brand-medium-gray)]">
                  {busiestMember
                    ? `${busiestMember.member.name || busiestMember.member.email || "Team member"} currently carries the highest relative workload with ${busiestCount} active ${busiestCount === 1 ? "task" : "tasks"}.`
                    : "No active task load is currently assigned."}
                </p>

                <div className="mt-5 rounded-xl border border-[var(--brand-red)]/25 bg-[var(--brand-red)]/10 p-3">
                  <p className="text-xs font-medium text-[var(--brand-red)]">
                    ⚡ Live workload insight
                  </p>

                  <p className="mt-1 text-[10px] leading-relaxed text-[var(--brand-medium-gray)]">
                    {busiestMember
                      ? `${busiestMember.member.name || busiestMember.member.email || "Team member"} currently has ${busiestCount} active ${busiestCount === 1 ? "task" : "tasks"}.`
                      : "No active team tasks are currently assigned."}
                  </p>
                </div>

                <button
                  onClick={() => (window.location.href = "/founder/team")}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white py-2.5 text-xs font-medium text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
                >
                  View live team workload
                  <ArrowUpRight size={14} />
                </button>
              </div>
            </section>
          </div>

          {/* =================================================
              TASKS + CONTENT
          ================================================== */}

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            {/* Tasks */}
            <section className="overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-white ">
              <div className="flex items-center justify-between border-b border-[var(--brand-border)] p-5">
                <div>
                  <h3 className="font-semibold">Today&apos;s Tasks</h3>

                  <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                    Tasks requiring attention
                  </p>
                </div>

                <button className="flex items-center gap-1 text-xs text-[var(--brand-red)] hover:text-[var(--brand-red)]">
                  View all
                  <ChevronRight size={14} />
                </button>
              </div>

              <div className="divide-y divide-[var(--brand-border)]">
                {todayTasks.slice(0, 4).map((task) => (
                  <div
                    key={task.id}
                    className="group flex items-center gap-3 p-4 transition hover:bg-[var(--brand-red-light)] sm:p-5"
                  >
                    <div className="hidden h-9 w-9 items-center justify-center rounded-xl bg-white text-[var(--brand-black)] sm:flex">
                      <Target size={16} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-xs font-semibold sm:text-sm">
                          {task.title}
                        </p>

                        <span
                          className={`rounded-md border px-1.5 py-0.5 text-[8px] font-medium ${getPriorityClass(
                            task.priority,
                          )}`}
                        >
                          {task.priority}
                        </span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--brand-black)]">
                        <span>{task.assignedToName || "Team task"}</span>
                        <span>•</span>
                        <span>{task.department || "—"}</span>
                        <span>•</span>
                        <span>{task.deadline}</span>
                      </div>
                    </div>

                    <span className="hidden rounded-lg bg-white px-2.5 py-1.5 text-[9px] text-[var(--brand-black)] sm:block">
                      {task.status}
                    </span>

                    <ChevronRight
                      size={15}
                      className="text-[var(--brand-black)] transition group-hover:text-[var(--brand-black)]"
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Content Calendar */}
            <section className="rounded-2xl border border-[var(--brand-border)] bg-white p-5 ">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CalendarDays
                      size={17}
                      className="text-[var(--brand-red)]"
                    />

                    <h3 className="font-semibold">Content Calendar</h3>
                  </div>

                  <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                    Upcoming content
                  </p>
                </div>

                <button className="rounded-lg p-1.5 text-[var(--brand-black)] hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]">
                  <MoreHorizontal size={17} />
                </button>
              </div>

              <div className="mt-5 rounded-xl border border-[var(--brand-border)] bg-white p-4">
                <p className="text-xs font-medium text-[var(--brand-dark-gray)]">
                  Content events are managed in the Content Calendar.
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-[var(--brand-medium-gray)]">
                  Open the calendar to view current scheduled content without
                  placeholder data on the overview.
                </p>
              </div>

              <button
                onClick={() =>
                  (window.location.href = "/founder/content-calendar")
                }
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-border)] py-2.5 text-xs text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
              >
                Open calendar
                <ArrowUpRight size={14} />
              </button>
            </section>
          </div>

          {/* =================================================
              ATTENDANCE + ACTIVITY
          ================================================== */}

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            {/* Attendance */}
            <section className="rounded-2xl border border-[var(--brand-border)] bg-white p-5 ">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Clock3 size={17} className="text-emerald-700" />

                    <h3 className="font-semibold">Today&apos;s Attendance</h3>
                  </div>

                  <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                    {formatTodayLong()}
                  </p>
                </div>

                <button className="text-xs text-[var(--brand-red)] hover:text-[var(--brand-red)]">
                  View report
                </button>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-[var(--brand-border)] bg-white p-3 text-center">
                  <p className="text-xl font-bold text-emerald-700">
                    {presentCount}
                  </p>
                  <p className="mt-1 text-[9px] text-[var(--brand-medium-gray)]">
                    Present
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--brand-border)] bg-white p-3 text-center">
                  <p className="text-xl font-bold text-amber-700">
                    {leaveCount}
                  </p>
                  <p className="mt-1 text-[9px] text-[var(--brand-medium-gray)]">
                    Leave
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--brand-border)] bg-white p-3 text-center">
                  <p className="text-xl font-bold text-red-700">
                    {absentCount}
                  </p>
                  <p className="mt-1 text-[9px] text-[var(--brand-medium-gray)]">
                    Absent
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex justify-between">
                  <span className="text-[10px] text-[var(--brand-black)]">
                    Attendance rate
                  </span>

                  <span className="text-[10px] text-emerald-700">
                    {attendanceRate}%
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-emerald-400"
                    style={{ width: `${attendanceRate}%` }}
                  />
                </div>
              </div>
            </section>

            {/* Activity */}
            <section className="rounded-2xl border border-[var(--brand-border)] bg-white p-5 ">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Recent Activity</h3>

                  <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                    Latest workspace events
                  </p>
                </div>

                <button className="text-xs text-[var(--brand-red)] hover:text-[var(--brand-red)]">
                  View history
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {recentActivities.map((activity, index) => {
                  const Icon = activity.icon;

                  return (
                    <div key={index} className="flex gap-3">
                      <div className="relative">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-red)]/10">
                          <Icon size={15} className="text-[var(--brand-red)]" />
                        </div>

                        {index !== recentActivities.length - 1 && (
                          <div className="absolute left-1/2 top-8 h-5 w-px -translate-x-1/2 bg-white" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[var(--brand-medium-gray)]">
                          {activity.title}
                        </p>

                        <div className="mt-1 flex gap-2 text-[9px] text-[var(--brand-black)]">
                          <span>{activity.person}</span>
                          <span>•</span>
                          <span>{activity.time}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* =================================================
              FOOTER
          ================================================== */}

          <footer className="mt-8 flex flex-col justify-between gap-3 border-t border-[var(--brand-border)] py-6 text-[10px] text-[var(--brand-black)] sm:flex-row">
            <p>© 2026 The Ant Media · Internal Management System</p>

            <div className="flex gap-4">
              <span>Secure workspace</span>
              <span>Firebase protected</span>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
