"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  createdAt?: unknown;
  updatedAt?: unknown;
  deleted?: boolean;
  isDeleted?: boolean;
  deletedAt?: unknown;
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
  checkIn?: unknown;
  checkOut?: unknown;
  status?: string;
  totalHours?: number;
  markedByName?: string;
  markedBy?: string;
  createdByName?: string;
};

type ClientRecord = {
  id: string;
  name?: string;
  company?: string;
  email?: string;
  deletedAt?: unknown;
};
type LeaveRequestRecord = {
  id: string;
  status?: unknown;
  userId?: unknown;
  startDate?: string;
  endDate?: string;
};
type NotificationRecord = {
  read?: boolean;
  direction?: string;
  senderId?: string;
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

function getTimestampMillis(value: unknown) {
  try {
    if (value instanceof Date) return value.getTime();
    if (
      typeof value === "object" &&
      value !== null &&
      "toMillis" in value &&
      typeof value.toMillis === "function"
    )
      return value.toMillis();
    if (
      typeof value === "object" &&
      value !== null &&
      "toDate" in value &&
      typeof value.toDate === "function"
    )
      return value.toDate().getTime();
    if (typeof value === "string" || typeof value === "number")
      return new Date(value).getTime();
  } catch {}
  return 0;
}

function normalizeStatus(status?: string) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[-_\s]+/g, "_");
}

function isCompleted(status?: string) {
  return normalizeStatus(status) === "completed";
}

function isActiveTask(task: Task) {
  return (
    task.deleted !== true &&
    task.isDeleted !== true &&
    !task.deletedAt &&
    [
      "todo",
      "in_progress",
      "submitted",
      "changes_requested",
      "approved",
    ].includes(normalizeStatus(task.status))
  );
}

function getTaskDateKey(task: Task) {
  const raw = task.deadlineDate || task.deadline || "";
  if (!raw) return "";
  return String(raw).slice(0, 10);
}

