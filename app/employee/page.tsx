"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  Plane,
  RefreshCw,
  Trash2,
  Target,
  UserCheck,
  X,
  XCircle,
} from "lucide-react";

import { onAuthStateChanged, signOut } from "firebase/auth";

import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

type Profile = {
  name?: string;
  email?: string;
  role?: string;
  department?: string;
  active?: boolean;
};

type Task = {
  id: string;
  title?: string;
  description?: string;
  client?: string;
  department?: string;
  taskType?: string;
  assignedTo?: string;
  assignedToName?: string;
  priority?: string;
  startDate?: string;
  deadline?: string;
  deadlineTime?: string;
  status?: string;
  createdAt?: any;
  updatedAt?: any;
};

type Attendance = {
  date?: string;
  checkIn?: any;
  checkOut?: any;
  status?: string;
  totalHours?: number;
};

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function getTodayKey() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatToday() {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(dateString?: string) {
  if (!dateString) return "No date";

  try {
    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return dateString;
    }

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return dateString;
  }
}

function getTimestampMillis(value: any) {
  try {
    if (typeof value?.toMillis === "function") {
      return value.toMillis();
    }

    if (typeof value?.toDate === "function") {
      return value.toDate().getTime();
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === "string" || typeof value === "number") {
      return new Date(value).getTime();
    }

    return 0;
  } catch {
    return 0;
  }
}

function getPriorityClass(priority?: string) {
  switch (priority?.toLowerCase()) {
    case "urgent":
      return "bg-red-500/10 text-red-300 border-red-500/20";

    case "important":
    case "high":
      return "bg-amber-500/10 text-amber-300 border-amber-500/20";

    case "medium":
      return "bg-blue-500/10 text-blue-300 border-blue-500/20";

    default:
      return "bg-white/[0.04] text-white/45 border-white/10";
  }
}

function getStatusClass(status?: string) {
  const normalized = status?.toUpperCase();

  switch (normalized) {
    case "APPROVED":
    case "COMPLETED":
      return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";

    case "SUBMITTED":
    case "REVIEW":
      return "bg-blue-500/10 text-blue-300 border-blue-500/20";

    case "CHANGES REQUESTED":
    case "CHANGES_REQUESTED":
      return "bg-amber-500/10 text-amber-300 border-amber-500/20";

    case "IN PROGRESS":
    case "IN_PROGRESS":
      return "bg-violet-500/10 text-violet-300 border-violet-500/20";

    default:
      return "bg-white/[0.04] text-white/40 border-white/10";
  }
}

