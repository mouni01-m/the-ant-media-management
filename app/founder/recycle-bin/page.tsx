"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Eye,
  History,
  Loader2,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2,
  User,
  X,
  AlertTriangle,
} from "lucide-react";

import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

type RecycleTask = {
  id: string;
  originalTaskId?: string;

  title?: string;
  description?: string;

  assignedTo?: string;
  assignedToName?: string;
  assignedToEmail?: string;

  ownerUserId?: string;
  ownerRole?: "founder" | "employee" | "intern";

  department?: string;
  priority?: string;
  status?: string;

  clientId?: string;
  clientName?: string;

  taskType?: string;

  startDate?: string;
  deadline?: string;
  deadlineTime?: string;

  googleDriveLink?: string;
  submissionNote?: string;

  deletedAt?: {
    seconds?: number;
    nanoseconds?: number;
  };

  deletedBy?: string;
  deletedByName?: string;

  deletionSource?: "founder" | "employee";
  recycleBinType?: "founder" | "employee";

  permanentlyDeleted?: boolean;

  [key: string]: unknown;
};

function formatDate(value: unknown) {
  if (!value) return "—";

  try {
    if (
      typeof value === "object" &&
      value !== null &&
      "seconds" in value
    ) {
      const seconds = Number(
        (value as { seconds?: number }).seconds ?? 0
      );

      if (!seconds) return "—";

      return new Date(seconds * 1000).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    if (typeof value === "string" || typeof value === "number") {
      const date = new Date(value);

      if (Number.isNaN(date.getTime())) return "—";

      return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  } catch {
    return "—";
  }

  return "—";
}

function getRoleLabel(role?: string) {
  if (role === "founder") return "Founder";
  if (role === "employee") return "Employee";
  if (role === "intern") return "Intern";
  return "Unknown";
}

function getRoleBadge(role?: string) {
  if (role === "founder") {
    return "border-violet-400/20 bg-violet-500/10 text-violet-300";
  }

  if (role === "employee") {
    return "border-blue-400/20 bg-blue-500/10 text-blue-300";
  }

  return "border-emerald-400/20 bg-emerald-500/10 text-emerald-300";
}

export default function FounderRecycleBinPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isFounder, setIsFounder] = useState(false);

  const [tasks, setTasks] = useState<RecycleTask[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<
    "all" | "founder" | "employee"
  >("all");

  const [selectedTask, setSelectedTask] =
    useState<RecycleTask | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(
    null
  );

  const [error, setError] = useState("");

  /* -----------------------------------------------------------
     AUTH + FOUNDER CHECK
  ----------------------------------------------------------- */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      setCurrentUser(user);

      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          setIsFounder(false);
          setError("User profile was not found.");
          setCheckingAuth(false);
          return;
        }

        const userData = userSnap.data();

        if (userData.role !== "founder") {
          setIsFounder(false);
          setError("Founder access is required to open the Recycle Bin.");
          setCheckingAuth(false);
          return;
        }

        setIsFounder(true);
      } catch (err) {
        console.error(err);
        setError("Unable to verify founder access.");
      } finally {
        setCheckingAuth(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  /* -----------------------------------------------------------
     REALTIME RECYCLE BIN
  ----------------------------------------------------------- */

  useEffect(() => {
    if (!isFounder) return;

    setLoading(true);

    const recycleRef = collection(db, "recycleBinTasks");

    const unsubscribe = onSnapshot(
      recycleRef,
      (snapshot) => {
        const loaded: RecycleTask[] = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as RecycleTask[];

        loaded.sort((a, b) => {
          const getTime = (value: unknown) => {
            if (
              typeof value === "object" &&
              value !== null &&
              "seconds" in value
            ) {
              return Number(
                (value as { seconds?: number }).seconds ?? 0
              );
            }

            return 0;
          };

          return (
            getTime(b.deletedAt) -
            getTime(a.deletedAt)
          );
        });

        setTasks(loaded);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError(
          "Unable to load Recycle Bin. Check Firestore permissions."
        );
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isFounder]);

  /* -----------------------------------------------------------
     FILTERING
  ----------------------------------------------------------- */

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesFilter =
        filter === "all" ||
        task.recycleBinType === filter ||
        task.ownerRole === filter;

      if (!matchesFilter) return false;

      if (!query) return true;

      return (
        task.title?.toLowerCase().includes(query) ||
        task.assignedToName?.toLowerCase().includes(query) ||
        task.deletedByName?.toLowerCase().includes(query) ||
        task.clientName?.toLowerCase().includes(query) ||
        task.department?.toLowerCase().includes(query) ||
        task.status?.toLowerCase().includes(query)
      );
    });
  }, [tasks, filter, search]);

  const founderDeletedCount = tasks.filter(
    (task) =>
      task.recycleBinType === "founder" ||
      task.ownerRole === "founder"
  ).length;

  const employeeDeletedCount = tasks.filter(
    (task) =>
      task.recycleBinType === "employee" ||
      task.ownerRole === "employee"
  ).length;

  /* -----------------------------------------------------------
     RESTORE
  ----------------------------------------------------------- */

  async function restoreTask(task: RecycleTask) {
    if (!currentUser) return;

    const originalTaskId = task.originalTaskId;

    if (!originalTaskId) {
      alert("This deleted task does not contain its original task ID.");
      return;
    }

    const confirmed = window.confirm(
      `Restore "${task.title || "this task"}" back to the Tasks list?`
    );

    if (!confirmed) return;

    setActionLoading(`restore-${task.id}`);
    setError("");

    try {
      const {
        id,
        originalTaskId: _originalTaskId,
        deletedAt: _deletedAt,
        deletedBy: _deletedBy,
        deletedByName: _deletedByName,
        deletionSource: _deletionSource,
        recycleBinType: _recycleBinType,
        permanentlyDeleted: _permanentlyDeleted,
        ...originalTaskData
      } = task;

      await setDoc(doc(db, "tasks", originalTaskId), {
        ...originalTaskData,

        id: originalTaskId,

        restoredAt: serverTimestamp(),
        restoredBy: currentUser.uid,
        restoredByName:
          currentUser.displayName || currentUser.email || "Founder",

        restoredFromRecycleBin: true,
      });

      await deleteDoc(doc(db, "recycleBinTasks", task.id));

      setSelectedTask(null);
    } catch (err) {
      console.error(err);
      setError("Failed to restore the task.");
    } finally {
      setActionLoading(null);
    }
  }

  /* -----------------------------------------------------------
     PERMANENT DELETE
  ----------------------------------------------------------- */

  async function permanentlyDeleteTask(task: RecycleTask) {
    const confirmed = window.confirm(
      `PERMANENTLY DELETE "${task.title || "this task"}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    const secondConfirmation = window.confirm(
      "Are you absolutely sure? The deleted task will be removed from the Recycle Bin permanently."
    );

    if (!secondConfirmation) return;

    setActionLoading(`delete-${task.id}`);
    setError("");

    try {
      await deleteDoc(doc(db, "recycleBinTasks", task.id));

      setSelectedTask(null);
    } catch (err) {
      console.error(err);
      setError("Failed to permanently delete the task.");
    } finally {
      setActionLoading(null);
    }
  }

  /* -----------------------------------------------------------
     AUTH LOADING
  ----------------------------------------------------------- */

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#07070b] text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-white/70">
          <Loader2 className="h-5 w-5 animate-spin" />
          Checking founder access...
        </div>
      </div>
    );
  }

  /* -----------------------------------------------------------
     ACCESS DENIED
  ----------------------------------------------------------- */

  if (!isFounder) {
    return (
      <div className="min-h-screen bg-[#07070b] text-white flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/10">
            <ShieldCheck className="h-8 w-8 text-red-300" />
          </div>

          <h1 className="text-2xl font-semibold">
            Founder Access Required
          </h1>

          <p className="mt-3 text-sm leading-6 text-white/50">
            Only the founder can access and manage the Recycle Bin.
          </p>

          {error && (
            <p className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            onClick={() => router.push("/")}
            className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  /* -----------------------------------------------------------
     MAIN UI
  ----------------------------------------------------------- */

  return (
    <main className="min-h-screen bg-[#07070b] text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
        <div className="absolute -right-32 top-40 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        {/* HEADER */}
        <header className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <button
              onClick={() => router.push("/founder")}
              className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/70 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              title="Back to Founder Dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15">
                  <Trash2 className="h-4 w-4 text-violet-300" />
                </div>

                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300/80">
                  Founder Control
                </span>
              </div>

              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Recycle Bin
              </h1>

              <p className="mt-1 text-sm text-white/45">
                Recover deleted tasks or permanently remove them.
              </p>
            </div>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </header>

        {/* ERROR */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-300">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STATS */}
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/45">
                Total Deleted
              </span>

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06]">
                <Trash2 className="h-4 w-4 text-white/60" />
              </div>
            </div>

            <div className="mt-3 text-3xl font-semibold">
              {tasks.length}
            </div>

            <p className="mt-1 text-xs text-white/35">
              Items currently in recycle bin
            </p>
          </div>

          <div className="rounded-2xl border border-violet-400/10 bg-violet-500/[0.045] p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/45">
                Founder Deleted
              </span>

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10">
                <ShieldCheck className="h-4 w-4 text-violet-300" />
              </div>
            </div>

            <div className="mt-3 text-3xl font-semibold">
              {founderDeletedCount}
            </div>

            <p className="mt-1 text-xs text-white/35">
              Deleted directly by founder
            </p>
          </div>

          <div className="rounded-2xl border border-blue-400/10 bg-blue-500/[0.045] p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/45">
                Employee Deleted
              </span>

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
                <User className="h-4 w-4 text-blue-300" />
              </div>
            </div>

            <div className="mt-3 text-3xl font-semibold">
              {employeeDeletedCount}
            </div>

            <p className="mt-1 text-xs text-white/35">
              Deleted through employee workflow
            </p>
          </div>
        </section>

        {/* CONTROLS */}
        <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* SEARCH */}
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search deleted tasks..."
                className="h-11 w-full rounded-xl border border-white/10 bg-black/20 pl-11 pr-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-violet-400/40"
              />
            </div>

            {/* FILTERS */}
            <div className="flex flex-wrap gap-2">
              {[
                ["all", "All"],
                ["founder", "Founder Deleted"],
                ["employee", "Employee Deleted"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() =>
                    setFilter(
                      value as "all" | "founder" | "employee"
                    )
                  }
                  className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                    filter === value
                      ? "bg-white text-black"
                      : "border border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* TASK LIST */}
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="font-semibold">Deleted Tasks</h2>
              <p className="mt-0.5 text-xs text-white/35">
                {filteredTasks.length} item
                {filteredTasks.length === 1 ? "" : "s"} shown
              </p>
            </div>

            <History className="h-5 w-5 text-white/25" />
          </div>

          {loading ? (
            <div className="flex min-h-[300px] items-center justify-center">
              <div className="flex items-center gap-3 text-sm text-white/50">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading deleted tasks...
              </div>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <CheckCircle2 className="h-7 w-7 text-emerald-300/70" />
              </div>

              <h3 className="mt-5 text-lg font-semibold">
                Recycle Bin is empty
              </h3>

              <p className="mt-2 max-w-md text-sm leading-6 text-white/35">
                Deleted tasks will appear here. You can restore them
                or permanently delete them from this page.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.07]">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className="group flex flex-col gap-4 px-5 py-5 transition hover:bg-white/[0.025] xl:flex-row xl:items-center xl:justify-between"
                >
                  {/* TASK INFO */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-medium text-white">
                        {task.title || "Untitled Task"}
                      </h3>

                      <span
                        className={`rounded-lg border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getRoleBadge(
                          task.ownerRole
                        )}`}
                      >
                        {getRoleLabel(task.ownerRole)}
                      </span>

                      {task.status && (
                        <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                          {task.status}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/35">
                      <span>
                        Assigned:{" "}
                        <span className="text-white/55">
                          {task.assignedToName || "Unassigned"}
                        </span>
                      </span>

                      {task.department && (
                        <span>
                          Department:{" "}
                          <span className="text-white/55">
                            {task.department}
                          </span>
                        </span>
                      )}

                      {task.clientName && (
                        <span>
                          Client:{" "}
                          <span className="text-white/55">
                            {task.clientName}
                          </span>
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/30">
                      <Clock3 className="h-3.5 w-3.5" />

                      <span>
                        Deleted {formatDate(task.deletedAt)}
                      </span>

                      <span className="text-white/15">•</span>

                      <span>
                        By{" "}
                        <span className="text-white/45">
                          {task.deletedByName || "Unknown"}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* ACTIONS */}
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      onClick={() => setSelectedTask(task)}
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs font-medium text-white/65 transition hover:bg-white/[0.08] hover:text-white"
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </button>

                    <button
                      onClick={() => restoreTask(task)}
                      disabled={
                        actionLoading === `restore-${task.id}`
                      }
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/15 disabled:opacity-50"
                    >
                      {actionLoading === `restore-${task.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-4 w-4" />
                      )}
                      Restore
                    </button>

                    <button
                      onClick={() =>
                        permanentlyDeleteTask(task)
                      }
                      disabled={
                        actionLoading === `delete-${task.id}`
                      }
                      className="inline-flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-300 transition hover:bg-red-500/15 disabled:opacity-50"
                    >
                      {actionLoading === `delete-${task.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* -------------------------------------------------------
         VIEW MODAL
      ------------------------------------------------------- */}

      {selectedTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#101016] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* MODAL HEADER */}
            <div className="flex items-start justify-between border-b border-white/10 px-6 py-5">
              <div>
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-violet-300" />

                  <span className="text-xs font-semibold uppercase tracking-[0.15em] text-violet-300/70">
                    Deleted Task
                  </span>
                </div>

                <h2 className="mt-2 text-xl font-semibold">
                  {selectedTask.title || "Untitled Task"}
                </h2>
              </div>

              <button
                onClick={() => setSelectedTask(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-white/50 transition hover:bg-white/[0.1] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* MODAL CONTENT */}
            <div className="max-h-[65vh] overflow-y-auto px-6 py-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-white/30">
                    Assigned To
                  </p>

                  <p className="mt-1 text-sm font-medium text-white/80">
                    {selectedTask.assignedToName ||
                      selectedTask.assignedTo ||
                      "Unassigned"}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-white/30">
                    Role
                  </p>

                  <p className="mt-1 text-sm font-medium text-white/80">
                    {getRoleLabel(selectedTask.ownerRole)}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-white/30">
                    Department
                  </p>

                  <p className="mt-1 text-sm font-medium text-white/80">
                    {selectedTask.department || "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-white/30">
                    Client
                  </p>

                  <p className="mt-1 text-sm font-medium text-white/80">
                    {selectedTask.clientName || "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-white/30">
                    Priority
                  </p>

                  <p className="mt-1 text-sm font-medium text-white/80">
                    {selectedTask.priority || "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-white/30">
                    Original Status
                  </p>

                  <p className="mt-1 text-sm font-medium text-white/80">
                    {selectedTask.status || "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-white/30">
                    Start Date
                  </p>

                  <p className="mt-1 text-sm font-medium text-white/80">
                    {selectedTask.startDate || "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-white/30">
                    Deadline
                  </p>

                  <p className="mt-1 text-sm font-medium text-white/80">
                    {selectedTask.deadline || "—"}
                    {selectedTask.deadlineTime
                      ? ` • ${selectedTask.deadlineTime}`
                      : ""}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:col-span-2">
                  <p className="text-xs text-white/30">
                    Deleted By
                  </p>

                  <p className="mt-1 text-sm font-medium text-white/80">
                    {selectedTask.deletedByName ||
                      selectedTask.deletedBy ||
                      "Unknown"}
                  </p>

                  <p className="mt-1 text-xs text-white/30">
                    {formatDate(selectedTask.deletedAt)}
                  </p>
                </div>
              </div>

              {/* DESCRIPTION */}
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/30">
                  Description
                </p>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/60">
                  {selectedTask.description || "No description provided."}
                </p>
              </div>

              {/* SUBMISSION NOTE */}
              {selectedTask.submissionNote && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/30">
                    Submission Note
                  </p>

                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/60">
                    {selectedTask.submissionNote}
                  </p>
                </div>
              )}

              {/* DRIVE LINK */}
              {typeof selectedTask.googleDriveLink === "string" &&
                selectedTask.googleDriveLink && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/30">
                      Google Drive
                    </p>

                    <a
                      href={selectedTask.googleDriveLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 block break-all text-sm text-violet-300 hover:text-violet-200"
                    >
                      {selectedTask.googleDriveLink}
                    </a>
                  </div>
                )}
            </div>

            {/* MODAL ACTIONS */}
            <div className="flex flex-col-reverse gap-3 border-t border-white/10 px-6 py-5 sm:flex-row sm:justify-end">
              <button
                onClick={() => setSelectedTask(null)}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-white/60 transition hover:bg-white/[0.08] hover:text-white"
              >
                Close
              </button>

              <button
                onClick={() => restoreTask(selectedTask)}
                disabled={
                  actionLoading ===
                  `restore-${selectedTask.id}`
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {actionLoading ===
                `restore-${selectedTask.id}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                Restore Task
              </button>

              <button
                onClick={() =>
                  permanentlyDeleteTask(selectedTask)
                }
                disabled={
                  actionLoading ===
                  `delete-${selectedTask.id}`
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500/15 px-5 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
              >
                {actionLoading ===
                `delete-${selectedTask.id}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}