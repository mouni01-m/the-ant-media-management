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
  currentTime = new Date()
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

  const [todayRecord, setTodayRecord] =
    useState<AttendanceRecord | null>(null);

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
    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (!currentUser) {
          window.location.href = "/";
          return;
        }

        setUser(currentUser);

        try {
          const profileRef = doc(
            db,
            "users",
            currentUser.uid
          );

          const profileSnap = await getDoc(profileRef);

          if (!profileSnap.exists()) {
            await signOut(auth);
            window.location.href = "/";
            return;
          }

          const profileData =
            profileSnap.data() as Profile;

          if (
            profileData.active !== true ||
            !["employee", "intern"].includes(
              profileData.role || ""
            )
          ) {
            await signOut(auth);
            window.location.href = "/";
            return;
          }

          setProfile(profileData);

          await loadAttendance(currentUser.uid);
        } catch (err) {
          console.error(
            "EMPLOYEE ATTENDANCE LOAD ERROR:",
            err
          );

          setError(
            "Unable to load attendance. Please refresh and try again."
          );
        } finally {
          setLoading(false);
        }
      }
    );

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
      where("date", "==", today)
    );

    const todaySnapshot = await getDocs(todayQuery);

    if (!todaySnapshot.empty) {
      const todayDoc = todaySnapshot.docs[0];

      setTodayRecord({
        id: todayDoc.id,
        ...(todayDoc.data() as Omit<
          AttendanceRecord,
          "id"
        >),
      });
    } else {
      setTodayRecord(null);
    }

    /*
     * History
     */
    const attendanceQuery = query(
      collection(db, "attendance"),
      where("userId", "==", uid)
    );

    const snapshot = await getDocs(attendanceQuery);

    const records: AttendanceRecord[] =
      snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<
          AttendanceRecord,
          "id"
        >),
      }));

    records.sort((a, b) =>
      (b.date || "").localeCompare(a.date || "")
    );

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
        where("date", "==", dateKey)
      );

      const existingSnapshot = await getDocs(
        existingQuery
      );

      if (!existingSnapshot.empty) {
        const existingDoc = existingSnapshot.docs[0];
        const existing =
          existingDoc.data() as AttendanceRecord;

        if (existing.checkIn) {
          setError(
            "You have already checked in today."
          );

          setTodayRecord({
            ...existing,
            id: existingDoc.id,
          });

          return;
        }
      }

      const attendanceRef = doc(
        db,
        "attendance",
        `${user.uid}_${dateKey}`
      );

      const status = getAttendanceStatus(now);

      const checkInISO = now.toISOString();

      const record = {
        userId: user.uid,

        userName:
          profile.name ||
          user.displayName ||
          user.email?.split("@")[0] ||
          "Employee",

        userEmail:
          profile.email ||
          user.email ||
          "",

        role: profile.role || "employee",

        department:
          profile.department || "development",

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

      setSuccess(
        `Checked in successfully at ${formatTime(
          checkInISO
        )}.`
      );

      await loadAttendance(user.uid);
    } catch (err) {
      console.error(
        "CHECK IN ERROR:",
        err
      );

      setError(
        "Check-in failed. Please try again."
      );
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
        setError(
          "You need to check in before checking out."
        );

        return;
      }

      if (todayRecord.checkOut) {
        setError(
          "You have already checked out today."
        );

        return;
      }

      const now = new Date();

      const hours = calculateHours(
        todayRecord.checkIn,
        undefined,
        now
      );

      const attendanceRef = doc(
        db,
        "attendance",
        todayRecord.id
      );

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
        `Checked out successfully at ${formatTime(
          now.toISOString()
        )}.`
      );

      await loadAttendance(user.uid);
    } catch (err) {
      console.error(
        "CHECK OUT ERROR:",
        err
      );

      setError(
        "Check-out failed. Please try again."
      );
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
      currentTime
    );
  }, [todayRecord, currentTime]);

  const hasCheckedIn = Boolean(
    todayRecord?.checkIn
  );

  const hasCheckedOut = Boolean(
    todayRecord?.checkOut
  );

  const todayStatus =
    todayRecord?.status || "Not Checked In";

  const totalDays = history.length;

  const presentDays = history.filter(
    (item) =>
      item.status === "Present" ||
      item.status === "Late"
  ).length;

  const lateDays = history.filter(
    (item) => item.status === "Late"
  ).length;

  const averageHours =
    history.length > 0
      ? history.reduce(
          (sum, item) =>
            sum + Number(item.totalHours || 0),
          0
        ) / history.length
      : 0;

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050507] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-5 h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center animate-pulse">
            <Sparkles size={22} />
          </div>

          <p className="text-white/50">
            Loading attendance...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050507] text-white">
      {/* BACKGROUND */}

      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-violet-600/10 blur-[120px]" />

        <div className="absolute top-1/2 -right-40 h-96 w-96 rounded-full bg-blue-600/10 blur-[120px]" />

        <div className="absolute bottom-0 left-1/2 h-80 w-80 rounded-full bg-emerald-600/5 blur-[120px]" />
      </div>

      <div className="relative flex min-h-screen">
        {/* SIDEBAR */}

        <aside
          className={`fixed z-50 inset-y-0 left-0 w-[270px] border-r border-white/[0.06] bg-[#08080c]/95 backdrop-blur-xl transform transition-transform duration-300 lg:translate-x-0 ${
            menuOpen
              ? "translate-x-0"
              : "-translate-x-full"
          }`}
        >
          <div className="h-full flex flex-col">
            {/* BRAND */}

            <div className="h-[82px] px-6 flex items-center border-b border-white/[0.06]">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-600/20">
                <span className="text-xl">
                  🐜
                </span>
              </div>

              <div className="ml-3">
                <div className="font-bold tracking-tight">
                  THE ANT MEDIA
                </div>

                <div className="text-[11px] text-white/35">
                  Internal Management
                </div>
              </div>
            </div>

            {/* PROFILE */}

            <div className="p-4">
              <div className="rounded-2xl border border-violet-500/15 bg-violet-500/[0.07] p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-violet-500/15 flex items-center justify-center text-violet-300 font-semibold">
                    {initials}
                  </div>

                  <div className="min-w-0">
                    <div className="font-semibold truncate">
                      {displayName}
                    </div>

                    <div className="text-xs text-white/40 capitalize">
                      {profile?.role || "Employee"}
                    </div>
                  </div>

                  <span className="ml-auto h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50" />
                </div>
              </div>
            </div>

            {/* NAVIGATION */}

            <nav className="px-3 space-y-1">
              <div className="px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/25">
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

            <div className="mt-auto p-4 border-t border-white/[0.06]">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/45 hover:text-white hover:bg-white/[0.05] transition"
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

          <header className="sticky top-0 z-30 h-[82px] border-b border-white/[0.06] bg-[#050507]/80 backdrop-blur-xl">
            <div className="h-full px-5 lg:px-8 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() =>
                    setMenuOpen(true)
                  }
                  className="lg:hidden h-10 w-10 rounded-xl border border-white/10 flex items-center justify-center"
                >
                  <Menu size={19} />
                </button>

                <div>
                  <div className="text-xs text-white/30">
                    Employee / Workspace
                  </div>

                  <h1 className="text-xl font-semibold">
                    Attendance
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-3 px-2">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center font-semibold">
                    {initials}
                  </div>

                  <div className="hidden md:block">
                    <div className="text-sm font-semibold">
                      {displayName}
                    </div>

                    <div className="text-[11px] text-white/35 capitalize">
                      {profile?.department ||
                        "Workspace"}
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
              <div className="flex items-center gap-2 text-violet-300 text-sm mb-3">
                <Clock3 size={16} />

                <span>
                  Daily attendance
                </span>
              </div>

              <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
                <div>
                  <h2 className="text-4xl lg:text-5xl font-bold tracking-tight">
                    Keep your workday
                    <span className="block bg-gradient-to-r from-violet-300 via-white to-blue-300 bg-clip-text text-transparent">
                      on track.
                    </span>
                  </h2>

                  <p className="mt-4 text-white/40 max-w-2xl">
                    Check in when you start, check out
                    when you finish, and keep your
                    attendance history automatically
                    updated.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-5 py-4 min-w-[230px]">
                  <div className="text-xs text-white/30 uppercase tracking-wider">
                    Current time
                  </div>

                  <div className="mt-1 text-2xl font-bold">
                    {currentTime.toLocaleTimeString(
                      "en-IN",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: true,
                      }
                    )}
                  </div>

                  <div className="text-xs text-white/35 mt-1">
                    {currentTime.toLocaleDateString(
                      "en-IN",
                      {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      }
                    )}
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
                  className="text-red-300 mt-0.5 shrink-0"
                />

                <div className="text-sm text-red-200">
                  {error}
                </div>

                <button
                  onClick={() => setError("")}
                  className="ml-auto text-white/30 hover:text-white"
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
                  className="text-emerald-300 mt-0.5 shrink-0"
                />

                <div className="text-sm text-emerald-200">
                  {success}
                </div>

                <button
                  onClick={() =>
                    setSuccess("")
                  }
                  className="ml-auto text-white/30 hover:text-white"
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
                className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.025] p-6 lg:p-8"
              >
                <div className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-violet-600/10 blur-[80px]" />

                <div className="relative">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-violet-300/70">
                        Today
                      </div>

                      <h3 className="mt-2 text-2xl font-bold">
                        {currentTime.toLocaleDateString(
                          "en-IN",
                          {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          }
                        )}
                      </h3>

                      <p className="mt-2 text-sm text-white/35">
                        {profile?.department ||
                          "Workspace"}{" "}
                        •{" "}
                        {profile?.role ||
                          "Employee"}
                      </p>
                    </div>

                    <div
                      className={`px-3 py-2 rounded-xl border text-sm font-semibold ${
                        !hasCheckedIn
                          ? "border-white/10 bg-white/[0.03] text-white/50"
                          : hasCheckedOut
                          ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300"
                          : todayStatus === "Late"
                          ? "border-amber-500/20 bg-amber-500/[0.06] text-amber-300"
                          : "border-blue-500/20 bg-blue-500/[0.06] text-blue-300"
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
                      value={formatTime(
                        todayRecord?.checkIn
                      )}
                    />

                    <TimeCard
                      icon={<LogOut size={18} />}
                      label="Check out"
                      value={formatTime(
                        todayRecord?.checkOut
                      )}
                    />

                    <TimeCard
                      icon={<Timer size={18} />}
                      label="Working time"
                      value={formatDuration(
                        workingHours
                      )}
                    />
                  </div>

                  {/* ACTION */}

                  <div className="mt-6">
                    {!hasCheckedIn ? (
                      <button
                        onClick={handleCheckIn}
                        disabled={actionLoading}
                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 font-semibold shadow-lg shadow-violet-600/20 hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {actionLoading ? (
                          <>
                            <Loader2
                              size={18}
                              className="animate-spin"
                            />

                            Checking in...
                          </>
                        ) : (
                          <>
                            <CheckCircle2
                              size={18}
                            />

                            Check In
                          </>
                        )}
                      </button>
                    ) : !hasCheckedOut ? (
                      <button
                        onClick={handleCheckOut}
                        disabled={actionLoading}
                        className="w-full py-4 rounded-2xl border border-orange-500/20 bg-orange-500/[0.07] text-orange-200 font-semibold hover:bg-orange-500/[0.12] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {actionLoading ? (
                          <>
                            <Loader2
                              size={18}
                              className="animate-spin"
                            />

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
                      <div className="w-full py-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300 font-semibold flex items-center justify-center gap-2">
                        <CheckCircle2
                          size={18}
                        />

                        Workday completed
                      </div>
                    )}
                  </div>

                  {/* INFO */}

                  <div className="mt-5 flex items-start gap-3 rounded-2xl border border-white/[0.05] bg-black/10 p-4">
                    <Sparkles
                      size={18}
                      className="text-violet-300 shrink-0 mt-0.5"
                    />

                    <p className="text-xs leading-5 text-white/35">
                      Your attendance is saved
                      automatically to the Ant Media
                      workspace. Check in once when you
                      start work and check out when you
                      finish.
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
                  value={averageHours.toFixed(
                    1
                  )}
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

            <section className="mt-6 rounded-3xl border border-white/[0.07] bg-white/[0.018] overflow-hidden">
              <div className="p-5 lg:p-6 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <History
                      size={18}
                      className="text-violet-300"
                    />

                    <h3 className="text-lg font-semibold">
                      Attendance History
                    </h3>
                  </div>

                  <p className="text-sm text-white/35 mt-1">
                    Your personal attendance records
                  </p>
                </div>

                <div className="text-xs text-white/30">
                  {history.length} record
                  {history.length === 1
                    ? ""
                    : "s"}
                </div>
              </div>

              {history.length === 0 ? (
                <div className="py-20 text-center">
                  <div className="mx-auto h-14 w-14 rounded-2xl bg-violet-500/10 flex items-center justify-center">
                    <Clock3
                      size={24}
                      className="text-violet-300"
                    />
                  </div>

                  <h4 className="mt-4 font-semibold">
                    No attendance records yet
                  </h4>

                  <p className="mt-1 text-sm text-white/35">
                    Your first check-in will appear
                    here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="border-b border-white/[0.05] text-left">
                        <th className="px-6 py-4 text-[10px] uppercase tracking-[0.15em] text-white/25 font-semibold">
                          Date
                        </th>

                        <th className="px-6 py-4 text-[10px] uppercase tracking-[0.15em] text-white/25 font-semibold">
                          Check In
                        </th>

                        <th className="px-6 py-4 text-[10px] uppercase tracking-[0.15em] text-white/25 font-semibold">
                          Check Out
                        </th>

                        <th className="px-6 py-4 text-[10px] uppercase tracking-[0.15em] text-white/25 font-semibold">
                          Hours
                        </th>

                        <th className="px-6 py-4 text-[10px] uppercase tracking-[0.15em] text-white/25 font-semibold">
                          Status
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {history.map(
                        (record, index) => {
                          const hours =
                            record.totalHours ||
                            calculateHours(
                              record.checkIn,
                              record.checkOut
                            );

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
                                delay:
                                  index * 0.03,
                              }}
                              className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.015] transition"
                            >
                              <td className="px-6 py-5">
                                <div className="font-medium">
                                  {formatDate(
                                    record.date
                                  )}
                                </div>
                              </td>

                              <td className="px-6 py-5 text-sm text-white/55">
                                {formatTime(
                                  record.checkIn
                                )}
                              </td>

                              <td className="px-6 py-5 text-sm text-white/55">
                                {formatTime(
                                  record.checkOut
                                )}
                              </td>

                              <td className="px-6 py-5">
                                <div className="flex items-center gap-2 text-sm">
                                  <Timer
                                    size={15}
                                    className="text-violet-300"
                                  />

                                  {formatDuration(
                                    Number(hours)
                                  )}
                                </div>
                              </td>

                              <td className="px-6 py-5">
                                <StatusBadge
                                  status={
                                    record.status ||
                                    "Present"
                                  }
                                />
                              </td>
                            </motion.tr>
                          );
                        }
                      )}
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

            <footer className="mt-10 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row justify-between gap-3 text-xs text-white/25">
              <span>
                © 2026 The Ant Media • Internal
                Management System
              </span>

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
          ? "bg-violet-500/10 text-violet-300 border border-violet-500/10"
          : "text-white/40 hover:text-white hover:bg-white/[0.04]"
      }`}
    >
      {icon}

      <span>{label}</span>

      {active && (
        <ChevronRight
          size={15}
          className="ml-auto text-violet-300/60"
        />
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
    <div className="rounded-2xl border border-white/[0.06] bg-black/10 p-4">
      <div className="flex items-center gap-2 text-white/30">
        {icon}

        <span className="text-xs">
          {label}
        </span>
      </div>

      <div className="mt-3 text-xl font-bold">
        {value}
      </div>
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
      className="rounded-2xl border border-white/[0.07] bg-white/[0.018] p-5"
    >
      <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-300">
        {icon}
      </div>

      <div className="mt-5 text-sm text-white/35">
        {label}
      </div>

      <div
        className={`mt-1 text-3xl font-bold ${
          danger
            ? "text-red-300"
            : "text-white"
        }`}
      >
        {value}
        {suffix && (
          <span className="text-base text-white/30 ml-1">
            {suffix}
          </span>
        )}
      </div>

      <div
        className={`text-xs mt-1 ${
          danger
            ? "text-red-300/60"
            : "text-white/25"
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

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const normalized =
    status.toLowerCase();

  let className =
    "border-white/10 bg-white/[0.03] text-white/50";

  if (normalized === "present") {
    className =
      "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300";
  }

  if (normalized === "late") {
    className =
      "border-amber-500/20 bg-amber-500/[0.06] text-amber-300";
  }

  if (normalized === "leave") {
    className =
      "border-blue-500/20 bg-blue-500/[0.06] text-blue-300";
  }

  if (normalized === "absent") {
    className =
      "border-red-500/20 bg-red-500/[0.06] text-red-300";
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
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.018] p-5">
      <div className="text-[11px] font-semibold tracking-[0.2em] text-violet-300/70">
        {number}
      </div>

      <h3 className="mt-4 font-semibold">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-white/35">
        {text}
      </p>
    </div>
  );
}