function prettyStatus(status?: string) {
  if (!status) return "TO DO";

  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isCompletedStatus(status?: string) {
  const normalized = status?.toUpperCase();

  return (
    normalized === "COMPLETED" ||
    normalized === "APPROVED"
  );
}

function isReviewStatus(status?: string) {
  const normalized = status?.toUpperCase();

  return (
    normalized === "SUBMITTED" ||
    normalized === "REVIEW"
  );
}

function isActiveStatus(status?: string) {
  return !isCompletedStatus(status);
}

function isTaskOverdue(task: Task) {
  if (!task.deadline) return false;

  if (isCompletedStatus(task.status)) {
    return false;
  }

  try {
    let deadline = task.deadline;

    if (task.deadlineTime) {
      deadline = `${task.deadline}T${task.deadlineTime}`;
    }

    const deadlineDate = new Date(deadline);

    return (
      !Number.isNaN(deadlineDate.getTime()) &&
      deadlineDate.getTime() < Date.now()
    );
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* NAVIGATION                                                                  */
/* -------------------------------------------------------------------------- */

const navItems = [
  {
    label: "Overview",
    icon: LayoutDashboard,
    path: "/employee",
  },
  {
    label: "My Tasks",
    icon: Target,
    path: "/employee/tasks",
  },
  {
    label: "Attendance",
    icon: UserCheck,
    path: "/employee/attendance",
  },
  {
    label: "Calendar",
    icon: CalendarDays,
    path: "/employee/calendar",
  },
  {
    label: "Notifications",
    icon: Bell,
    path: "/employee/notifications",
  },
  {
    label: "Leave Requests",
    icon: Plane,
    path: "/employee/leave-requests",
  },
  {
    label: "Recycle Bin",
    icon: Trash2,
    path: "/employee/recycle-bin",
  },
];

/* -------------------------------------------------------------------------- */
/* PAGE                                                                        */
/* -------------------------------------------------------------------------- */

export default function EmployeePage() {
  const [profile, setProfile] = useState<Profile | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);

  const [todayAttendance, setTodayAttendance] =
    useState<Attendance | null>(null);

  const [unreadNotifications, setUnreadNotifications] =
    useState(0);

  const [loading, setLoading] = useState(true);

  const [authReady, setAuthReady] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [selectedTask, setSelectedTask] =
    useState<Task | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  /* ---------------------------------------------------------------------- */
  /* AUTH + FIRESTORE                                                        */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let unsubscribeTasks: (() => void) | null = null;
    let unsubscribeAttendance: (() => void) | null = null;
    let unsubscribeNotifications: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      (user) => {
        if (!user) {
          setAuthReady(true);
          setLoading(false);

          window.location.href = "/";

          return;
        }

        setAuthReady(true);

        /* ---------------------------------------------------------------- */
        /* PROFILE                                                            */
        /* ---------------------------------------------------------------- */

        const profileRef = doc(
          db,
          "users",
          user.uid
        );

        const unsubscribeProfile = onSnapshot(
          profileRef,
          (snapshot) => {
            if (!snapshot.exists()) {
              setProfile({
                name:
                  user.displayName ||
                  user.email?.split("@")[0] ||
                  "Employee",
                email: user.email || "",
                role: "employee",
              });

              setLoading(false);
              return;
            }

            const profileData =
              snapshot.data() as Profile;

            if (
              profileData.role !== "employee" &&
              profileData.role !== "intern"
            ) {
              setLoading(false);

              return;
            }

            setProfile(profileData);
            setLoading(false);
          },
          (error) => {
            console.error(
              "Profile listener error:",
              error
            );

            setProfile({
              name:
                user.displayName ||
                user.email?.split("@")[0] ||
                "Employee",
              email: user.email || "",
              role: "employee",
            });

            setLoading(false);
          }
        );

        /* ---------------------------------------------------------------- */
        /* TASKS                                                              */
        /* ---------------------------------------------------------------- */

        const tasksQuery = query(
          collection(db, "tasks"),
          where(
            "assignedTo",
            "==",
            user.uid
          )
        );

        unsubscribeTasks = onSnapshot(
          tasksQuery,
          (snapshot) => {
            const items: Task[] =
              snapshot.docs.map(
                (item) =>
                  ({
                    id: item.id,
                    ...item.data(),
                  }) as Task
              );

            items.sort(
              (a, b) =>
                getTimestampMillis(b.createdAt) -
                getTimestampMillis(a.createdAt)
            );

            setTasks(items);
          },
          (error) => {
            console.error(
              "Tasks listener error:",
              error
            );

            setTasks([]);
          }
        );

        /* ---------------------------------------------------------------- */
        /* ATTENDANCE                                                        */
        /* ---------------------------------------------------------------- */

        const todayKey = getTodayKey();

        const attendanceRef = doc(
          db,
          "attendance",
          `${user.uid}_${todayKey}`
        );

        unsubscribeAttendance = onSnapshot(
          attendanceRef,
          (snapshot) => {
            if (!snapshot.exists()) {
              setTodayAttendance(null);
              return;
            }

            setTodayAttendance(
              snapshot.data() as Attendance
            );
          },
          (error) => {
            console.error(
              "Attendance listener error:",
              error
            );

            setTodayAttendance(null);
          }
        );

        /* ---------------------------------------------------------------- */
        /* NOTIFICATIONS                                                     */
        /* ---------------------------------------------------------------- */

        const notificationsQuery = query(
          collection(db, "notifications"),
          where(
            "userId",
            "==",
            user.uid
          )
        );

        unsubscribeNotifications =
          onSnapshot(
            notificationsQuery,
            (snapshot) => {
              const count =
                snapshot.docs.filter(
                  (item) =>
                    item.data().read !== true &&
                    (item.data().direction ||
                      "received") ===
                      "received"
                ).length;

              setUnreadNotifications(count);
            },
            (error) => {
              console.error(
                "Notification listener error:",
                error
              );

              setUnreadNotifications(0);
            }
          );

        return () => {
          unsubscribeProfile();
        };
      }
    );

    return () => {
      unsubscribeAuth();

      if (unsubscribeTasks) {
        unsubscribeTasks();
      }

      if (unsubscribeAttendance) {
        unsubscribeAttendance();
      }

      if (unsubscribeNotifications) {
        unsubscribeNotifications();
      }
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* DERIVED DATA                                                            */
  /* ---------------------------------------------------------------------- */

  const activeTasks = useMemo(
    () =>
      tasks.filter((task) =>
        isActiveStatus(task.status)
      ),
    [tasks]
  );

  const reviewTasks = useMemo(
    () =>
      tasks.filter((task) =>
        isReviewStatus(task.status)
      ),
    [tasks]
  );

  const completedTasks = useMemo(
    () =>
      tasks.filter((task) =>
        isCompletedStatus(task.status)
      ),
    [tasks]
  );

  const overdueTasks = useMemo(
    () =>
      tasks.filter((task) =>
        isTaskOverdue(task)
      ),
    [tasks]
  );

  const dueTodayTasks = useMemo(() => {
    const today = getTodayKey();

    return tasks.filter((task) => {
      if (!task.deadline) return false;

      return task.deadline.startsWith(today);
    });
  }, [tasks]);

  const workloadPercentage = useMemo(() => {
    if (activeTasks.length === 0) {
      return 0;
    }

    return Math.min(
      activeTasks.length * 20,
      100
    );
  }, [activeTasks.length]);

  const workloadLabel = useMemo(() => {
    if (workloadPercentage >= 80) {
      return "High workload";
    }

    if (workloadPercentage >= 50) {
      return "Balanced workload";
    }

    return "Light workload";
  }, [workloadPercentage]);

  const displayName =
    profile?.name ||
    auth.currentUser?.displayName ||
    auth.currentUser?.email?.split("@")[0] ||
    "Employee";

  const firstName =
    displayName.split(" ")[0] || displayName;

  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((name) =>
      name.charAt(0).toUpperCase()
    )
    .join("");

  /* ---------------------------------------------------------------------- */
  /* NAVIGATION                                                              */
  /* ---------------------------------------------------------------------- */

  function navigate(path: string) {
    setSidebarOpen(false);
    window.location.href = path;
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      window.location.href = "/";
    } catch (error) {
      console.error(
        "Logout error:",
        error
      );
    }
  }

  function refreshDashboard() {
    setRefreshing(true);

    window.setTimeout(() => {
      window.location.reload();
    }, 400);
  }

  async function handleStartTask() {
    if (!selectedTask) return;

    try {
      await updateDoc(
        doc(db, "tasks", selectedTask.id),
        {
          status: "IN PROGRESS",
          updatedAt: serverTimestamp(),
        }
      );

      setSelectedTask({
        ...selectedTask,
        status: "IN PROGRESS",
      });
    } catch (error) {
      console.error(
        "Failed to start task:",
        error
      );

      alert(
        "Unable to start the task. Please try again."
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* LOADING                                                                  */
  /* ---------------------------------------------------------------------- */

  if (!authReady || loading) {
    return (
      <main className="min-h-screen bg-[#050507] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-2xl shadow-violet-900/30">
            <Target size={25} />
          </div>

          <div className="flex items-center gap-2 text-white/45 text-sm">
            <Loader2
              size={16}
              className="animate-spin"
            />

            Loading your workspace...
          </div>
        </div>
      </main>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* UI                                                                       */
  /* ---------------------------------------------------------------------- */

  return (
    <main className="min-h-screen bg-[#050507] text-white overflow-x-hidden">

      {/* BACKGROUND */}

      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-52 -left-52 w-[650px] h-[650px] rounded-full bg-violet-700/[0.09] blur-[150px]" />

        <div className="absolute top-[35%] -right-52 w-[650px] h-[650px] rounded-full bg-blue-700/[0.08] blur-[160px]" />

        <div className="absolute bottom-[-250px] left-[35%] w-[550px] h-[550px] rounded-full bg-indigo-700/[0.06] blur-[160px]" />
      </div>

      {/* MOBILE OVERLAY */}

      {sidebarOpen && (
        <button
          aria-label="Close menu"
          onClick={() =>
            setSidebarOpen(false)
          }
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* SIDEBAR */}

      <aside
        className={`fixed left-0 top-0 bottom-0 z-50 w-[270px] border-r border-white/[0.07] bg-[#08080c]/95 backdrop-blur-2xl transition-transform duration-300 ${
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="h-full flex flex-col">

          {/* BRAND */}

          <div className="px-6 py-6 border-b border-white/[0.07]">

            <div className="flex items-center gap-3">

              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-900/20">
                <span className="text-lg font-black">
                  A
                </span>
              </div>

              <div>
                <p className="text-sm font-bold tracking-wide">
                  THE ANT MEDIA
                </p>

                <p className="text-[10px] uppercase tracking-[0.18em] text-white/30 mt-1">
                  Team Workspace
                </p>
              </div>

            </div>

          </div>

          {/* USER */}

          <div className="px-4 pt-5">

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">

              <div className="flex items-center gap-3">

                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center font-bold text-sm">
                  {initials || "E"}
                </div>

                <div className="min-w-0">

                  <p className="text-sm font-semibold truncate">
                    {displayName}
                  </p>

                  <p className="text-[11px] text-white/35 capitalize mt-0.5">
                    {profile?.role ||
                      "employee"}
                  </p>

                </div>

              </div>

              {profile?.department && (
                <div className="mt-3 text-[10px] uppercase tracking-[0.16em] text-violet-300/60">
                  {profile.department}
                </div>
              )}

            </div>

          </div>

          {/* NAVIGATION */}

          <nav className="flex-1 px-3 py-5 overflow-y-auto">

            <p className="px-3 mb-3 text-[10px] uppercase tracking-[0.18em] text-white/20 font-semibold">
              Workspace
            </p>

            <div className="space-y-1">

              {navItems.map((item) => {
                const Icon = item.icon;

                const active =
                  item.path ===
                  "/employee";

                return (
                  <button
                    key={item.path}
                    onClick={() =>
                      navigate(
                        item.path
                      )
                    }
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm transition-all ${
                      active
                        ? "bg-violet-500/10 text-violet-200 border border-violet-500/15"
                        : "text-white/45 hover:text-white hover:bg-white/[0.04] border border-transparent"
                    }`}
                  >

                    <Icon
                      size={18}
                    />

                    <span className="flex-1 text-left">
                      {item.label}
                    </span>

                    {item.label ===
                      "Notifications" &&
                      unreadNotifications >
                        0 && (
                        <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
                          {unreadNotifications >
                          99
                            ? "99+"
                            : unreadNotifications}
                        </span>
                      )}

                    {active && (
                      <ChevronRight
                        size={15}
                        className="text-violet-300/60"
                      />
                    )}

                  </button>
                );
              })}

            </div>

          </nav>

          {/* SIDEBAR FOOTER */}

          <div className="p-4 border-t border-white/[0.07]">

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm text-white/40 hover:text-red-300 hover:bg-red-500/[0.06] transition"
            >
              <LogOut size={18} />

              Sign out
            </button>

            <p className="text-[10px] text-white/15 text-center mt-4">
              Small Team. Big Impact.
            </p>

          </div>

        </div>
      </aside>

      {/* MAIN */}

      <div className="lg:pl-[270px] relative z-10">

        {/* TOP BAR */}

        <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#050507]/80 backdrop-blur-2xl">

          <div className="px-5 md:px-8 py-4">

            <div className="flex items-center justify-between gap-4">

              <div className="flex items-center gap-3">

                <button
                  onClick={() =>
                    setSidebarOpen(
                      true
                    )
                  }
                  className="lg:hidden w-10 h-10 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-center"
                >
                  <Menu size={19} />
                </button>

                <div>

                  <p className="text-[10px] md:text-[11px] uppercase tracking-[0.2em] text-violet-300/70 font-semibold">
                    Employee Workspace
                  </p>

                  <h1 className="text-lg md:text-xl font-bold mt-1">
                    Overview
                  </h1>

                </div>

              </div>

              <div className="flex items-center gap-2">

                <button
                  onClick={refreshDashboard}
                  disabled={refreshing}
                  className="w-10 h-10 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] flex items-center justify-center transition"
                  title="Refresh dashboard"
                >
                  <RefreshCw
                    size={17}
                    className={
                      refreshing
                        ? "animate-spin"
                        : ""
                    }
                  />
                </button>

                <button
                  onClick={() =>
                    navigate(
                      "/employee/notifications"
                    )
                  }
                  className="relative w-10 h-10 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] flex items-center justify-center transition"
                  title="Notifications"
                >
                  <Bell size={18} />

                  {unreadNotifications >
                    0 && (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-[9px] font-bold flex items-center justify-center border-2 border-[#050507]">
                      {unreadNotifications >
                      99
                        ? "99+"
                        : unreadNotifications}
                    </span>
                  )}
                </button>

                <div className="hidden sm:flex w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 items-center justify-center font-bold text-sm">
                  {initials || "E"}
                </div>

              </div>

            </div>

          </div>
        </header>

        {/* CONTENT */}

        <div className="px-5 md:px-8 py-7 md:py-9 max-w-[1500px]">

          {/* WELCOME */}

          <section className="mb-7">

            <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">

              <div>

                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/[0.04] text-emerald-300/80 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Workspace active
                </div>

                <h2 className="text-3xl md:text-5xl font-bold tracking-tight mt-4">
                  Good day,{" "}
                  <span className="bg-gradient-to-r from-violet-300 via-blue-300 to-violet-300 bg-clip-text text-transparent">
                    {firstName}
                  </span>
                  .
                </h2>

                <p className="text-white/35 mt-3 text-sm md:text-base">
                  {formatToday()}
                </p>

              </div>

              <div className="flex items-center gap-2 text-xs text-white/30">
                <Clock3 size={15} />
                Your workspace updates in real time
              </div>

            </div>

          </section>

          {/* STATS */}

          <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-6">

            <DashboardStat
              icon={
                <Target size={19} />
              }
              label="Active Tasks"
              value={
                activeTasks.length
              }
              description="Currently assigned"
              accent="violet"
            />

            <DashboardStat
              icon={
                <Clock3 size={19} />
              }
              label="Due Today"
              value={
                dueTodayTasks.length
              }
              description="Needs attention today"
              accent="blue"
            />

            <DashboardStat
              icon={
                <MessageSquare
                  size={19}
                />
              }
              label="In Review"
              value={
                reviewTasks.length
              }
              description="Waiting for review"
              accent="amber"
            />

            <DashboardStat
              icon={
                <CheckCircle2
                  size={19}
                />
              }
              label="Completed"
              value={
                completedTasks.length
              }
              description="Finished work"
              accent="emerald"
            />

          </section>

          {/* MAIN GRID */}

          <section className="grid grid-cols-1 xl:grid-cols-[1.5fr_0.8fr] gap-5 mb-5">

            {/* TASKS */}

            <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-xl overflow-hidden">

              <div className="px-5 md:px-6 py-5 border-b border-white/[0.07] flex items-center justify-between gap-4">

                <div>

                  <div className="flex items-center gap-2">

                    <Target
                      size={18}
                      className="text-violet-300"
                    />

                    <h3 className="font-semibold">
                      My Work
                    </h3>

                  </div>

                  <p className="text-xs text-white/30 mt-1">
                    Your latest assigned tasks
                  </p>

                </div>

                <button
                  onClick={() =>
                    navigate(
                      "/employee/tasks"
                    )
                  }
                  className="flex items-center gap-1.5 text-xs text-violet-300 hover:text-violet-200"
                >
                  View all
                  <ArrowRight size={14} />
                </button>

              </div>

              {tasks.length === 0 ? (
                <div className="py-16 px-6 text-center">

                  <div className="w-14 h-14 mx-auto rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-white/20">
                    <Target size={23} />
                  </div>

                  <p className="font-medium mt-4">
                    No tasks assigned yet
                  </p>

                  <p className="text-xs text-white/25 mt-2">
                    New work assigned by the Founder will appear here.
                  </p>

                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">

                  {tasks
                    .slice(0, 5)
                    .map((task) => (
                      <button
                        key={task.id}
                        onClick={() =>
                          setSelectedTask(
                            task
                          )
                        }
                        className="w-full text-left p-5 md:px-6 hover:bg-white/[0.025] transition"
                      >

                        <div className="flex items-start gap-4">

                          <div className="w-10 h-10 shrink-0 rounded-xl bg-violet-500/10 text-violet-300 border border-violet-500/10 flex items-center justify-center">
                            <FileCheck2
                              size={18}
                            />
                          </div>

                          <div className="flex-1 min-w-0">

                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">

                              <div className="min-w-0">

                                <p className="font-medium text-sm truncate">
                                  {task.title ||
                                    "Untitled task"}
                                </p>

                                <p className="text-xs text-white/30 mt-1">
                                  {task.client ||
                                    task.department ||
                                    "Workspace task"}
                                </p>

                              </div>

                              <span
                                className={`w-fit px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-wide ${getStatusClass(
                                  task.status
                                )}`}
                              >
                                {prettyStatus(
                                  task.status
                                )}
                              </span>

                            </div>

                            <div className="flex flex-wrap items-center gap-2 mt-3">

                              {task.priority && (
                                <span
                                  className={`px-2 py-1 rounded-full border text-[10px] uppercase tracking-wide ${getPriorityClass(
                                    task.priority
                                  )}`}
                                >
                                  {task.priority}
                                </span>
                              )}

                              {task.deadline && (
                                <span
                                  className={`flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] ${
                                    isTaskOverdue(
                                      task
                                    )
                                      ? "border-red-500/20 bg-red-500/10 text-red-300"
                                      : "border-white/[0.07] bg-white/[0.025] text-white/30"
                                  }`}
                                >
                                  <CalendarDays
                                    size={11}
                                  />
                                  {formatShortDate(
                                    task.deadline
                                  )}

                                  {isTaskOverdue(
                                    task
                                  ) &&
                                    " • Overdue"}
                                </span>
                              )}

                            </div>

                          </div>

                          <ChevronRight
                            size={17}
                            className="text-white/20 mt-2"
                          />

                        </div>

                      </button>
                    ))}

                </div>
              )}

            </div>

            {/* RIGHT COLUMN */}

            <div className="space-y-5">

              {/* ATTENDANCE */}

              <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-xl p-5 md:p-6">

                <div className="flex items-start justify-between gap-3">

                  <div>

                    <div className="flex items-center gap-2">

                      <UserCheck
                        size={18}
                        className="text-emerald-300"
                      />

                      <h3 className="font-semibold">
                        Today's Attendance
                      </h3>

                    </div>

                    <p className="text-xs text-white/30 mt-1">
                      {formatToday()}
                    </p>

                  </div>

                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      todayAttendance?.checkIn
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-amber-500/10 text-amber-300"
                    }`}
                  >
                    {todayAttendance?.checkIn ? (
                      <CheckCircle2
                        size={18}
                      />
                    ) : (
                      <Clock3
                        size={18}
                      />
                    )}
                  </div>

                </div>

                <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/15 p-4">

                  <div className="flex items-center justify-between">

                    <div>

                      <p className="text-[10px] uppercase tracking-[0.15em] text-white/25">
                        Status
                      </p>

                      <p className="text-sm font-semibold mt-1">
                        {todayAttendance?.checkOut
                          ? "Workday completed"
                          : todayAttendance?.checkIn
                          ? "Checked in"
                          : "Not checked in"}
                      </p>

                    </div>

                    {todayAttendance?.status && (
                      <span className="px-2.5 py-1 rounded-full border border-white/[0.07] bg-white/[0.03] text-[10px] uppercase tracking-wide text-white/45">
                        {todayAttendance.status}
                      </span>
                    )}

                  </div>

                  {todayAttendance?.checkIn && (
                    <div className="grid grid-cols-2 gap-3 mt-4">

                      <TimeBox
                        label="Check in"
                        value={formatTimeValue(
                          todayAttendance.checkIn
                        )}
                      />

                      <TimeBox
                        label="Check out"
                        value={
                          todayAttendance.checkOut
                            ? formatTimeValue(
                                todayAttendance.checkOut
                              )
                            : "—"
                        }
                      />

                    </div>
                  )}

                </div>

                <button
                  onClick={() =>
                    navigate(
                      "/employee/attendance"
                    )
                  }
                  className="w-full mt-4 h-11 rounded-xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] text-sm font-medium flex items-center justify-center gap-2 transition"
                >
                  Open Attendance
                  <ArrowRight size={15} />
                </button>

              </div>

              {/* WORKLOAD */}

              <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-xl p-5 md:p-6">

                <div className="flex items-start justify-between">

                  <div>

                    <div className="flex items-center gap-2">

                      <Target
                        size={18}
                        className="text-blue-300"
                      />

                      <h3 className="font-semibold">
                        Workload
                      </h3>

                    </div>

                    <p className="text-xs text-white/30 mt-1">
                      Based on active tasks
                    </p>

                  </div>

                  <span className="text-lg font-bold">
                    {workloadPercentage}%
                  </span>

                </div>

                <div className="mt-5 h-2 rounded-full bg-white/[0.06] overflow-hidden">

                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-500"
                    style={{
                      width: `${workloadPercentage}%`,
                    }}
                  />

                </div>

                <div className="flex items-center justify-between mt-3">

                  <span className="text-[11px] text-white/30">
                    {activeTasks.length} active task
                    {activeTasks.length ===
                    1
                      ? ""
                      : "s"}
                  </span>

                  <span
                    className={`text-[11px] ${
                      workloadPercentage >=
                      80
                        ? "text-amber-300"
                        : "text-emerald-300"
                    }`}
                  >
                    {workloadLabel}
                  </span>

                </div>

              </div>

            </div>

          </section>

          {/* ALERTS / QUICK ACTIONS */}

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* OVERDUE */}

            <div
              className={`rounded-3xl border p-5 ${
                overdueTasks.length >
                0
                  ? "border-red-500/15 bg-red-500/[0.035]"
                  : "border-white/[0.08] bg-white/[0.025]"
              }`}
            >

              <div className="flex items-start gap-3">

                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    overdueTasks.length >
                    0
                      ? "bg-red-500/10 text-red-300"
                      : "bg-emerald-500/10 text-emerald-300"
                  }`}
                >
                  {overdueTasks.length >
                  0 ? (
                    <AlertCircle
                      size={19}
                    />
                  ) : (
                    <CheckCircle2
                      size={19}
                    />
                  )}
                </div>

                <div>

                  <p className="font-semibold text-sm">
                    {overdueTasks.length >
                    0
                      ? "Attention required"
                      : "You're on track"}
                  </p>

                  <p className="text-xs text-white/30 mt-1 leading-relaxed">
                    {overdueTasks.length >
                    0
                      ? `${overdueTasks.length} task${
                          overdueTasks.length ===
                          1
                            ? ""
                            : "s"
                        } ${
                          overdueTasks.length ===
                          1
                            ? "is"
                            : "are"
                        } overdue.`
                      : "No overdue tasks right now."}
                  </p>

                </div>

              </div>

              {overdueTasks.length >
                0 && (
                <button
                  onClick={() =>
                    navigate(
                      "/employee/tasks"
                    )
                  }
                  className="mt-4 text-xs text-red-300 hover:text-red-200 flex items-center gap-1"
                >
                  Review overdue tasks
                  <ArrowRight size={13} />
                </button>
              )}

            </div>

            {/* REVIEW */}

            <div className="rounded-3xl border border-blue-500/10 bg-blue-500/[0.025] p-5">

              <div className="flex items-start gap-3">

                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-300 flex items-center justify-center">
                  <MessageSquare
                    size={19}
                  />
                </div>

                <div>

                  <p className="font-semibold text-sm">
                    Review queue
                  </p>

                  <p className="text-xs text-white/30 mt-1 leading-relaxed">
                    {reviewTasks.length >
                    0
                      ? `${reviewTasks.length} submitted task${
                          reviewTasks.length ===
                          1
                            ? ""
                            : "s"
                        } waiting for Founder review.`
                      : "No submitted work waiting for review."}
                  </p>

                </div>

              </div>

              <button
                onClick={() =>
                  navigate(
                    "/employee/tasks"
                  )
                }
                className="mt-4 text-xs text-blue-300 hover:text-blue-200 flex items-center gap-1"
              >
                Open My Tasks
                <ArrowRight size={13} />
              </button>

            </div>

            {/* NOTIFICATIONS */}

            <div className="rounded-3xl border border-violet-500/10 bg-violet-500/[0.025] p-5">

              <div className="flex items-start gap-3">

                <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-300 flex items-center justify-center">
                  <Bell size={19} />
                </div>

                <div>

                  <p className="font-semibold text-sm">
                    Notifications
                  </p>

                  <p className="text-xs text-white/30 mt-1 leading-relaxed">
                    {unreadNotifications >
                    0
                      ? `${unreadNotifications} unread notification${
                          unreadNotifications ===
                          1
                            ? ""
                            : "s"
                        } waiting for you.`
                      : "You're all caught up."}
                  </p>

                </div>

              </div>

              <button
                onClick={() =>
                  navigate(
                    "/employee/notifications"
                  )
                }
                className="mt-4 text-xs text-violet-300 hover:text-violet-200 flex items-center gap-1"
              >
                Open Notifications
                <ArrowRight size={13} />
              </button>

            </div>

          </section>

          {/* FOOTER NOTE */}

          <div className="mt-7 flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-1">

            <p className="text-[11px] text-white/20">
              THE ANT MEDIA • Internal Management System
            </p>

            <p className="text-[11px] text-white/20">
              Small Team. Big Impact.
            </p>

          </div>

        </div>

      </div>

      {/* TASK DETAIL MODAL */}

      {selectedTask && (
        <div
          className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() =>
            setSelectedTask(null)
          }
        >

          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/[0.1] bg-[#0b0b0f] shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <div className="p-6 border-b border-white/[0.07] flex items-start justify-between gap-4">

              <div>

                <p className="text-[10px] uppercase tracking-[0.2em] text-violet-300/70">
                  Task details
                </p>

                <h3 className="text-xl md:text-2xl font-bold mt-2">
                  {selectedTask.title ||
                    "Untitled task"}
                </h3>

              </div>

              <button
                onClick={() =>
                  setSelectedTask(null)
                }
                className="w-9 h-9 shrink-0 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center"
              >
                <X size={18} />
              </button>

            </div>

            <div className="p-6 space-y-5">

              <div className="flex flex-wrap gap-2">

                <span
                  className={`px-3 py-1.5 rounded-full border text-[10px] uppercase tracking-wide ${getStatusClass(
                    selectedTask.status
                  )}`}
                >
                  {prettyStatus(
                    selectedTask.status
                  )}
                </span>

                {selectedTask.priority && (
                  <span
                    className={`px-3 py-1.5 rounded-full border text-[10px] uppercase tracking-wide ${getPriorityClass(
                      selectedTask.priority
                    )}`}
                  >
                    {selectedTask.priority}
                  </span>
                )}

              </div>

              {selectedTask.description && (
                <div>

                  <p className="text-[10px] uppercase tracking-[0.15em] text-white/25">
                    Description
                  </p>

                  <p className="text-sm text-white/60 leading-7 mt-2 whitespace-pre-wrap">
                    {selectedTask.description}
                  </p>

                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                <InfoBox
                  label="Client"
                  value={
                    selectedTask.client ||
                    "Internal"
                  }
                />

                <InfoBox
                  label="Department"
                  value={
                    selectedTask.department ||
                    "—"
                  }
                />

                <InfoBox
                  label="Task Type"
                  value={
                    selectedTask.taskType ||
                    "—"
                  }
                />

                <InfoBox
                  label="Start Date"
                  value={
                    formatShortDate(
                      selectedTask.startDate
                    )
                  }
                />

                <InfoBox
                  label="Deadline"
                  value={
                    selectedTask.deadline
                      ? `${formatShortDate(
                          selectedTask.deadline
                        )}${
                          selectedTask.deadlineTime
                            ? ` • ${selectedTask.deadlineTime}`
                            : ""
                        }`
                      : "No deadline"
                  }
                />

                <InfoBox
                  label="Status"
                  value={
                    prettyStatus(
                      selectedTask.status
                    )
                  }
                />

              </div>

              {(!selectedTask.status ||
                selectedTask.status.toUpperCase() === "TO DO" ||
                selectedTask.status.toUpperCase() === "TODO") && (
                <button
                  onClick={handleStartTask}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:brightness-110 transition-all font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-violet-900/20"
                >
                  <Target size={17} />
                  Start Task
                </button>
              )}

              {selectedTask.status?.toUpperCase() === "IN PROGRESS" && (
                <div className="w-full h-12 rounded-xl border border-violet-500/20 bg-violet-500/10 text-violet-300 font-semibold text-sm flex items-center justify-center gap-2">
                  <Clock3 size={17} />
                  Task In Progress
                </div>
              )}

              {(
                selectedTask.status?.toUpperCase() === "SUBMITTED" ||
                selectedTask.status?.toUpperCase() === "REVIEW"
              ) && (
                <div className="w-full h-12 rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-300 font-semibold text-sm flex items-center justify-center gap-2">
                  <MessageSquare size={17} />
                  Waiting for Founder Review
                </div>
              )}

              {(
                selectedTask.status?.toUpperCase() === "CHANGES REQUESTED" ||
                selectedTask.status?.toUpperCase() === "CHANGES_REQUESTED"
              ) && (
                <button
                  onClick={handleStartTask}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:brightness-110 transition-all font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <RefreshCw size={17} />
                  Work on Changes
                </button>
              )}

              {(
                selectedTask.status?.toUpperCase() === "APPROVED" ||
                selectedTask.status?.toUpperCase() === "COMPLETED"
              ) && (
                <div className="w-full h-12 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 font-semibold text-sm flex items-center justify-center gap-2">
                  <CheckCircle2 size={17} />
                  Task Completed
                </div>
              )}

              <button
                onClick={() =>
                  navigate("/employee/tasks")
                }
                className="w-full h-11 rounded-xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] text-white/60 font-medium text-sm flex items-center justify-center gap-2 transition-all"
              >
                Open My Tasks
                <ArrowRight size={15} />
              </button>

            </div>

          </div>
        </div>
      )}

    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* STAT                                                                        */
/* -------------------------------------------------------------------------- */

function DashboardStat({
  icon,
  label,
  value,
  description,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  description: string;
  accent:
    | "violet"
    | "blue"
    | "amber"
    | "emerald";
}) {
  const accentClasses = {
    violet:
      "bg-violet-500/10 text-violet-300 border-violet-500/10",
    blue:
      "bg-blue-500/10 text-blue-300 border-blue-500/10",
    amber:
      "bg-amber-500/10 text-amber-300 border-amber-500/10",
    emerald:
      "bg-emerald-500/10 text-emerald-300 border-emerald-500/10",
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-xl p-4 md:p-5">

      <div
        className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-4 ${accentClasses[accent]}`}
      >
        {icon}
      </div>

      <p className="text-xs text-white/35">
        {label}
      </p>

      <p className="text-2xl md:text-3xl font-bold mt-1">
        {value}
      </p>

      <p className="text-[11px] text-white/25 mt-1">
        {description}
      </p>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TIME BOX                                                                    */
/* -------------------------------------------------------------------------- */

function TimeBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">

      <p className="text-[10px] uppercase tracking-wide text-white/20">
        {label}
      </p>

      <p className="text-sm font-semibold mt-1">
        {value}
      </p>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* INFO BOX                                                                    */
/* -------------------------------------------------------------------------- */

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">

      <p className="text-[10px] uppercase tracking-[0.15em] text-white/20">
        {label}
      </p>

      <p className="text-sm text-white/70 mt-1.5">
        {value}
      </p>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TIME FORMAT                                                                 */
/* -------------------------------------------------------------------------- */

function formatTimeValue(value: any) {
  if (!value) return "—";

  try {
    const date =
      typeof value?.toDate === "function"
        ? value.toDate()
        : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleTimeString(
      "en-IN",
      {
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  } catch {
    return "—";
  }
}