function isTaskOverdue(task: Task) {
  if (
    (!task.deadline && !task.deadlineDate) ||
    isCompleted(task.status) ||
    task.deleted === true ||
    task.isDeleted === true ||
    task.deletedAt
  )
    return false;

  const raw = task.deadline || task.deadlineDate || "";
  const value = String(raw).includes("T")
    ? String(raw)
    : task.deadlineTime
      ? `${raw}T${task.deadlineTime}`
      : `${raw}T23:59:59`;
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
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [activePage, setActivePage] = useState("Overview");
  const [employeeNotificationCount, setEmployeeNotificationCount] = useState(0);
  const [founderName, setFounderName] = useState("Founder");
  const [founderEmail, setFounderEmail] = useState("");
  const [founderRole, setFounderRole] = useState("Founder");
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [liveTasks, setLiveTasks] = useState<Task[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>(
    [],
  );
  const [todayApprovedLeaveIds, setTodayApprovedLeaveIds] = useState<string[]>(
    [],
  );
  const profileMenuRef = useRef<HTMLDivElement>(null);

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
    let unsubscribeClients: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setEmployeeNotificationCount(0);
        setFounderName("Founder");
        setFounderEmail("");
        setFounderRole("Founder");
        setUsers([]);
        setLiveTasks([]);
        setTodayAttendance([]);
        setTodayApprovedLeaveIds([]);
        setClients([]);
        unsubscribeUsers?.();
        unsubscribeTasks?.();
        unsubscribeAttendance?.();
        unsubscribeNotifications?.();
        unsubscribeClients?.();
        return;
      }

      setFounderName(
        user.displayName || user.email?.split("@")[0] || "Founder",
      );
      setFounderEmail(user.email || "");
      setFounderRole("Founder");

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
          const profile = snapshot.docs
            .find((item) => item.id === user.uid)
            ?.data();
          if (typeof profile?.name === "string" && profile.name.trim())
            setFounderName(profile.name.trim());
          else
            setFounderName(
              user.displayName || user.email?.split("@")[0] || "Founder",
            );
          setFounderEmail(String(profile?.email || user.email || ""));
          if (typeof profile?.role === "string") setFounderRole(profile.role);
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
            .map(
              (item) => ({ id: item.id, ...item.data() }) as LeaveRequestRecord,
            )
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
            const data = item.data() as NotificationRecord;
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

      unsubscribeClients?.();
      unsubscribeClients = onSnapshot(
        collection(db, "clients"),
        (snapshot) => {
          setClients(
            snapshot.docs
              .map((item) => ({ id: item.id, ...item.data() }) as ClientRecord)
              .filter((client) => !client.deletedAt),
          );
        },
        (error) => {
          console.error("Founder clients listener error:", error);
          setClients([]);
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
      unsubscribeClients?.();
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
      attendanceStatus === "leave" || todayApprovedLeaveIds.includes(member.id);
    const present =
      Boolean(attendance?.checkIn) && !onLeave && attendanceStatus !== "absent";

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
  const visibleTasks = liveTasks
    .filter((task) => {
      const needle = searchQuery.trim().toLowerCase();
      return (
        needle &&
        `${task.title || ""} ${task.assignedToName || ""}`
          .toLowerCase()
          .includes(needle)
      );
    })
    .slice(0, 8);
  const visibleUsers = users
    .filter((member) => {
      const needle = searchQuery.trim().toLowerCase();
      return (
        needle &&
        `${member.name || ""} ${member.email || ""}`
          .toLowerCase()
          .includes(needle)
      );
    })
    .slice(0, 8);
  const visibleClients = clients
    .filter((client) => {
      const needle = searchQuery.trim().toLowerCase();
      return (
        needle &&
        `${client.name || ""} ${client.company || ""} ${client.email || ""}`
          .toLowerCase()
          .includes(needle)
      );
    })
    .slice(0, 8);
  const todayAttendanceRows = todayAttendance.map((record) => ({
    record,
    member: users.find((item) => item.id === record.userId),
    status: record.status || (record.checkIn ? "Present" : "Recorded"),
  }));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setProfileOpen(false);
        setNotificationOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    const closeProfileMenu = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !profileMenuRef.current?.contains(event.target)
      ) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", closeProfileMenu);
    return () => document.removeEventListener("mousedown", closeProfileMenu);
  }, []);
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

  const recentActivities = liveTasks.slice(0, 4).map((task) => {
    const status = normalizeStatus(task.status);
    const action =
      status === "completed"
        ? "Task completed"
        : status === "submitted"
          ? "Task submitted"
          : status === "changes_requested"
            ? "Changes requested"
            : status === "in_progress"
              ? "Task started"
              : status === "approved"
                ? "Task approved"
                : "Task assigned";
    const assignee =
      task.assignedToName ||
      users.find(
        (member) =>
          member.id === task.assignedTo ||
          member.id === task.assignedToId ||
          (Array.isArray(task.teamMemberIds) &&
            task.teamMemberIds.includes(member.id)),
      )?.name;
    return {
      icon: status === "completed" ? CheckCircle2 : FileText,
      title: `${action}: ${task.title || "Untitled task"}`,
      person: assignee || task.submittedByName || "Team task",
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
    };
  });

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setProfileOpen(false);
      router.push("/");
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
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search workspace"
              className="flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white p-2.5 text-xs text-[var(--brand-black)] transition hover:border-[var(--brand-border)] hover:text-[var(--brand-black)] sm:px-3 sm:py-2"
            >
              <Search size={15} />
              <span className="hidden sm:inline">Search</span>
              <span className="ml-3 hidden rounded-md border border-[var(--brand-border)] px-1.5 py-0.5 text-[9px] sm:inline">
                Ctrl K
              </span>
            </button>

            {/* Notifications */}
            <button
              onClick={() => setNotificationOpen((open) => !open)}
              className="relative rounded-xl border border-[var(--brand-border)] bg-white p-2.5 text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
              aria-label="Notifications"
            >
              <Bell size={18} />

              {employeeNotificationCount > 0 && (
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-400" />
              )}
            </button>

            {/* Profile */}
            <div ref={profileMenuRef} className="relative">
              <button
                onClick={() => setProfileOpen((open) => !open)}
                aria-expanded={profileOpen}
                aria-label="Open founder profile menu"
                className="flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white p-1.5 pr-2.5"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-red)] text-xs font-bold">
                  {founderName.charAt(0).toUpperCase()}
                </div>
                <div className="hidden text-left sm:block">
                  <p className="text-xs font-semibold">{founderName}</p>
                  <p className="text-[9px] text-[var(--brand-medium-gray)]">
                    {founderRole}
                  </p>
                </div>
                <ChevronDown
                  size={14}
                  className="hidden text-[var(--brand-black)] sm:block"
                />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-[var(--brand-border)] bg-white p-3 shadow-lg">
                  <p className="truncate text-sm font-semibold">
                    {founderName}
                  </p>
                  <p className="mt-1 truncate text-xs text-[var(--brand-medium-gray)]">
                    {founderEmail || "Email unavailable"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                    {founderRole}
                  </p>
                  <div className="my-2 border-t border-[var(--brand-border)]" />
                  <Link
                    href="/founder/settings"
                    onClick={() => setProfileOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--brand-red-light)]"
                  >
                    Profile / Account
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
          {notificationOpen && (
            <div className="absolute right-20 top-[68px] z-50 w-72 rounded-xl border border-[var(--brand-border)] bg-white p-4 shadow-lg">
              <p className="font-semibold">Notifications</p>
              <p className="mt-2 text-sm text-[var(--brand-medium-gray)]">
                {employeeNotificationCount
                  ? `${employeeNotificationCount} unread notification${employeeNotificationCount === 1 ? "" : "s"}.`
                  : "No unread notifications."}
              </p>
              <Link
                href="/founder/notifications"
                onClick={() => setNotificationOpen(false)}
                className="mt-3 block text-sm text-[var(--brand-red)]"
              >
                View all
              </Link>
            </div>
          )}
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
                  onClick={() => {
                    const routes: Record<string, string> = {
                      "Team Members": "/founder/team",
                      "Active Tasks": "/founder/tasks?filter=active",
                      Overdue: "/founder/tasks?filter=overdue",
                      "Today Attendance": "/founder/attendance",
                    };
                    router.push(routes[stat.label]);
                  }}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      const routes: Record<string, string> = {
                        "Team Members": "/founder/team",
                        "Active Tasks": "/founder/tasks?filter=active",
                        Overdue: "/founder/tasks?filter=overdue",
                        "Today Attendance": "/founder/attendance",
                      };
                      router.push(routes[stat.label]);
                    }
                  }}
                  className="group relative cursor-pointer overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-white p-4 transition hover:border-[var(--brand-red)] sm:p-5"
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

                <Link
                  href="/founder/team"
                  className="flex items-center gap-1 text-xs text-[var(--brand-red)] hover:text-[var(--brand-red)]"
                >
                  View team
                  <ChevronRight size={14} />
                </Link>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {memberStats.map(
                  ({ member, activeCount, present, onLeave }, index) => (
                    <motion.div
                      key={member.id}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.04 }}
                      role="link"
                      tabIndex={0}
                      onClick={() =>
                        router.push(
                          `/founder/tasks?employee=${encodeURIComponent(member.id)}`,
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(
                            `/founder/tasks?employee=${encodeURIComponent(member.id)}`,
                          );
                        }
                      }}
                      className="cursor-pointer rounded-xl border border-[var(--brand-border)] bg-white p-3 transition hover:border-[var(--brand-red)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-red)]"
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

                <Link
                  href="/founder/tasks"
                  className="flex items-center gap-1 text-xs text-[var(--brand-red)] hover:text-[var(--brand-red)]"
                >
                  View all
                  <ChevronRight size={14} />
                </Link>
              </div>

              <div className="divide-y divide-[var(--brand-border)]">
                {(todayTasks.length
                  ? todayTasks
                  : liveTasks.filter(isActiveTask).slice(0, 4)
                )
                  .slice(0, 4)
                  .map((task) => (
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
                {!todayTasks.length && !liveTasks.some(isActiveTask) && (
                  <p className="p-5 text-sm text-[var(--brand-medium-gray)]">
                    No tasks requiring attention.
                  </p>
                )}
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

                <Link
                  href="/founder/attendance"
                  className="text-xs text-[var(--brand-red)] hover:text-[var(--brand-red)]"
                >
                  View report
                </Link>
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

              <div className="mt-4 divide-y divide-[var(--brand-border)]">
                {todayAttendanceRows.length ? (
                  todayAttendanceRows
                    .slice(0, 5)
                    .map(({ member, record, status }) => (
                      <div
                        key={record.id}
                        className="flex items-start justify-between gap-3 py-2 text-xs"
                      >
                        <span>
                          {record.userName ||
                            member?.name ||
                            member?.email ||
                            "Unknown employee"}
                          <span className="block text-[10px] text-[var(--brand-medium-gray)]">
                            {record.date || getTodayKey()}
                            {record.markedByName ||
                            record.createdByName ||
                            record.markedBy
                              ? ` · Recorded by ${record.markedByName || record.createdByName || record.markedBy}`
                              : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-[var(--brand-medium-gray)]">
                          {status}
                          {record.checkIn
                            ? ` · In ${new Date(getTimestampMillis(record.checkIn)).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                            : ""}
                          {record.checkOut
                            ? ` · Out ${new Date(getTimestampMillis(record.checkOut)).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                            : ""}
                        </span>
                      </div>
                    ))
                ) : (
                  <p className="py-2 text-xs text-[var(--brand-medium-gray)]">
                    No attendance records for today.
                  </p>
                )}
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
                {recentActivities.length ? (
                  recentActivities.map((activity, index) => {
                    const Icon = activity.icon;

                    return (
                      <div key={index} className="flex gap-3">
                        <div className="relative">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-red)]/10">
                            <Icon
                              size={15}
                              className="text-[var(--brand-red)]"
                            />
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
                  })
                ) : (
                  <p className="text-sm text-[var(--brand-medium-gray)]">
                    No recent activity.
                  </p>
                )}
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
      {searchOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/30 p-4 pt-[15vh]"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-[var(--brand-border)] bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <Search size={18} />
              <input
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search team members and tasks…"
                className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
              />
              <button
                onClick={() => setSearchOpen(false)}
                aria-label="Close search"
              >
                <X size={17} />
              </button>
            </div>
            <div className="mt-3 max-h-80 overflow-auto border-t border-[var(--brand-border)] pt-2">
              {searchQuery.trim() ? (
                <>
                  {visibleUsers.map((member) => (
                    <button
                      key={`user-${member.id}`}
                      onClick={() => {
                        setSearchOpen(false);
                        router.push("/founder/team");
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--brand-red-light)]"
                    >
                      {member.name || member.email}
                      <span className="ml-2 text-xs text-[var(--brand-medium-gray)]">
                        Team member
                      </span>
                    </button>
                  ))}
                  {visibleTasks.map((task) => (
                    <button
                      key={`task-${task.id}`}
                      onClick={() => {
                        setSearchOpen(false);
                        router.push(
                          `/founder/tasks?taskId=${encodeURIComponent(task.id)}`,
                        );
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--brand-red-light)]"
                    >
                      {task.title || "Untitled task"}
                      <span className="ml-2 text-xs text-[var(--brand-medium-gray)]">
                        Task · {task.assignedToName || "Unassigned"}
                      </span>
                    </button>
                  ))}
                  {visibleClients.map((client) => (
                    <button
                      key={`client-${client.id}`}
                      onClick={() => {
                        setSearchOpen(false);
                        router.push(
                          `/founder/clients?clientId=${encodeURIComponent(client.id)}`,
                        );
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--brand-red-light)]"
                    >
                      {client.name || client.company || "Unnamed client"}
                      <span className="ml-2 text-xs text-[var(--brand-medium-gray)]">
                        Client
                      </span>
                    </button>
                  ))}
                  {!visibleUsers.length &&
                    !visibleTasks.length &&
                    !visibleClients.length && (
                      <p className="px-3 py-4 text-sm text-[var(--brand-medium-gray)]">
                        No matching workspace records.
                      </p>
                    )}
                </>
              ) : (
                <p className="px-3 py-4 text-sm text-[var(--brand-medium-gray)]">
                  Search team members, tasks and clients.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
