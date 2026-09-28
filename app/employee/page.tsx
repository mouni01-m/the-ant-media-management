"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  getDocs,
  onSnapshot,
  query,
  where,
  updateDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import BrandLogo from "@/app/components/brand-logo";
import { toFirestoreDate, toFirestoreMillis } from "@/lib/firestore-time";

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
  createdAt?: unknown;
  updatedAt?: unknown;
};

type Attendance = {
  id?: string;
  date?: string;
  userId?: string;
  checkIn?: unknown;
  checkInAt?: unknown;
  checkOut?: unknown;
  checkOutAt?: unknown;
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

function getTimestampMillis(value: unknown) { return toFirestoreMillis(value); }

function getPriorityClass(priority?: string) {
  switch (priority?.toLowerCase()) {
    case "urgent":
      return "bg-red-500/10 text-red-700 border-red-500/20";

    case "important":
    case "high":
      return "bg-amber-500/10 text-amber-700 border-amber-500/20";

    case "medium":
      return "bg-[var(--brand-red)]/10 text-[var(--brand-red)] border-[var(--brand-red-secondary)]/20";

    default:
      return "bg-white text-[var(--brand-black)] border-[var(--brand-border)]";
  }
}

function getStatusClass(status?: string) {
  const normalized = status?.toUpperCase();

  switch (normalized) {
    case "APPROVED":
    case "COMPLETED":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";

    case "SUBMITTED":
    case "REVIEW":
      return "bg-[var(--brand-red)]/10 text-[var(--brand-red)] border-[var(--brand-red-secondary)]/20";

    case "CHANGES REQUESTED":
    case "CHANGES_REQUESTED":
      return "bg-amber-500/10 text-amber-700 border-amber-500/20";

    case "IN PROGRESS":
    case "IN_PROGRESS":
      return "bg-[var(--brand-red)]/10 text-[var(--brand-red)] border-[var(--brand-red-secondary)]/20";

    default:
      return "bg-white text-[var(--brand-black)] border-[var(--brand-border)]";
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

  return normalized === "COMPLETED" || normalized === "APPROVED";
}

function isReviewStatus(status?: string) {
  const normalized = status?.toUpperCase();

  return normalized === "SUBMITTED" || normalized === "REVIEW";
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
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  const [todayAttendance, setTodayAttendance] = useState<Attendance | null>(
    null,
  );
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceActionLoading, setAttendanceActionLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");
  const [attendanceSuccess, setAttendanceSuccess] = useState("");
  const [attendanceReadError, setAttendanceReadError] = useState(false);
  const [onApprovedLeave, setOnApprovedLeave] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(true);
  const [leaveReadError, setLeaveReadError] = useState(false);

  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const [loading, setLoading] = useState(true);

  const [authReady, setAuthReady] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  /* ---------------------------------------------------------------------- */
  /* AUTH + FIRESTORE                                                        */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let unsubscribeTasks: (() => void) | null = null;
    let unsubscribeAttendance: (() => void) | null = null;
    let unsubscribeNotifications: (() => void) | null = null;
    let unsubscribeLeave: (() => void) | null = null;
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
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

      const profileRef = doc(db, "users", user.uid);

      unsubscribeProfile = onSnapshot(
        profileRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            setProfile({
              name: user.displayName || user.email?.split("@")[0] || "Employee",
              email: user.email || "",
              role: "employee",
            });

            setLoading(false);
            return;
          }

          const profileData = snapshot.data() as Profile;

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
          console.error("Profile listener error:", error);

          setProfile({
            name: user.displayName || user.email?.split("@")[0] || "Employee",
            email: user.email || "",
            role: "employee",
          });

          setLoading(false);
        },
      );

      /* ---------------------------------------------------------------- */
      /* TASKS                                                              */
      /* ---------------------------------------------------------------- */

      const assignedTasksQuery = query(
        collection(db, "tasks"),
        where("assignedTo", "==", user.uid),
      );
      const teamTasksQuery = query(
        collection(db, "tasks"),
        where("teamMemberIds", "array-contains", user.uid),
      );
      const assignedTasks = new Map<string, Task>();
      const teamTasks = new Map<string, Task>();
      const publishTasks = () => {
        const combined = new Map([...assignedTasks, ...teamTasks]);
        const items = Array.from(combined.values());
        items.sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
        setTasks(items);
        setTasksLoading(false);
      };

      unsubscribeTasks = onSnapshot(
        assignedTasksQuery,
        (snapshot) => {
          assignedTasks.clear();
          snapshot.docs.forEach((item) => assignedTasks.set(item.id, { id: item.id, ...item.data() } as Task));
          publishTasks();
        },
        (error) => {
          console.error("Tasks listener error:", error);
          publishTasks();
        },
      );
      const unsubscribeTeamTasks = onSnapshot(
        teamTasksQuery,
        (snapshot) => {
          teamTasks.clear();
          snapshot.docs.forEach((item) => teamTasks.set(item.id, { id: item.id, ...item.data() } as Task));
          publishTasks();
        },
        (error) => {
          console.error("Team tasks listener error:", error);
          publishTasks();
        },
      );
      const unsubscribeAssignedTasks = unsubscribeTasks;
      unsubscribeTasks = () => { unsubscribeAssignedTasks?.(); unsubscribeTeamTasks(); };

      /* ---------------------------------------------------------------- */
      /* ATTENDANCE                                                        */
      /* ---------------------------------------------------------------- */

      const todayKey = getTodayKey();
      const attendanceQuery = query(
        collection(db, "attendance"),
        where("userId", "==", user.uid),
        where("date", "==", todayKey),
      );
      unsubscribeAttendance = onSnapshot(
        attendanceQuery,
        (snapshot) => {
          const todayRecord = snapshot.docs[0];
          setTodayAttendance(todayRecord ? { id: todayRecord.id, ...todayRecord.data() } as Attendance : null);
          setAttendanceReadError(false);
          setAttendanceLoading(false);
        },
        (error) => {
          console.error("Attendance listener error:", error);
          setAttendanceReadError(true);
          setAttendanceError("Unable to load today's attendance. Please refresh and try again.");
          setAttendanceLoading(false);
        },
      );

      const leaveQuery = query(collection(db, "leaveRequests"), where("userId", "==", user.uid));
      unsubscribeLeave = onSnapshot(
        leaveQuery,
        (snapshot) => {
          const today = getTodayKey();
          setOnApprovedLeave(snapshot.docs.some((item) => {
            const leave = item.data();
            return leave.status === "APPROVED" && typeof leave.startDate === "string" && typeof leave.endDate === "string" && leave.startDate <= today && leave.endDate >= today;
          }));
          setLeaveReadError(false);
          setLeaveLoading(false);
        },
        (error) => {
          console.error("Employee leave status listener error:", error);
          setLeaveReadError(true);
          setAttendanceError("Unable to verify approved leave status. Attendance actions are disabled until it can be checked.");
          setLeaveLoading(false);
        },
      );

      /* ---------------------------------------------------------------- */
      /* NOTIFICATIONS                                                     */
      /* ---------------------------------------------------------------- */

      const notificationsQuery = query(
        collection(db, "notifications"),
        where("userId", "==", user.uid),
      );

      unsubscribeNotifications = onSnapshot(
        notificationsQuery,
        (snapshot) => {
          const count = snapshot.docs.filter(
            (item) =>
              item.data().read !== true &&
              (item.data().direction || "received") === "received",
          ).length;

          setUnreadNotifications(count);
        },
        (error) => {
          console.error("Notification listener error:", error);

          setUnreadNotifications(0);
        },
      );

    });

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
      if (unsubscribeLeave) unsubscribeLeave();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* DERIVED DATA                                                            */
  /* ---------------------------------------------------------------------- */

  const activeTasks = useMemo(
    () => tasks.filter((task) => isActiveStatus(task.status)),
    [tasks],
  );

  const reviewTasks = useMemo(
    () => tasks.filter((task) => isReviewStatus(task.status)),
    [tasks],
  );

  const completedTasks = useMemo(
    () => tasks.filter((task) => isCompletedStatus(task.status)),
    [tasks],
  );

  const onLeaveToday = onApprovedLeave || ["LEAVE", "ON LEAVE"].includes(String(todayAttendance?.status || "").toUpperCase());

  const overdueTasks = useMemo(
    () => tasks.filter((task) => isTaskOverdue(task)),
    [tasks],
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

    return Math.min(activeTasks.length * 20, 100);
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

  const firstName = displayName.split(" ")[0] || displayName;

  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((name) => name.charAt(0).toUpperCase())
    .join("");

  /* ---------------------------------------------------------------------- */
  /* NAVIGATION                                                              */
  /* ---------------------------------------------------------------------- */

  function navigate(path: string) {
    setSidebarOpen(false);
    router.push(path);
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      router.push("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  }

  function refreshDashboard() {
    setRefreshing(true);

    window.setTimeout(() => {
      window.location.reload();
    }, 400);
  }

  async function handleAttendanceAction() {
    const user = auth.currentUser;
    if (!user || attendanceActionLoading || onLeaveToday || attendanceLoading || leaveLoading || attendanceReadError || leaveReadError) return;
    setAttendanceError("");
    setAttendanceSuccess("");
    setAttendanceActionLoading(true);
    const today = getTodayKey();
    try {
      if (!todayAttendance?.checkIn) {
        const existing = await getDocs(query(
          collection(db, "attendance"),
          where("userId", "==", user.uid),
          where("date", "==", today),
        ));
        const existingRecord = existing.docs.find((item) => Boolean(item.data().checkIn));
        if (existingRecord) {
          setTodayAttendance({ id: existingRecord.id, ...existingRecord.data() } as Attendance);
          setAttendanceError("You have already checked in today.");
          return;
        }
        const now = new Date();
        const checkIn = now.toISOString();
        const attendanceRef = existing.docs[0]?.ref || doc(db, "attendance", `${user.uid}_${today}`);
        const record = {
          userId: user.uid,
          userName: profile?.name || user.displayName || user.email?.split("@")[0] || "Employee",
          userEmail: profile?.email || user.email || "",
          role: profile?.role || "employee",
          department: profile?.department || "",
          date: today,
          checkIn,
          checkInAt: checkIn,
          checkOut: "",
          checkOutAt: "",
          totalHours: 0,
          status: now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() >= 15) ? "Late" : "Present",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(attendanceRef, record);
        setTodayAttendance({ ...record, id: attendanceRef.id, createdAt: new Date() } as Attendance);
        setAttendanceSuccess(`Checked in at ${formatTimeValue(checkIn)}.`);
        return;
      }

      if (!todayAttendance.id) throw new Error("Today's attendance record could not be identified.");
      if (todayAttendance.checkOut) {
        setAttendanceError("You have already checked out today.");
        return;
      }
      const checkInTime = new Date(String(todayAttendance.checkIn)).getTime();
      if (!Number.isFinite(checkInTime)) throw new Error("The check-in time is invalid. Please contact the Founder.");
      const now = new Date();
      const checkOut = now.toISOString();
      const totalHours = Number(Math.max(0, now.getTime() - checkInTime) / 3600000).toFixed(2);
      await updateDoc(doc(db, "attendance", todayAttendance.id), {
        checkOut,
        checkOutAt: checkOut,
        totalHours: Number(totalHours),
        updatedAt: serverTimestamp(),
      });
      setTodayAttendance({ ...todayAttendance, checkOut, checkOutAt: checkOut, totalHours: Number(totalHours) });
      setAttendanceSuccess(`Checked out at ${formatTimeValue(checkOut)}.`);
    } catch (error) {
      console.error("Employee overview attendance action failed:", error);
      setAttendanceError(error instanceof Error ? error.message : "Unable to update attendance. Please try again.");
    } finally {
      setAttendanceActionLoading(false);
    }
  }

  async function handleStartTask() {
    if (!selectedTask) return;

    try {
      await updateDoc(doc(db, "tasks", selectedTask.id), {
        status: "IN PROGRESS",
        updatedAt: serverTimestamp(),
      });

      setSelectedTask({
        ...selectedTask,
        status: "IN PROGRESS",
      });
    } catch (error) {
      console.error("Failed to start task:", error);

      alert("Unable to start the task. Please try again.");
    }
  }

  /* ---------------------------------------------------------------------- */
  /* LOADING                                                                  */
  /* ---------------------------------------------------------------------- */

  if (!authReady || loading) {
    return (
      <main className="min-h-screen bg-white text-[var(--brand-black)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[var(--brand-red)] flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/30">
            <Target size={25} />
          </div>

          <div className="flex items-center gap-2 text-[var(--brand-black)] text-sm">
            <Loader2 size={16} className="animate-spin" />
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
    <main className="min-h-screen bg-white text-[var(--brand-black)] overflow-x-hidden">
      {/* BACKGROUND */}

      <div className="fixed inset-0 pointer-events-none border-t-2 border-[var(--brand-red)] bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:40px_40px]" />

      {/* MOBILE OVERLAY */}

      {sidebarOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/70  lg:hidden"
        />
      )}

      {/* SIDEBAR */}

      <aside
        className={`fixed left-0 top-0 bottom-0 z-50 w-[270px] border-r border-[var(--brand-border)] bg-white  transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="h-full flex flex-col">
          {/* BRAND */}

          <div className="flex h-[82px] items-center justify-center border-b border-[var(--brand-border)] px-2">
            <div className="flex w-full items-center justify-center gap-3">
              <BrandLogo priority />
            </div>
          </div>

          {/* USER */}

          <div className="px-4 pt-5">
            <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--brand-red)] flex items-center justify-center font-bold text-sm">
                  {initials || "E"}
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {displayName}
                  </p>

                  <p className="text-[11px] text-[var(--brand-medium-gray)] capitalize mt-0.5">
                    {profile?.role || "employee"}
                  </p>
                </div>
              </div>

              {profile?.department && (
                <div className="mt-3 text-[10px] uppercase tracking-[0.16em] text-[var(--brand-red)]">
                  {profile.department}
                </div>
              )}
            </div>
          </div>

          {/* NAVIGATION */}

          <nav className="flex-1 px-3 py-5 overflow-y-auto">
            <p className="px-3 mb-3 text-[10px] uppercase tracking-[0.18em] text-[var(--brand-dark-gray)] font-semibold">
              Workspace
            </p>

            <div className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;

                const active = item.path === "/employee";

                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm transition-all ${
                      active
                        ? "bg-[var(--brand-red)]/15 text-[var(--brand-black)] border border-[var(--brand-red)]/35"
                        : "text-[var(--brand-black)] hover:text-[var(--brand-black)] hover:bg-[var(--brand-red-light)] border border-transparent"
                    }`}
                  >
                    <Icon size={18} />

                    <span className="flex-1 text-left">{item.label}</span>

                    {item.label === "Notifications" &&
                      unreadNotifications > 0 && (
                        <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-[var(--brand-black)] text-[10px] font-semibold flex items-center justify-center">
                          {unreadNotifications > 99
                            ? "99+"
                            : unreadNotifications}
                        </span>
                      )}

                    {active && (
                      <ChevronRight
                        size={15}
                        className="text-[var(--brand-red)]"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </nav>

          {/* SIDEBAR FOOTER */}

          <div className="p-4 border-t border-[var(--brand-border)]">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm text-[var(--brand-black)] hover:text-red-700 hover:bg-red-500/[0.06] transition"
            >
              <LogOut size={18} />
              Sign out
            </button>

            <p className="text-[10px] text-[var(--brand-medium-gray)] text-center mt-4">
              Small Team. Big Impact.
            </p>
          </div>
        </div>
      </aside>

      {/* MAIN */}

      <div className="lg:pl-[270px] relative z-10">
        {/* TOP BAR */}

        <header className="sticky top-0 z-30 border-b border-[var(--brand-border)] bg-white ">
          <div className="px-5 md:px-8 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden w-10 h-10 rounded-xl border border-[var(--brand-border)] bg-white flex items-center justify-center"
                >
                  <Menu size={19} />
                </button>

                <div>
                  <p className="text-[10px] md:text-[11px] uppercase tracking-[0.2em] text-[var(--brand-red)] font-semibold">
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
                  className="w-10 h-10 rounded-xl border border-[var(--brand-border)] bg-white hover:bg-[var(--brand-red-light)] flex items-center justify-center transition"
                  title="Refresh dashboard"
                >
                  <RefreshCw
                    size={17}
                    className={refreshing ? "animate-spin" : ""}
                  />
                </button>

                <button
                  onClick={() => navigate("/employee/notifications")}
                  className="relative w-10 h-10 rounded-xl border border-[var(--brand-border)] bg-white hover:bg-[var(--brand-red-light)] flex items-center justify-center transition"
                  title="Notifications"
                >
                  <Bell size={18} />

                  {unreadNotifications > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-[9px] font-bold flex items-center justify-center border-2 border-white">
                      {unreadNotifications > 99 ? "99+" : unreadNotifications}
                    </span>
                  )}
                </button>

                <div className="hidden sm:flex w-10 h-10 rounded-xl bg-[var(--brand-red)] items-center justify-center font-bold text-sm">
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
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/[0.04] text-emerald-700/80 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Workspace active
                </div>

                <h2 className="text-3xl md:text-5xl font-bold tracking-tight mt-4">
                  Good day,{" "}
                  <span className="text-[var(--brand-red)]">{firstName}</span>.
                </h2>

                <p className="text-[var(--brand-medium-gray)] mt-3 text-sm md:text-base">
                  {formatToday()}
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-[var(--brand-black)]">
                <Clock3 size={15} />
                Your workspace updates in real time
              </div>
            </div>
          </section>

          {/* STATS */}

          <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-6">
            <DashboardStat
              icon={<Target size={19} />}
              label="Active Tasks"
              value={activeTasks.length}
              description={tasksLoading ? "Loading tasks…" : "Currently assigned"}
              accent="brand"
              onClick={() => navigate("/employee/tasks?filter=active")}
            />

            <DashboardStat
              icon={<Clock3 size={19} />}
              label="Due Today"
              value={dueTodayTasks.length}
              description={tasksLoading ? "Loading tasks…" : "Needs attention today"}
              accent="brand"
              onClick={() => navigate("/employee/tasks?filter=due-today")}
            />

            <DashboardStat
              icon={<MessageSquare size={19} />}
              label="In Review"
              value={reviewTasks.length}
              description={tasksLoading ? "Loading tasks…" : "Waiting for review"}
              accent="brand"
              onClick={() => navigate("/employee/tasks?filter=review")}
            />

            <DashboardStat
              icon={<CheckCircle2 size={19} />}
              label="Completed"
              value={completedTasks.length}
              description={tasksLoading ? "Loading tasks…" : "Finished work"}
              accent="emerald"
              onClick={() => navigate("/employee/tasks?filter=completed")}
            />
          </section>

          {/* MAIN GRID */}

          <section className="grid grid-cols-1 xl:grid-cols-[1.5fr_0.8fr] gap-5 mb-5">
            {/* TASKS */}

            <div className="rounded-3xl border border-[var(--brand-border)] bg-white  overflow-hidden">
              <div className="px-5 md:px-6 py-5 border-b border-[var(--brand-border)] flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Target size={18} className="text-[var(--brand-red)]" />

                    <h3 className="font-semibold">My Work</h3>
                  </div>

                  <p className="text-xs text-[var(--brand-medium-gray)] mt-1">
                    Your latest assigned tasks
                  </p>
                </div>

                <button
                  onClick={() => navigate("/employee/tasks")}
                  className="flex items-center gap-1.5 text-xs text-[var(--brand-red)] hover:text-[var(--brand-red)]"
                >
                  View all
                  <ArrowRight size={14} />
                </button>
              </div>

              {tasksLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--brand-medium-gray)]"><Loader2 size={16} className="animate-spin" />Loading your tasks…</div>
              ) : tasks.length === 0 ? (
                <div className="py-16 px-6 text-center">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-white border border-[var(--brand-border)] flex items-center justify-center text-[var(--brand-black)]">
                    <Target size={23} />
                  </div>

                  <p className="font-medium mt-4">No tasks assigned yet</p>

                  <p className="text-xs text-[var(--brand-medium-gray)] mt-2">
                    New work assigned by the Founder will appear here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--brand-border)]">
                  {tasks.slice(0, 5).map((task) => (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      aria-label={`Open task ${task.title || "Untitled task"}`}
                      className="w-full cursor-pointer text-left p-5 md:px-6 hover:bg-[var(--brand-red-light)] transition"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 shrink-0 rounded-xl bg-[var(--brand-red)]/10 text-[var(--brand-red)] border border-[var(--brand-red-secondary)]/10 flex items-center justify-center">
                          <FileCheck2 size={18} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">
                                {task.title || "Untitled task"}
                              </p>

                              <p className="text-xs text-[var(--brand-medium-gray)] mt-1">
                                {task.client ||
                                  task.department ||
                                  "Workspace task"}
                              </p>
                            </div>

                            <span
                              className={`w-fit px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-wide ${getStatusClass(
                                task.status,
                              )}`}
                            >
                              {prettyStatus(task.status)}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            {task.priority && (
                              <span
                                className={`px-2 py-1 rounded-full border text-[10px] uppercase tracking-wide ${getPriorityClass(
                                  task.priority,
                                )}`}
                              >
                                {task.priority}
                              </span>
                            )}

                            {task.deadline && (
                              <span
                                className={`flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] ${
                                  isTaskOverdue(task)
                                    ? "border-red-500/20 bg-red-500/10 text-red-700"
                                    : "border-[var(--brand-border)] bg-white text-[var(--brand-black)]"
                                }`}
                              >
                                <CalendarDays size={11} />
                                {formatShortDate(task.deadline)}

                                {isTaskOverdue(task) && " • Overdue"}
                              </span>
                            )}
                          </div>
                        </div>

                        <ChevronRight
                          size={17}
                          className="text-[var(--brand-black)] mt-2"
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

              <div className="rounded-3xl border border-[var(--brand-border)] bg-white  p-5 md:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <UserCheck size={18} className="text-emerald-700" />

                      <h3 className="font-semibold">Today&apos;s Attendance</h3>
                    </div>

                    <p className="text-xs text-[var(--brand-medium-gray)] mt-1">
                      {formatToday()}
                    </p>
                  </div>

                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      todayAttendance?.checkIn
                        ? "bg-emerald-500/10 text-emerald-700"
                        : "bg-amber-500/10 text-amber-700"
                    }`}
                  >
                    {todayAttendance?.checkIn ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Clock3 size={18} />
                    )}
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--brand-medium-gray)]">
                        Status
                      </p>

                      <p className="text-sm font-semibold mt-1">
                        {attendanceLoading || leaveLoading
                          ? "Loading attendance…"
                          : onLeaveToday
                            ? "On Leave"
                            : todayAttendance?.checkOut
                              ? "Attendance completed"
                              : todayAttendance?.checkIn
                                ? "Checked in"
                                : "Not checked in"}
                      </p>
                    </div>

                    {(onLeaveToday || todayAttendance?.status) && (
                      <span className="px-2.5 py-1 rounded-full border border-[var(--brand-border)] bg-white text-[10px] uppercase tracking-wide text-[var(--brand-black)]">
                        {onLeaveToday ? "On Leave" : todayAttendance?.status}
                      </span>
                    )}
                  </div>

                  {todayAttendance && Boolean(todayAttendance.checkIn) ? (
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <TimeBox
                        label="Check in"
                        value={formatTimeValue(todayAttendance.checkIn)}
                      />

                      <TimeBox
                        label="Check out"
                        value={
                          todayAttendance.checkOut
                            ? formatTimeValue(todayAttendance.checkOut)
                            : "—"
                        }
                      />
                    </div>
                  ) : null}
                </div>

                {(attendanceError || attendanceSuccess) && (
                  <p role={attendanceError ? "alert" : "status"} className={`mt-3 rounded-lg p-3 text-xs ${attendanceError ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                    {attendanceError || attendanceSuccess}
                  </p>
                )}
                {!onLeaveToday && !todayAttendance?.checkOut && (
                  <button
                    onClick={() => void handleAttendanceAction()}
                    disabled={attendanceLoading || leaveLoading || attendanceActionLoading || attendanceReadError || leaveReadError}
                    className="w-full mt-4 h-11 rounded-xl bg-[var(--brand-red)] text-white hover:opacity-90 disabled:opacity-50 text-sm font-semibold flex items-center justify-center gap-2 transition"
                  >
                    {attendanceActionLoading ? <Loader2 size={15} className="animate-spin" /> : <UserCheck size={15} />}
                    {attendanceActionLoading ? "Saving…" : todayAttendance?.checkIn ? "Check Out" : "Check In"}
                  </button>
                )}
                {Boolean(todayAttendance?.checkOut) && <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-800">Attendance completed for today</p>}
                <button
                  onClick={() => navigate("/employee/attendance")}
                  className="w-full mt-3 h-10 rounded-xl border border-[var(--brand-border)] bg-white hover:bg-[var(--brand-red-light)] text-xs font-medium flex items-center justify-center gap-2 transition"
                >
                  View attendance history <ArrowRight size={14} />
                </button>
              </div>

              {/* WORKLOAD */}

              <div className="rounded-3xl border border-[var(--brand-border)] bg-white  p-5 md:p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Target size={18} className="text-[var(--brand-red)]" />

                      <h3 className="font-semibold">Workload</h3>
                    </div>

                    <p className="text-xs text-[var(--brand-medium-gray)] mt-1">
                      Based on active tasks
                    </p>
                  </div>

                  <span className="text-lg font-bold">
                    {workloadPercentage}%
                  </span>
                </div>

                <div className="mt-5 h-2 rounded-full bg-[var(--brand-border)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--brand-red)] transition-all duration-500"
                    style={{
                      width: `${workloadPercentage}%`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between mt-3">
                  <span className="text-[11px] text-[var(--brand-black)]">
                    {activeTasks.length} active task
                    {activeTasks.length === 1 ? "" : "s"}
                  </span>

                  <span
                    className={`text-[11px] ${
                      workloadPercentage >= 80
                        ? "text-amber-700"
                        : "text-emerald-700"
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
                overdueTasks.length > 0
                  ? "border-red-500/15 bg-red-500/[0.035]"
                  : "border-[var(--brand-border)] bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    overdueTasks.length > 0
                      ? "bg-red-500/10 text-red-700"
                      : "bg-emerald-500/10 text-emerald-700"
                  }`}
                >
                  {overdueTasks.length > 0 ? (
                    <AlertCircle size={19} />
                  ) : (
                    <CheckCircle2 size={19} />
                  )}
                </div>

                <div>
                  <p className="font-semibold text-sm">
                    {overdueTasks.length > 0
                      ? "Attention required"
                      : "You're on track"}
                  </p>

                  <p className="text-xs text-[var(--brand-medium-gray)] mt-1 leading-relaxed">
                    {overdueTasks.length > 0
                      ? `${overdueTasks.length} task${
                          overdueTasks.length === 1 ? "" : "s"
                        } ${overdueTasks.length === 1 ? "is" : "are"} overdue.`
                      : "No overdue tasks right now."}
                  </p>
                </div>
              </div>

              {overdueTasks.length > 0 && (
                <button
                  onClick={() => navigate("/employee/tasks")}
                  className="mt-4 text-xs text-red-700 hover:text-red-700 flex items-center gap-1"
                >
                  Review overdue tasks
                  <ArrowRight size={13} />
                </button>
              )}
            </div>

            {/* REVIEW */}

            <div className="rounded-3xl border border-[var(--brand-red-secondary)]/10 bg-[var(--brand-red)]/[0.025] p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--brand-red)]/10 text-[var(--brand-red)] flex items-center justify-center">
                  <MessageSquare size={19} />
                </div>

                <div>
                  <p className="font-semibold text-sm">Review queue</p>

                  <p className="text-xs text-[var(--brand-medium-gray)] mt-1 leading-relaxed">
                    {reviewTasks.length > 0
                      ? `${reviewTasks.length} submitted task${
                          reviewTasks.length === 1 ? "" : "s"
                        } waiting for Founder review.`
                      : "No submitted work waiting for review."}
                  </p>
                </div>
              </div>

              <button
                onClick={() => navigate("/employee/tasks")}
                className="mt-4 text-xs text-[var(--brand-red)] hover:text-[var(--brand-red)] flex items-center gap-1"
              >
                Open My Tasks
                <ArrowRight size={13} />
              </button>
            </div>

            {/* NOTIFICATIONS */}

            <div className="rounded-3xl border border-[var(--brand-red-secondary)]/10 bg-[var(--brand-red)]/[0.025] p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--brand-red)]/10 text-[var(--brand-red)] flex items-center justify-center">
                  <Bell size={19} />
                </div>

                <div>
                  <p className="font-semibold text-sm">Notifications</p>

                  <p className="text-xs text-[var(--brand-medium-gray)] mt-1 leading-relaxed">
                    {unreadNotifications > 0
                      ? `${unreadNotifications} unread notification${
                          unreadNotifications === 1 ? "" : "s"
                        } waiting for you.`
                      : "You're all caught up."}
                  </p>
                </div>
              </div>

              <button
                onClick={() => navigate("/employee/notifications")}
                className="mt-4 text-xs text-[var(--brand-red)] hover:text-[var(--brand-red)] flex items-center gap-1"
              >
                Open Notifications
                <ArrowRight size={13} />
              </button>
            </div>
          </section>

          {/* FOOTER NOTE */}

          <div className="mt-7 flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-1">
            <p className="text-[11px] text-[var(--brand-medium-gray)]">
              THE ANT MEDIA • Internal Management System
            </p>

            <p className="text-[11px] text-[var(--brand-medium-gray)]">
              Small Team. Big Impact.
            </p>
          </div>
        </div>
      </div>

      {/* TASK DETAIL MODAL */}

      {selectedTask && (
        <div
          className="fixed inset-0 z-[70] bg-black/75  flex items-center justify-center p-4"
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[var(--brand-border)] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-6 border-b border-[var(--brand-border)] flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--brand-red)]">
                  Task details
                </p>

                <h3 className="text-xl md:text-2xl font-bold mt-2">
                  {selectedTask.title || "Untitled task"}
                </h3>
              </div>

              <button
                onClick={() => setSelectedTask(null)}
                className="w-9 h-9 shrink-0 rounded-xl bg-white hover:bg-[var(--brand-red-light)] flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex flex-wrap gap-2">
                <span
                  className={`px-3 py-1.5 rounded-full border text-[10px] uppercase tracking-wide ${getStatusClass(
                    selectedTask.status,
                  )}`}
                >
                  {prettyStatus(selectedTask.status)}
                </span>

                {selectedTask.priority && (
                  <span
                    className={`px-3 py-1.5 rounded-full border text-[10px] uppercase tracking-wide ${getPriorityClass(
                      selectedTask.priority,
                    )}`}
                  >
                    {selectedTask.priority}
                  </span>
                )}
              </div>

              {selectedTask.description && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--brand-medium-gray)]">
                    Description
                  </p>

                  <p className="text-sm text-[var(--brand-medium-gray)] leading-7 mt-2 whitespace-pre-wrap">
                    {selectedTask.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InfoBox
                  label="Client"
                  value={selectedTask.client || "Internal"}
                />

                <InfoBox
                  label="Department"
                  value={selectedTask.department || "—"}
                />

                <InfoBox
                  label="Task Type"
                  value={selectedTask.taskType || "—"}
                />

                <InfoBox
                  label="Start Date"
                  value={formatShortDate(selectedTask.startDate)}
                />

                <InfoBox
                  label="Deadline"
                  value={
                    selectedTask.deadline
                      ? `${formatShortDate(selectedTask.deadline)}${
                          selectedTask.deadlineTime
                            ? ` • ${selectedTask.deadlineTime}`
                            : ""
                        }`
                      : "No deadline"
                  }
                />

                <InfoBox
                  label="Status"
                  value={prettyStatus(selectedTask.status)}
                />
              </div>

              {(!selectedTask.status ||
                selectedTask.status.toUpperCase() === "TO DO" ||
                selectedTask.status.toUpperCase() === "TODO") && (
                <button
                  onClick={handleStartTask}
                  className="w-full h-12 rounded-xl bg-[var(--brand-red)] hover:brightness-110 transition-all font-semibold text-sm flex items-center justify-center gap-2 shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/20"
                >
                  <Target size={17} />
                  Start Task
                </button>
              )}

              {selectedTask.status?.toUpperCase() === "IN PROGRESS" && (
                <div className="w-full h-12 rounded-xl border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/10 text-[var(--brand-red)] font-semibold text-sm flex items-center justify-center gap-2">
                  <Clock3 size={17} />
                  Task In Progress
                </div>
              )}

              {(selectedTask.status?.toUpperCase() === "SUBMITTED" ||
                selectedTask.status?.toUpperCase() === "REVIEW") && (
                <div className="w-full h-12 rounded-xl border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/10 text-[var(--brand-red)] font-semibold text-sm flex items-center justify-center gap-2">
                  <MessageSquare size={17} />
                  Waiting for Founder Review
                </div>
              )}

              {(selectedTask.status?.toUpperCase() === "CHANGES REQUESTED" ||
                selectedTask.status?.toUpperCase() === "CHANGES_REQUESTED") && (
                <button
                  onClick={handleStartTask}
                  className="w-full h-12 rounded-xl bg-[var(--brand-red)] hover:brightness-110 transition-all font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <RefreshCw size={17} />
                  Work on Changes
                </button>
              )}

              {(selectedTask.status?.toUpperCase() === "APPROVED" ||
                selectedTask.status?.toUpperCase() === "COMPLETED") && (
                <div className="w-full h-12 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 font-semibold text-sm flex items-center justify-center gap-2">
                  <CheckCircle2 size={17} />
                  Task Completed
                </div>
              )}

              <button
                onClick={() => navigate("/employee/tasks")}
                className="w-full h-11 rounded-xl border border-[var(--brand-border)] bg-white hover:bg-[var(--brand-red-light)] text-[var(--brand-black)] font-medium text-sm flex items-center justify-center gap-2 transition-all"
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
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  description: string;
  accent: "brand" | "emerald";
  onClick: () => void;
}) {
  const accentClasses = {
    brand:
      "bg-[var(--brand-red)]/10 text-[var(--brand-red)] border-[var(--brand-red)]/25",
    emerald: "bg-emerald-500/10 text-emerald-700 border-emerald-500/10",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${value}. ${description}. Open filtered tasks.`}
      className="w-full cursor-pointer rounded-2xl border border-[var(--brand-border)] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--brand-red-secondary)]/40 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-red)] md:p-5"
    >
      <div
        className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-4 ${accentClasses[accent]}`}
      >
        {icon}
      </div>

      <p className="text-xs text-[var(--brand-medium-gray)]">{label}</p>

      <p className="text-2xl md:text-3xl font-bold mt-1">{value}</p>

      <p className="text-[11px] text-[var(--brand-medium-gray)] mt-1">
        {description}
      </p>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* TIME BOX                                                                    */
/* -------------------------------------------------------------------------- */

function TimeBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-white p-3">
      <p className="text-[10px] uppercase tracking-wide text-[var(--brand-medium-gray)]">
        {label}
      </p>

      <p className="text-sm font-semibold mt-1">{value}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* INFO BOX                                                                    */
/* -------------------------------------------------------------------------- */

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-white p-4">
      <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--brand-medium-gray)]">
        {label}
      </p>

      <p className="text-sm text-[var(--brand-medium-gray)] mt-1.5">{value}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TIME FORMAT                                                                 */
/* -------------------------------------------------------------------------- */

function formatTimeValue(value: unknown) {
  if (!value) return "—";

  try {
    const date = toFirestoreDate(value);
    if (!date) return "—";

    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}
