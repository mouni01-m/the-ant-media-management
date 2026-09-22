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
    if (typeof value === "object" && value !== null && "seconds" in value) {
      const seconds = Number((value as { seconds?: number }).seconds ?? 0);

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
    return "border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/10 text-[var(--brand-red)]";
  }

  if (role === "employee") {
    return "border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/10 text-[var(--brand-red)]";
  }

  return "border-emerald-400/20 bg-emerald-500/10 text-emerald-700";
}

export default function FounderRecycleBinPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isFounder, setIsFounder] = useState(false);

  const [tasks, setTasks] = useState<RecycleTask[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "founder" | "employee">("all");

  const [selectedTask, setSelectedTask] = useState<RecycleTask | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
              return Number((value as { seconds?: number }).seconds ?? 0);
            }

            return 0;
          };

          return getTime(b.deletedAt) - getTime(a.deletedAt);
        });

        setTasks(loaded);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError("Unable to load Recycle Bin. Check Firestore permissions.");
        setLoading(false);
      },
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
    (task) => task.recycleBinType === "founder" || task.ownerRole === "founder",
  ).length;

  const employeeDeletedCount = tasks.filter(
    (task) =>
      task.recycleBinType === "employee" || task.ownerRole === "employee",
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
      `Restore "${task.title || "this task"}" back to the Tasks list?`,
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
      `PERMANENTLY DELETE "${task.title || "this task"}"?\n\nThis action cannot be undone.`,
    );

    if (!confirmed) return;

    const secondConfirmation = window.confirm(
      "Are you absolutely sure? The deleted task will be removed from the Recycle Bin permanently.",
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
      <div className="min-h-screen bg-white text-[var(--brand-black)] flex items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--brand-black)]">
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
      <div className="min-h-screen bg-white text-[var(--brand-black)] flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-3xl border border-[var(--brand-border)] bg-white p-8 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/10">
            <ShieldCheck className="h-8 w-8 text-red-700" />
          </div>

          <h1 className="text-2xl font-semibold">Founder Access Required</h1>

          <p className="mt-3 text-sm leading-6 text-[var(--brand-medium-gray)]">
            Only the founder can access and manage the Recycle Bin.
          </p>

          {error && (
            <p className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            onClick={() => router.push("/")}
            className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-[var(--brand-red-light)]"
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
    <main className="min-h-screen bg-white text-[var(--brand-black)]">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden"></div>

      <div className="relative mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        {/* HEADER */}
        <header className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <button
              onClick={() => router.push("/founder")}
              className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-black)] transition hover:border-[var(--brand-border)] hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
              title="Back to Founder Dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand-red)]/15">
                  <Trash2 className="h-4 w-4 text-[var(--brand-red)]" />
                </div>

                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-red)]">
                  Founder Control
                </span>
              </div>

              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Recycle Bin
              </h1>

              <p className="mt-1 text-sm text-[var(--brand-medium-gray)]">
                Recover deleted tasks or permanently remove them.
              </p>
            </div>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </header>

        {/* ERROR */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STATS */}
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-5 ">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--brand-black)]">
                Total Deleted
              </span>

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white">
                <Trash2 className="h-4 w-4 text-[var(--brand-black)]" />
              </div>
            </div>

            <div className="mt-3 text-3xl font-semibold">{tasks.length}</div>

            <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
              Items currently in recycle bin
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--brand-red-secondary)]/10 bg-[var(--brand-red)]/[0.045] p-5 ">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--brand-black)]">
                Founder Deleted
              </span>

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-red)]/10">
                <ShieldCheck className="h-4 w-4 text-[var(--brand-red)]" />
              </div>
            </div>

            <div className="mt-3 text-3xl font-semibold">
              {founderDeletedCount}
            </div>

            <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
              Deleted directly by founder
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--brand-red-secondary)]/10 bg-[var(--brand-red)]/[0.045] p-5 ">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--brand-black)]">
                Employee Deleted
              </span>

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-red)]/10">
                <User className="h-4 w-4 text-[var(--brand-red)]" />
              </div>
            </div>

            <div className="mt-3 text-3xl font-semibold">
              {employeeDeletedCount}
            </div>

            <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
              Deleted through employee workflow
            </p>
          </div>
        </section>

        {/* CONTROLS */}
        <section className="mb-6 rounded-2xl border border-[var(--brand-border)] bg-white p-4 ">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* SEARCH */}
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--brand-black)]" />

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search deleted tasks..."
                className="h-11 w-full rounded-xl border border-[var(--brand-border)] bg-white pl-11 pr-4 text-sm text-[var(--brand-black)] outline-none placeholder:text-[var(--brand-black)] focus:border-[var(--brand-red-secondary)]/40"
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
                    setFilter(value as "all" | "founder" | "employee")
                  }
                  className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                    filter === value
                      ? "bg-white text-black"
                      : "border border-[var(--brand-border)] bg-white text-[var(--brand-black)] hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* TASK LIST */}
        <section className="overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-white ">
          <div className="flex items-center justify-between border-b border-[var(--brand-border)] px-5 py-4">
            <div>
              <h2 className="font-semibold">Deleted Tasks</h2>
              <p className="mt-0.5 text-xs text-[var(--brand-medium-gray)]">
                {filteredTasks.length} item
                {filteredTasks.length === 1 ? "" : "s"} shown
              </p>
            </div>

            <History className="h-5 w-5 text-[var(--brand-black)]" />
          </div>

          {loading ? (
            <div className="flex min-h-[300px] items-center justify-center">
              <div className="flex items-center gap-3 text-sm text-[var(--brand-black)]">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading deleted tasks...
              </div>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--brand-border)] bg-white">
                <CheckCircle2 className="h-7 w-7 text-emerald-700/70" />
              </div>

              <h3 className="mt-5 text-lg font-semibold">
                Recycle Bin is empty
              </h3>

              <p className="mt-2 max-w-md text-sm leading-6 text-[var(--brand-medium-gray)]">
                Deleted tasks will appear here. You can restore them or
                permanently delete them from this page.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--brand-border)]">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className="group flex flex-col gap-4 px-5 py-5 transition hover:bg-[var(--brand-red-light)] xl:flex-row xl:items-center xl:justify-between"
                >
                  {/* TASK INFO */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-medium text-[var(--brand-black)]">
                        {task.title || "Untitled Task"}
                      </h3>

                      <span
                        className={`rounded-lg border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getRoleBadge(
                          task.ownerRole,
                        )}`}
                      >
                        {getRoleLabel(task.ownerRole)}
                      </span>

                      {task.status && (
                        <span className="rounded-lg border border-[var(--brand-border)] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--brand-black)]">
                          {task.status}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--brand-black)]">
                      <span>
                        Assigned:{" "}
                        <span className="text-[var(--brand-black)]">
                          {task.assignedToName || "Unassigned"}
                        </span>
                      </span>

                      {task.department && (
                        <span>
                          Department:{" "}
                          <span className="text-[var(--brand-black)]">
                            {task.department}
                          </span>
                        </span>
                      )}

                      {task.clientName && (
                        <span>
                          Client:{" "}
                          <span className="text-[var(--brand-black)]">
                            {task.clientName}
                          </span>
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--brand-black)]">
                      <Clock3 className="h-3.5 w-3.5" />

                      <span>Deleted {formatDate(task.deletedAt)}</span>

                      <span className="text-[var(--brand-black)]">•</span>

                      <span>
                        By{" "}
                        <span className="text-[var(--brand-black)]">
                          {task.deletedByName || "Unknown"}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* ACTIONS */}
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      onClick={() => setSelectedTask(task)}
                      className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white px-3.5 py-2.5 text-xs font-medium text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </button>

                    <button
                      onClick={() => restoreTask(task)}
                      disabled={actionLoading === `restore-${task.id}`}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-500/15 disabled:opacity-50"
                    >
                      {actionLoading === `restore-${task.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-4 w-4" />
                      )}
                      Restore
                    </button>

                    <button
                      onClick={() => permanentlyDeleteTask(task)}
                      disabled={actionLoading === `delete-${task.id}`}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-700 transition hover:bg-red-500/15 disabled:opacity-50"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 "
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-[var(--brand-border)] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* MODAL HEADER */}
            <div className="flex items-start justify-between border-b border-[var(--brand-border)] px-6 py-5">
              <div>
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-[var(--brand-red)]" />

                  <span className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--brand-red)]">
                    Deleted Task
                  </span>
                </div>

                <h2 className="mt-2 text-xl font-semibold">
                  {selectedTask.title || "Untitled Task"}
                </h2>
              </div>

              <button
                onClick={() => setSelectedTask(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* MODAL CONTENT */}
            <div className="max-h-[65vh] overflow-y-auto px-6 py-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <p className="text-xs text-[var(--brand-medium-gray)]">
                    Assigned To
                  </p>

                  <p className="mt-1 text-sm font-medium text-[var(--brand-dark-gray)]">
                    {selectedTask.assignedToName ||
                      selectedTask.assignedTo ||
                      "Unassigned"}
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <p className="text-xs text-[var(--brand-medium-gray)]">
                    Role
                  </p>

                  <p className="mt-1 text-sm font-medium text-[var(--brand-dark-gray)]">
                    {getRoleLabel(selectedTask.ownerRole)}
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <p className="text-xs text-[var(--brand-medium-gray)]">
                    Department
                  </p>

                  <p className="mt-1 text-sm font-medium text-[var(--brand-dark-gray)]">
                    {selectedTask.department || "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <p className="text-xs text-[var(--brand-medium-gray)]">
                    Client
                  </p>

                  <p className="mt-1 text-sm font-medium text-[var(--brand-dark-gray)]">
                    {selectedTask.clientName || "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <p className="text-xs text-[var(--brand-medium-gray)]">
                    Priority
                  </p>

                  <p className="mt-1 text-sm font-medium text-[var(--brand-dark-gray)]">
                    {selectedTask.priority || "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <p className="text-xs text-[var(--brand-medium-gray)]">
                    Original Status
                  </p>

                  <p className="mt-1 text-sm font-medium text-[var(--brand-dark-gray)]">
                    {selectedTask.status || "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <p className="text-xs text-[var(--brand-medium-gray)]">
                    Start Date
                  </p>

                  <p className="mt-1 text-sm font-medium text-[var(--brand-dark-gray)]">
                    {selectedTask.startDate || "—"}
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <p className="text-xs text-[var(--brand-medium-gray)]">
                    Deadline
                  </p>

                  <p className="mt-1 text-sm font-medium text-[var(--brand-dark-gray)]">
                    {selectedTask.deadline || "—"}
                    {selectedTask.deadlineTime
                      ? ` • ${selectedTask.deadlineTime}`
                      : ""}
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4 sm:col-span-2">
                  <p className="text-xs text-[var(--brand-medium-gray)]">
                    Deleted By
                  </p>

                  <p className="mt-1 text-sm font-medium text-[var(--brand-dark-gray)]">
                    {selectedTask.deletedByName ||
                      selectedTask.deletedBy ||
                      "Unknown"}
                  </p>

                  <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                    {formatDate(selectedTask.deletedAt)}
                  </p>
                </div>
              </div>

              {/* DESCRIPTION */}
              <div className="mt-4 rounded-2xl border border-[var(--brand-border)] bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-dark-gray)]">
                  Description
                </p>

                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--brand-medium-gray)]">
                  {selectedTask.description || "No description provided."}
                </p>
              </div>

              {/* SUBMISSION NOTE */}
              {selectedTask.submissionNote && (
                <div className="mt-4 rounded-2xl border border-[var(--brand-border)] bg-white p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-dark-gray)]">
                    Submission Note
                  </p>

                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--brand-medium-gray)]">
                    {selectedTask.submissionNote}
                  </p>
                </div>
              )}

              {/* DRIVE LINK */}
              {typeof selectedTask.googleDriveLink === "string" &&
                selectedTask.googleDriveLink && (
                  <div className="mt-4 rounded-2xl border border-[var(--brand-border)] bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-dark-gray)]">
                      Google Drive
                    </p>

                    <a
                      href={selectedTask.googleDriveLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 block break-all text-sm text-[var(--brand-red)] hover:text-[var(--brand-red)]"
                    >
                      {selectedTask.googleDriveLink}
                    </a>
                  </div>
                )}
            </div>

            {/* MODAL ACTIONS */}
            <div className="flex flex-col-reverse gap-3 border-t border-[var(--brand-border)] px-6 py-5 sm:flex-row sm:justify-end">
              <button
                onClick={() => setSelectedTask(null)}
                className="rounded-xl border border-[var(--brand-border)] bg-white px-5 py-3 text-sm font-medium text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
              >
                Close
              </button>

              <button
                onClick={() => restoreTask(selectedTask)}
                disabled={actionLoading === `restore-${selectedTask.id}`}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {actionLoading === `restore-${selectedTask.id}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                Restore Task
              </button>

              <button
                onClick={() => permanentlyDeleteTask(selectedTask)}
                disabled={actionLoading === `delete-${selectedTask.id}`}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500/15 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-500/20 disabled:opacity-50"
              >
                {actionLoading === `delete-${selectedTask.id}` ? (
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
