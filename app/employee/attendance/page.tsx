"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LogOut,
  Menu,
  Sparkles,
  UserRound,
  X,
  ChevronRight,
  History,
  Timer,
  BriefcaseBusiness,
  CircleAlert,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import BrandLogo from "@/app/components/brand-logo";

import { auth, db } from "@/lib/firebase";

type Profile = {
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
  userEmail?: string;
  role?: string;
  department?: string;
  date?: string;
  checkIn?: string;
  checkOut?: string;
  checkInAt?: string;
  checkOutAt?: string;
  totalHours?: number;
  status?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(dateString?: string) {
  if (!dateString) return "Unknown date";

  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(value?: string) {
  if (!value) return "--:--";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function calculateHours(
  checkIn?: string,
  checkOut?: string,
  currentTime = new Date(),
) {
  if (!checkIn) return 0;

  const start = new Date(checkIn);

  if (Number.isNaN(start.getTime())) {
    return 0;
  }

  const end = checkOut ? new Date(checkOut) : currentTime;

  if (Number.isNaN(end.getTime())) {
    return 0;
  }

  const milliseconds = Math.max(0, end.getTime() - start.getTime());

  return milliseconds / (1000 * 60 * 60);
}

function formatDuration(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) {
    return "0h 00m";
  }

  const totalMinutes = Math.floor(hours * 60);

  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function getAttendanceStatus(date = new Date()) {
  const hour = date.getHours();
  const minute = date.getMinutes();

  /*
    Attendance policy:
    Before 09:15 AM = Present
    09:15 AM or later = Late

    Change these values later if The Ant Media
    has a different office timing.
  */
  if (hour > 9 || (hour === 9 && minute >= 15)) {
    return "Late";
  }

  return "Present";
}

export default function EmployeeAttendancePage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);

  const [history, setHistory] = useState<AttendanceRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [currentTime, setCurrentTime] = useState(new Date());

  const [menuOpen, setMenuOpen] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /*
   * LIVE CLOCK
   */
  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  /*
   * AUTH + PROFILE + ATTENDANCE
   */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        window.location.href = "/";
        return;
      }

      setUser(currentUser);

      try {
        const profileRef = doc(db, "users", currentUser.uid);

        const profileSnap = await getDoc(profileRef);

        if (!profileSnap.exists()) {
          await signOut(auth);
          window.location.href = "/";
          return;
        }

        const profileData = profileSnap.data() as Profile;

        if (
          profileData.active !== true ||
          !["employee", "intern"].includes(profileData.role || "")
        ) {
          await signOut(auth);
          window.location.href = "/";
          return;
        }

        setProfile(profileData);

        await loadAttendance(currentUser.uid);
      } catch (err) {
        console.error("EMPLOYEE ATTENDANCE LOAD ERROR:", err);

        setError("Unable to load attendance. Please refresh and try again.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  /*
   * LOAD ATTENDANCE
   */
  async function loadAttendance(uid: string) {
    const today = getDateKey();

    // Query by userId/date instead of reading a predictable document ID.
    // This avoids a Firestore permission denial when today's document does not exist yet.
    const todayQuery = query(
      collection(db, "attendance"),
      where("userId", "==", uid),
      where("date", "==", today),
    );

    const todaySnapshot = await getDocs(todayQuery);

    if (!todaySnapshot.empty) {
      const todayDoc = todaySnapshot.docs[0];

      setTodayRecord({
        id: todayDoc.id,
        ...(todayDoc.data() as Omit<AttendanceRecord, "id">),
      });
    } else {
      setTodayRecord(null);
    }

    /*
     * History
     */
    const attendanceQuery = query(
      collection(db, "attendance"),
      where("userId", "==", uid),
    );

    const snapshot = await getDocs(attendanceQuery);

    const records: AttendanceRecord[] = snapshot.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<AttendanceRecord, "id">),
    }));

    records.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    setHistory(records);
  }

  /*
   * CHECK IN
   */
  async function handleCheckIn() {
    if (!user || !profile) return;

    setError("");
    setSuccess("");
    setActionLoading(true);

    try {
      const now = new Date();

      const dateKey = getDateKey(now);

      // Check today's record through a secure user/date query.
      // This works even when today's attendance document has not been created yet.
      const existingQuery = query(
        collection(db, "attendance"),
        where("userId", "==", user.uid),
        where("date", "==", dateKey),
      );

      const existingSnapshot = await getDocs(existingQuery);

      if (!existingSnapshot.empty) {
        const existingDoc = existingSnapshot.docs[0];
        const existing = existingDoc.data() as AttendanceRecord;

        if (existing.checkIn) {
          setError("You have already checked in today.");

          setTodayRecord({
            ...existing,
            id: existingDoc.id,
          });

          return;
        }
      }

      const attendanceRef = doc(db, "attendance", `${user.uid}_${dateKey}`);

      const status = getAttendanceStatus(now);

      const checkInISO = now.toISOString();

      const record = {
        userId: user.uid,

        userName:
          profile.name ||
          user.displayName ||
          user.email?.split("@")[0] ||
          "Employee",

        userEmail: profile.email || user.email || "",

        role: profile.role || "employee",

        department: profile.department || "development",

        date: dateKey,

        checkIn: checkInISO,

        checkInAt: checkInISO,

        checkOut: "",

        checkOutAt: "",

        totalHours: 0,

        status,

        createdAt: serverTimestamp(),

        updatedAt: serverTimestamp(),
      };

      await setDoc(attendanceRef, record);

      setTodayRecord({
        ...(record as AttendanceRecord),
        id: attendanceRef.id,
      });

      setSuccess(`Checked in successfully at ${formatTime(checkInISO)}.`);

      await loadAttendance(user.uid);
    } catch (err) {
      console.error("CHECK IN ERROR:", err);

      setError("Check-in failed. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  /*
   * CHECK OUT
   */
  async function handleCheckOut() {
    if (!user || !todayRecord) return;

    setError("");
    setSuccess("");
    setActionLoading(true);

    try {
      if (!todayRecord.checkIn) {
        setError("You need to check in before checking out.");

        return;
      }

      if (todayRecord.checkOut) {
        setError("You have already checked out today.");

        return;
      }

      const now = new Date();

      const hours = calculateHours(todayRecord.checkIn, undefined, now);

      const attendanceRef = doc(db, "attendance", todayRecord.id);

      await updateDoc(attendanceRef, {
        checkOut: now.toISOString(),

        checkOutAt: now.toISOString(),

        totalHours: Number(hours.toFixed(2)),

        updatedAt: serverTimestamp(),
      });

      setTodayRecord({
        ...todayRecord,

        checkOut: now.toISOString(),

        checkOutAt: now.toISOString(),

        totalHours: Number(hours.toFixed(2)),
      });

      setSuccess(
        `Checked out successfully at ${formatTime(now.toISOString())}.`,
      );

      await loadAttendance(user.uid);
    } catch (err) {
      console.error("CHECK OUT ERROR:", err);

      setError("Check-out failed. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLogout() {
    await signOut(auth);
    window.location.href = "/";
  }

  /*
   * DERIVED VALUES
   */
  const displayName =
    profile?.name ||
    user?.displayName ||
    user?.email?.split("@")[0] ||
    "Employee";

  const initials = displayName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const workingHours = useMemo(() => {
    if (!todayRecord?.checkIn) {
      return 0;
    }

    return calculateHours(
      todayRecord.checkIn,
      todayRecord.checkOut,
      currentTime,
    );
  }, [todayRecord, currentTime]);

  const hasCheckedIn = Boolean(todayRecord?.checkIn);

  const hasCheckedOut = Boolean(todayRecord?.checkOut);

  const todayStatus = todayRecord?.status || "Not Checked In";

  const totalDays = history.length;

  const presentDays = history.filter(
    (item) => item.status === "Present" || item.status === "Late",
  ).length;

  const lateDays = history.filter((item) => item.status === "Late").length;

  const averageHours =
    history.length > 0
      ? history.reduce((sum, item) => sum + Number(item.totalHours || 0), 0) /
        history.length
      : 0;

  if (loading) {
    return (
      <main className="min-h-screen bg-white text-[var(--brand-black)] flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-5 h-12 w-12 rounded-2xl bg-[var(--brand-red)] flex items-center justify-center animate-pulse">
            <Sparkles size={22} />
          </div>

          <p className="text-[var(--brand-medium-gray)]">
            Loading attendance...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-[var(--brand-black)]">
      {/* BACKGROUND */}

      <div className="fixed inset-0 pointer-events-none overflow-hidden"></div>

      <div className="relative flex min-h-screen">
        {/* SIDEBAR */}

        <aside
          className={`fixed z-50 inset-y-0 left-0 w-[270px] border-r border-[var(--brand-border)] bg-white  transform transition-transform duration-300 lg:translate-x-0 ${
            menuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="h-full flex flex-col">
            {/* BRAND */}

            <div className="h-[82px] px-6 flex items-center border-b border-[var(--brand-border)]">
              <BrandLogo className="h-[72px] w-[205px]" priority />
            </div>

            {/* PROFILE */}

            <div className="p-4">
              <div className="rounded-2xl border border-[var(--brand-red-secondary)]/15 bg-[var(--brand-red)]/[0.07] p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[var(--brand-red)]/15 flex items-center justify-center text-[var(--brand-red)] font-semibold">
                    {initials}
                  </div>

                  <div className="min-w-0">
                    <div className="font-semibold truncate">{displayName}</div>

                    <div className="text-xs text-[var(--brand-black)] capitalize">
                      {profile?.role || "Employee"}
                    </div>
                  </div>

                  <span className="ml-auto h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_2px_8px_rgba(0,0,0,0.04)]" />
                </div>
              </div>
            </div>

            {/* NAVIGATION */}

            <nav className="px-3 space-y-1">
              <div className="px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[var(--brand-black)]">
                Workspace
              </div>

              <SidebarItem
                icon={<BriefcaseBusiness size={18} />}
                label="Overview"
                href="/employee"
              />

              <SidebarItem
                icon={<CheckCircle2 size={18} />}
                label="My Tasks"
                href="/employee"
              />

              <SidebarItem
                icon={<Clock3 size={18} />}
                label="Attendance"
                href="/employee/attendance"
                active
              />

              <SidebarItem
                icon={<CalendarDays size={18} />}
                label="Calendar"
                href="/employee/calendar"
              />

              <SidebarItem
                icon={<Sparkles size={18} />}
                label="Notifications"
                href="/employee/notifications"
              />

              <SidebarItem
                icon={<History size={18} />}
                label="Leave Requests"
                href="/employee/leave-requests"
              />
            </nav>

            {/* LOGOUT */}

            <div className="mt-auto p-4 border-t border-[var(--brand-border)]">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[var(--brand-black)] hover:text-[var(--brand-black)] hover:bg-[var(--brand-red-light)] transition"
              >
                <LogOut size={18} />

                <span>Sign out</span>
              </button>
            </div>
          </div>
        </aside>

        {/* MOBILE OVERLAY */}

        {menuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/70 lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
        )}

        {/* MAIN */}

        <section className="flex-1 lg:ml-[270px] min-w-0">
          {/* TOPBAR */}

          <header className="sticky top-0 z-30 h-[82px] border-b border-[var(--brand-border)] bg-white ">
            <div className="h-full px-5 lg:px-8 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setMenuOpen(true)}
                  className="lg:hidden h-10 w-10 rounded-xl border border-[var(--brand-border)] flex items-center justify-center"
                >
                  <Menu size={19} />
                </button>

                <div>
                  <div className="text-xs text-[var(--brand-black)]">
                    Employee / Workspace
                  </div>

                  <h1 className="text-xl font-semibold">Attendance</h1>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-3 px-2">
                  <div className="h-10 w-10 rounded-xl bg-[var(--brand-red)] flex items-center justify-center font-semibold">
                    {initials}
                  </div>

                  <div className="hidden md:block">
                    <div className="text-sm font-semibold">{displayName}</div>

                    <div className="text-[11px] text-[var(--brand-black)] capitalize">
                      {profile?.department || "Workspace"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* CONTENT */}

          <div className="p-5 lg:p-8 max-w-[1450px] mx-auto">
            {/* HEADER */}

            <div className="mb-8">
              <div className="flex items-center gap-2 text-[var(--brand-red)] text-sm mb-3">
                <Clock3 size={16} />

                <span>Daily attendance</span>
              </div>

              <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
                <div>
                  <h2 className="text-4xl lg:text-5xl font-bold tracking-tight">
                    Keep your workday
                    <span className="block text-[var(--brand-red)]">
                      on track.
                    </span>
                  </h2>

                  <p className="mt-4 text-[var(--brand-medium-gray)] max-w-2xl">
                    Check in when you start, check out when you finish, and keep
                    your attendance history automatically updated.
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--brand-border)] bg-white px-5 py-4 min-w-[230px]">
                  <div className="text-xs text-[var(--brand-black)] uppercase tracking-wider">
                    Current time
                  </div>

                  <div className="mt-1 text-2xl font-bold">
                    {currentTime.toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: true,
                    })}
                  </div>

                  <div className="text-xs text-[var(--brand-black)] mt-1">
                    {currentTime.toLocaleDateString("en-IN", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* ALERTS */}

            {error && (
              <motion.div
                initial={{
                  opacity: 0,
                  y: -8,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                className="mb-5 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4"
              >
                <CircleAlert
                  size={19}
                  className="text-red-700 mt-0.5 shrink-0"
                />

                <div className="text-sm text-red-700">{error}</div>

                <button
                  onClick={() => setError("")}
                  className="ml-auto text-[var(--brand-black)] hover:text-[var(--brand-black)]"
                >
                  <X size={17} />
                </button>
              </motion.div>
            )}

            {success && (
              <motion.div
                initial={{
                  opacity: 0,
                  y: -8,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4"
              >
                <CheckCircle2
                  size={19}
                  className="text-emerald-700 mt-0.5 shrink-0"
                />

                <div className="text-sm text-emerald-700">{success}</div>

                <button
                  onClick={() => setSuccess("")}
                  className="ml-auto text-[var(--brand-black)] hover:text-[var(--brand-black)]"
                >
                  <X size={17} />
                </button>
              </motion.div>
            )}

            {/* TODAY + STATS */}

            <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-5">
              {/* TODAY CARD */}

              <motion.section
                initial={{
                  opacity: 0,
                  y: 12,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                className="relative overflow-hidden rounded-3xl border border-[var(--brand-border)] bg-white p-6 lg:p-8"
              >
                <div className="relative">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-[var(--brand-red)]">
                        Today
                      </div>

                      <h3 className="mt-2 text-2xl font-bold">
                        {currentTime.toLocaleDateString("en-IN", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </h3>

                      <p className="mt-2 text-sm text-[var(--brand-medium-gray)]">
                        {profile?.department || "Workspace"} •{" "}
                        {profile?.role || "Employee"}
                      </p>
                    </div>

                    <div
                      className={`px-3 py-2 rounded-xl border text-sm font-semibold ${
                        !hasCheckedIn
                          ? "border-[var(--brand-border)] bg-white text-[var(--brand-black)]"
                          : hasCheckedOut
                            ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-700"
                            : todayStatus === "Late"
                              ? "border-amber-500/20 bg-amber-500/[0.06] text-amber-700"
                              : "border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/[0.06] text-[var(--brand-red)]"
                      }`}
                    >
                      {todayStatus}
                    </div>
                  </div>

                  {/* TIME GRID */}

                  <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <TimeCard
                      icon={<Clock3 size={18} />}
                      label="Check in"
                      value={formatTime(todayRecord?.checkIn)}
                    />

                    <TimeCard
                      icon={<LogOut size={18} />}
                      label="Check out"
                      value={formatTime(todayRecord?.checkOut)}
                    />

                    <TimeCard
                      icon={<Timer size={18} />}
                      label="Working time"
                      value={formatDuration(workingHours)}
                    />
                  </div>

                  {/* ACTION */}

                  <div className="mt-6">
                    {!hasCheckedIn ? (
                      <button
                        onClick={handleCheckIn}
                        disabled={actionLoading}
                        className="w-full py-4 rounded-2xl bg-[var(--brand-red)] font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/20 hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {actionLoading ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />
                            Checking in...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={18} />
                            Check In
                          </>
                        )}
                      </button>
                    ) : !hasCheckedOut ? (
                      <button
                        onClick={handleCheckOut}
                        disabled={actionLoading}
                        className="w-full py-4 rounded-2xl border border-orange-500/20 bg-orange-500/[0.07] text-orange-700 font-semibold hover:bg-orange-500/[0.12] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {actionLoading ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />
                            Checking out...
                          </>
                        ) : (
                          <>
                            <LogOut size={18} />
                            Check Out
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="w-full py-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-700 font-semibold flex items-center justify-center gap-2">
                        <CheckCircle2 size={18} />
                        Workday completed
                      </div>
                    )}
                  </div>

                  {/* INFO */}

                  <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                    <Sparkles
                      size={18}
                      className="text-[var(--brand-red)] shrink-0 mt-0.5"
                    />

                    <p className="text-xs leading-5 text-[var(--brand-medium-gray)]">
                      Your attendance is saved automatically to the Ant Media
                      workspace. Check in once when you start work and check out
                      when you finish.
                    </p>
                  </div>
                </div>
              </motion.section>

              {/* RIGHT STATS */}

              <div className="space-y-5">
                <StatCard
                  icon={<CalendarDays size={19} />}
                  label="Attendance Days"
                  value={totalDays}
                  description="Recorded workdays"
                />

                <StatCard
                  icon={<CheckCircle2 size={19} />}
                  label="Present / Active"
                  value={presentDays}
                  description="Present and late days"
                />

                <StatCard
                  icon={<Clock3 size={19} />}
                  label="Average Hours"
                  value={averageHours.toFixed(1)}
                  description="Average recorded hours"
                  suffix="h"
                />

                <StatCard
                  icon={<CircleAlert size={19} />}
                  label="Late Days"
                  value={lateDays}
                  description="Started after 09:15 AM"
                  danger={lateDays > 0}
                />
              </div>
            </div>

            {/* HISTORY */}

            <section className="mt-6 rounded-3xl border border-[var(--brand-border)] bg-white overflow-hidden">
              <div className="p-5 lg:p-6 border-b border-[var(--brand-border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <History size={18} className="text-[var(--brand-red)]" />

                    <h3 className="text-lg font-semibold">
                      Attendance History
                    </h3>
                  </div>

                  <p className="text-sm text-[var(--brand-medium-gray)] mt-1">
                    Your personal attendance records
                  </p>
                </div>

                <div className="text-xs text-[var(--brand-black)]">
                  {history.length} record
                  {history.length === 1 ? "" : "s"}
                </div>
              </div>

              {history.length === 0 ? (
                <div className="py-20 text-center">
                  <div className="mx-auto h-14 w-14 rounded-2xl bg-[var(--brand-red)]/10 flex items-center justify-center">
                    <Clock3 size={24} className="text-[var(--brand-red)]" />
                  </div>

                  <h4 className="mt-4 font-semibold">
                    No attendance records yet
                  </h4>

                  <p className="mt-1 text-sm text-[var(--brand-medium-gray)]">
                    Your first check-in will appear here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="border-b border-[var(--brand-border)] text-left">
                        <th className="px-6 py-4 text-[10px] uppercase tracking-[0.15em] text-[var(--brand-black)] font-semibold">
                          Date
                        </th>

                        <th className="px-6 py-4 text-[10px] uppercase tracking-[0.15em] text-[var(--brand-black)] font-semibold">
                          Check In
                        </th>

                        <th className="px-6 py-4 text-[10px] uppercase tracking-[0.15em] text-[var(--brand-black)] font-semibold">
                          Check Out
                        </th>

                        <th className="px-6 py-4 text-[10px] uppercase tracking-[0.15em] text-[var(--brand-black)] font-semibold">
                          Hours
                        </th>

                        <th className="px-6 py-4 text-[10px] uppercase tracking-[0.15em] text-[var(--brand-black)] font-semibold">
                          Status
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {history.map((record, index) => {
                        const hours =
                          record.totalHours ||
                          calculateHours(record.checkIn, record.checkOut);

                        return (
                          <motion.tr
                            key={record.id}
                            initial={{
                              opacity: 0,
                            }}
                            animate={{
                              opacity: 1,
                            }}
                            transition={{
                              delay: index * 0.03,
                            }}
                            className="border-b border-[var(--brand-border)] last:border-0 hover:bg-[var(--brand-red-light)] transition"
                          >
                            <td className="px-6 py-5">
                              <div className="font-medium">
                                {formatDate(record.date)}
                              </div>
                            </td>

                            <td className="px-6 py-5 text-sm text-[var(--brand-black)]">
                              {formatTime(record.checkIn)}
                            </td>

                            <td className="px-6 py-5 text-sm text-[var(--brand-black)]">
                              {formatTime(record.checkOut)}
                            </td>

                            <td className="px-6 py-5">
                              <div className="flex items-center gap-2 text-sm">
                                <Timer
                                  size={15}
                                  className="text-[var(--brand-red)]"
                                />

                                {formatDuration(Number(hours))}
                              </div>
                            </td>

                            <td className="px-6 py-5">
                              <StatusBadge
                                status={record.status || "Present"}
                              />
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* WORKSPACE INFO */}

            <section className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <InfoCard
                number="01"
                title="Automatic tracking"
                text="Your check-in and check-out times are saved automatically."
              />

              <InfoCard
                number="02"
                title="Personal history"
                text="You can only view your own attendance records from this workspace."
              />

              <InfoCard
                number="03"
                title="Founder visibility"
                text="Your attendance becomes available to the founder for team reporting."
              />
            </section>

            {/* FOOTER */}

            <footer className="mt-10 pt-6 border-t border-[var(--brand-border)] flex flex-col sm:flex-row justify-between gap-3 text-xs text-[var(--brand-black)]">
              <span>© 2026 The Ant Media • Internal Management System</span>

              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Secure workspace
              </span>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   SIDEBAR ITEM
========================================================= */

function SidebarItem({
  icon,
  label,
  href,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={() => {
        window.location.href = href;
      }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition ${
        active
          ? "bg-[var(--brand-red)]/10 text-[var(--brand-red)] border border-[var(--brand-red-secondary)]/10"
          : "text-[var(--brand-black)] hover:text-[var(--brand-black)] hover:bg-[var(--brand-red-light)]"
      }`}
    >
      {icon}

      <span>{label}</span>

      {active && (
        <ChevronRight size={15} className="ml-auto text-[var(--brand-red)]" />
      )}
    </button>
  );
}

/* =========================================================
   TIME CARD
========================================================= */

function TimeCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
      <div className="flex items-center gap-2 text-[var(--brand-black)]">
        {icon}

        <span className="text-xs">{label}</span>
      </div>

      <div className="mt-3 text-xl font-bold">{value}</div>
    </div>
  );
}

/* =========================================================
   STAT CARD
========================================================= */

function StatCard({
  icon,
  label,
  value,
  description,
  danger = false,
  suffix = "",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  description: string;
  danger?: boolean;
  suffix?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="rounded-2xl border border-[var(--brand-border)] bg-white p-5"
    >
      <div className="h-10 w-10 rounded-xl bg-[var(--brand-red)]/10 flex items-center justify-center text-[var(--brand-red)]">
        {icon}
      </div>

      <div className="mt-5 text-sm text-[var(--brand-black)]">{label}</div>

      <div
        className={`mt-1 text-3xl font-bold ${
          danger ? "text-red-700" : "text-[var(--brand-black)]"
        }`}
      >
        {value}
        {suffix && (
          <span className="text-base text-[var(--brand-black)] ml-1">
            {suffix}
          </span>
        )}
      </div>

      <div
        className={`text-xs mt-1 ${
          danger ? "text-red-700/60" : "text-[var(--brand-black)]"
        }`}
      >
        {description}
      </div>
    </motion.div>
  );
}

/* =========================================================
   STATUS BADGE
========================================================= */

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();

  let className =
    "border-[var(--brand-border)] bg-white text-[var(--brand-black)]";

  if (normalized === "present") {
    className = "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-700";
  }

  if (normalized === "late") {
    className = "border-amber-500/20 bg-amber-500/[0.06] text-amber-700";
  }

  if (normalized === "leave") {
    className =
      "border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/[0.06] text-[var(--brand-red)]";
  }

  if (normalized === "absent") {
    className = "border-red-500/20 bg-red-500/[0.06] text-red-700";
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />

      {status}
    </span>
  );
}

/* =========================================================
   INFO CARD
========================================================= */

function InfoCard({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-5">
      <div className="text-[11px] font-semibold tracking-[0.2em] text-[var(--brand-red)]">
        {number}
      </div>

      <h3 className="mt-4 font-semibold">{title}</h3>

      <p className="mt-2 text-sm leading-6 text-[var(--brand-medium-gray)]">
        {text}
      </p>
    </div>
  );
}
