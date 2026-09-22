"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Inbox,
  Loader2,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  User,
} from "lucide-react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { db, auth } from "@/lib/firebase";

type UserProfile = {
  name?: string;
  role?: "founder" | "employee" | "intern";
  department?: string;
};

type RecycleTask = {
  id: string;
  originalTaskId?: string;

  title?: string;
  description?: string;

  client?: string;
  clientName?: string;

  department?: string;
  taskType?: string;

  priority?: string;
  status?: string;

  assignedTo?: string;
  assignedToName?: string;
  assignedToEmail?: string;

  assignmentType?: "single" | "team";
  teamMemberIds?: string[];

  teamMembers?: {
    id: string;
    name: string;
    email?: string;
    role?: string;
    department?: string;
  }[];

  teamLeadId?: string;
  teamLeadName?: string;

  submitterMode?: "selected" | "anybody";
  submitterId?: string;
  submitterName?: string;

  startDate?: string;
  deadline?: string;
  deadlineTime?: string;

  referenceDriveUrl?: string;

  submissionUrl?: string;
  submissionType?: string;
  submissionName?: string;
  submissionNote?: string;

  deletedAt?: any;
  deletedBy?: string;
  deletedByName?: string;

  ownerUserId?: string;
  ownerRole?: "founder" | "employee" | "intern";

  deletionSource?: "founder" | "employee";
  deletionReason?: string;

  recycleBinType?: "founder" | "employee";

  permanentlyDeleted?: boolean;
};

function formatDate(value: any) {
  if (!value) return "—";

  try {
    const date =
      typeof value?.toDate === "function" ? value.toDate() : new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function getPriorityClass(priority?: string) {
  const value = priority?.toLowerCase();

  if (value === "high" || value === "urgent") {
    return "border-red-400/30 bg-red-500/10 text-red-700";
  }

  if (value === "medium") {
    return "border-yellow-400/30 bg-yellow-500/10 text-yellow-300";
  }

  return "border-[var(--brand-red-secondary)]/30 bg-[var(--brand-red)]/10 text-[var(--brand-red)]";
}

export default function EmployeeRecycleBinPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [tasks, setTasks] = useState<RecycleTask[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState<RecycleTask | null>(null);

  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(
    null,
  );

  const [error, setError] = useState("");

  /* ---------------------------------
     AUTH + PROFILE
  --------------------------------- */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        const userSnapshot = await getDocs(
          query(
            collection(db, "users"),
            where("__name__", "==", currentUser.uid),
          ),
        );

        if (!userSnapshot.empty) {
          setProfile(userSnapshot.docs[0].data() as UserProfile);
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
      }
    });

    return () => unsubscribe();
  }, []);

  /* ---------------------------------
     LOAD RECYCLE BIN
  --------------------------------- */

  useEffect(() => {
    if (!user) return;

    const loadRecycleBin = async () => {
      setLoading(true);
      setError("");

      try {
        const snapshot = await getDocs(
          query(
            collection(db, "recycleBinTasks"),
            where("ownerUserId", "==", user.uid),
          ),
        );

        /*
         * IMPORTANT:
         * Firebase document ID must be used as React key.
         * Do NOT allow task.id from stored data to overwrite it.
         */
        const loadedTasks = snapshot.docs.map((item) => ({
          ...(item.data() as Omit<RecycleTask, "id">),
          id: item.id,
        }));

        loadedTasks.sort((a, b) => {
          const aDate =
            typeof a.deletedAt?.toDate === "function"
              ? a.deletedAt.toDate().getTime()
              : 0;

          const bDate =
            typeof b.deletedAt?.toDate === "function"
              ? b.deletedAt.toDate().getTime()
              : 0;

          return bDate - aDate;
        });

        setTasks(loadedTasks);
      } catch (err) {
        console.error("Recycle bin loading error:", err);

        setError("Unable to load the recycle bin. Check your Firestore rules.");
      } finally {
        setLoading(false);
      }
    };

    loadRecycleBin();
  }, [user]);

  /* ---------------------------------
     SEARCH
  --------------------------------- */

  const filteredTasks = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return tasks;

    return tasks.filter((task) => {
      const text = [
        task.title,
        task.description,
        task.client,
        task.clientName,
        task.department,
        task.taskType,
        task.priority,
        task.status,
        task.assignedToName,
        task.deletionReason,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(term);
    });
  }, [tasks, search]);

  /* ---------------------------------
     RESTORE SINGLE TASK
  --------------------------------- */

  const restoreTask = async (task: RecycleTask) => {
    if (!user) return;

    const confirmed = window.confirm(
      `Restore "${task.title || "this task"}" back to your active tasks?`,
    );

    if (!confirmed) return;

    setRestoringId(task.id);
    setError("");

    try {
      const {
        id,
        deletedAt,
        deletedBy,
        deletedByName,
        ownerUserId,
        ownerRole,
        deletionSource,
        deletionReason,
        recycleBinType,
        permanentlyDeleted,
        originalTaskId,
        ...originalTask
      } = task;

      const restoredTaskId = originalTaskId || id;

      const restoredTask = {
        ...originalTask,
        id: restoredTaskId,

        restoredAt: serverTimestamp(),
        restoredBy: user.uid,

        restoredByName:
          profile?.name ||
          user.displayName ||
          user.email?.split("@")[0] ||
          "Employee",

        updatedAt: serverTimestamp(),
      };

      const batch = writeBatch(db);

      batch.set(doc(db, "tasks", restoredTaskId), restoredTask);

      batch.delete(doc(db, "recycleBinTasks", task.id));

      await batch.commit();

      setTasks((current) => current.filter((item) => item.id !== task.id));

      setSelectedTask(null);

      alert("Task restored successfully.");
    } catch (err) {
      console.error("Restore error:", err);

      setError(
        "Unable to restore the task. Please check your Firestore rules.",
      );
    } finally {
      setRestoringId(null);
    }
  };

  /* ---------------------------------
     PERMANENT DELETE
  --------------------------------- */

  const permanentlyDeleteTask = async (task: RecycleTask) => {
    const confirmed = window.confirm(
      `PERMANENTLY DELETE "${task.title || "this task"}"?\n\nThis cannot be undone.`,
    );

    if (!confirmed) return;

    const secondConfirm = window.confirm(
      "Are you absolutely sure? This task will be permanently removed.",
    );

    if (!secondConfirm) return;

    setPermanentDeleteId(task.id);
    setError("");

    try {
      await deleteDoc(doc(db, "recycleBinTasks", task.id));

      setTasks((current) => current.filter((item) => item.id !== task.id));

      setSelectedTask(null);
    } catch (err) {
      console.error("Permanent delete error:", err);

      setError(
        "Unable to permanently delete the task. Please check your Firestore rules.",
      );
    } finally {
      setPermanentDeleteId(null);
    }
  };

  /* ---------------------------------
     RESTORE ALL
  --------------------------------- */

  const restoreAll = async () => {
    if (!user || tasks.length === 0) return;

    const confirmed = window.confirm(
      `Restore all ${tasks.length} deleted task(s)?`,
    );

    if (!confirmed) return;

    setLoading(true);
    setError("");

    try {
      const batch = writeBatch(db);

      const employeeName =
        profile?.name ||
        user.displayName ||
        user.email?.split("@")[0] ||
        "Employee";

      tasks.forEach((task) => {
        const {
          id,
          deletedAt,
          deletedBy,
          deletedByName,
          ownerUserId,
          ownerRole,
          deletionSource,
          deletionReason,
          recycleBinType,
          permanentlyDeleted,
          originalTaskId,
          ...originalTask
        } = task;

        const taskId = originalTaskId || id;

        batch.set(doc(db, "tasks", taskId), {
          ...originalTask,

          id: taskId,

          restoredAt: serverTimestamp(),
          restoredBy: user.uid,
          restoredByName: employeeName,
          updatedAt: serverTimestamp(),
        });

        batch.delete(doc(db, "recycleBinTasks", id));
      });

      await batch.commit();

      setTasks([]);
      setSelectedTask(null);

      alert("All tasks restored successfully.");
    } catch (err) {
      console.error("Restore all error:", err);

      setError(
        "Unable to restore all tasks. Please check your Firestore rules.",
      );
    } finally {
      setLoading(false);
    }
  };

  /* ---------------------------------
     UI
  --------------------------------- */

  return (
    <main className="min-h-screen bg-white text-[var(--brand-black)]">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden"></div>

      <div className="relative z-10 mx-auto max-w-7xl px-5 py-7 lg:px-8">
        {/* HEADER */}
        <header className="mb-7 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                window.location.href = "/employee/tasks";
              }}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-black)] transition hover:border-[var(--brand-red-secondary)]/30 hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
              title="Back to Tasks"
            >
              <ArrowLeft size={19} />
            </button>

            <div>
              <div className="mb-1 flex items-center gap-2">
                <Trash2 size={18} className="text-[var(--brand-red)]" />

                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-red)]">
                  Employee Workspace
                </span>
              </div>

              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                Recycle Bin
              </h1>

              <p className="mt-1 text-sm text-[var(--brand-medium-gray)]">
                Restore deleted tasks or permanently remove them.
              </p>
            </div>
          </div>

          {tasks.length > 0 && (
            <button
              onClick={restoreAll}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/15"
            >
              <RotateCcw size={17} />
              Restore All
            </button>
          )}
        </header>

        {/* ERROR */}
        {error && (
          <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-700">
            <div className="flex items-start gap-3">
              <ShieldAlert size={19} className="mt-0.5 shrink-0" />

              <span>{error}</span>
            </div>
          </div>
        )}

        {/* STATS */}
        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-5 ">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--brand-black)]">
                Deleted Tasks
              </span>

              <Trash2 size={18} className="text-[var(--brand-red)]" />
            </div>

            <div className="text-3xl font-bold">{tasks.length}</div>
          </div>

          <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-5 ">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--brand-black)]">
                Search Results
              </span>

              <Search size={18} className="text-[var(--brand-red)]" />
            </div>

            <div className="text-3xl font-bold">{filteredTasks.length}</div>
          </div>

          <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-5 ">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--brand-black)]">
                Access
              </span>

              <User size={18} className="text-emerald-700" />
            </div>

            <div className="text-sm font-semibold text-emerald-700">
              Personal Tasks Only
            </div>
          </div>
        </section>

        {/* SEARCH */}
        <section className="mb-6 rounded-2xl border border-[var(--brand-border)] bg-white p-4 ">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--brand-black)]"
            />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search deleted tasks..."
              className="w-full rounded-xl border border-[var(--brand-border)] bg-white py-3 pl-11 pr-4 text-sm text-[var(--brand-black)] outline-none transition placeholder:text-[var(--brand-black)] focus:border-[var(--brand-red-secondary)]/40"
            />
          </div>
        </section>

        {/* LOADING */}
        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-[var(--brand-border)] bg-white">
            <div className="flex flex-col items-center gap-3 text-[var(--brand-black)]">
              <Loader2
                size={30}
                className="animate-spin text-[var(--brand-red)]"
              />

              <span className="text-sm">Loading recycle bin...</span>
            </div>
          </div>
        ) : filteredTasks.length === 0 ? (
          /* EMPTY */
          <div className="flex min-h-[380px] flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--brand-border)] bg-white px-6 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/10">
              <Inbox size={30} className="text-[var(--brand-red)]" />
            </div>

            <h2 className="text-lg font-semibold">
              {search ? "No matching tasks" : "Recycle bin is empty"}
            </h2>

            <p className="mt-2 max-w-md text-sm leading-6 text-[var(--brand-medium-gray)]">
              {search
                ? "Try another search term."
                : "Tasks deleted from your workspace will appear here."}
            </p>
          </div>
        ) : (
          /* TASK LIST */
          <div className="grid gap-4">
            {filteredTasks.map((task) => (
              <article
                key={task.id}
                className="rounded-2xl border border-[var(--brand-border)] bg-white p-5  transition hover:border-[var(--brand-red-secondary)]/20 hover:bg-[var(--brand-red-light)]"
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-lg border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--brand-red)]">
                        DELETED
                      </span>

                      {task.priority && (
                        <span
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${getPriorityClass(
                            task.priority,
                          )}`}
                        >
                          {task.priority}
                        </span>
                      )}

                      {task.assignmentType === "team" && (
                        <span className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-300">
                          TEAM
                        </span>
                      )}
                    </div>

                    <h2 className="truncate text-lg font-semibold text-[var(--brand-black)]">
                      {task.title || "Untitled Task"}
                    </h2>

                    {task.description && (
                      <p className="mt-1 line-clamp-2 max-w-3xl text-sm leading-6 text-[var(--brand-medium-gray)]">
                        {task.description}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--brand-black)]">
                      {(task.clientName || task.client) && (
                        <span>
                          Client:{" "}
                          <strong className="text-[var(--brand-black)]">
                            {task.clientName || task.client}
                          </strong>
                        </span>
                      )}

                      {task.department && (
                        <span>
                          Department:{" "}
                          <strong className="text-[var(--brand-black)]">
                            {task.department}
                          </strong>
                        </span>
                      )}

                      {task.deadline && (
                        <span className="inline-flex items-center gap-1">
                          <Clock3 size={13} />
                          Deadline:{" "}
                          <strong className="text-[var(--brand-black)]">
                            {task.deadline}

                            {task.deadlineTime ? ` • ${task.deadlineTime}` : ""}
                          </strong>
                        </span>
                      )}
                    </div>

                    <div className="mt-3 text-xs text-[var(--brand-black)]">
                      Deleted {formatDate(task.deletedAt)}
                      {task.deletionReason ? ` • ${task.deletionReason}` : ""}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      onClick={() => setSelectedTask(task)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
                    >
                      <FileText size={16} />
                      Details
                    </button>

                    <button
                      onClick={() => restoreTask(task)}
                      disabled={restoringId === task.id}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {restoringId === task.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <RotateCcw size={16} />
                      )}
                      Restore
                    </button>

                    <button
                      onClick={() => permanentlyDeleteTask(task)}
                      disabled={permanentDeleteId === task.id}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {permanentDeleteId === task.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                      Delete Forever
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* DETAILS MODAL */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 ">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-[var(--brand-border)] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[var(--brand-border)] px-6 py-5">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  <Trash2 size={17} className="text-[var(--brand-red)]" />

                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-red)]">
                    Deleted Task
                  </span>
                </div>

                <h2 className="truncate text-xl font-bold">
                  {selectedTask.title || "Untitled Task"}
                </h2>
              </div>

              <button
                onClick={() => setSelectedTask(null)}
                className="rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm text-[var(--brand-black)] hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
              >
                Close
              </button>
            </div>

            {/* Modal Body */}
            <div className="max-h-[65vh] overflow-y-auto px-6 py-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <div className="mb-2 text-xs uppercase tracking-wider text-[var(--brand-black)]">
                    Status
                  </div>

                  <div className="font-medium">
                    {selectedTask.status || "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <div className="mb-2 text-xs uppercase tracking-wider text-[var(--brand-black)]">
                    Priority
                  </div>

                  <div className="font-medium">
                    {selectedTask.priority || "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <div className="mb-2 text-xs uppercase tracking-wider text-[var(--brand-black)]">
                    Department
                  </div>

                  <div className="font-medium">
                    {selectedTask.department || "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <div className="mb-2 text-xs uppercase tracking-wider text-[var(--brand-black)]">
                    Task Type
                  </div>

                  <div className="font-medium">
                    {selectedTask.taskType || "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4 md:col-span-2">
                  <div className="mb-2 text-xs uppercase tracking-wider text-[var(--brand-black)]">
                    Description
                  </div>

                  <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--brand-medium-gray)]">
                    {selectedTask.description || "No description"}
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <div className="mb-2 text-xs uppercase tracking-wider text-[var(--brand-black)]">
                    Client
                  </div>

                  <div className="font-medium">
                    {selectedTask.clientName || selectedTask.client || "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <div className="mb-2 text-xs uppercase tracking-wider text-[var(--brand-black)]">
                    Assigned To
                  </div>

                  <div className="font-medium">
                    {selectedTask.assignedToName || "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <div className="mb-2 text-xs uppercase tracking-wider text-[var(--brand-black)]">
                    Start Date
                  </div>

                  <div className="font-medium">
                    {selectedTask.startDate || "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <div className="mb-2 text-xs uppercase tracking-wider text-[var(--brand-black)]">
                    Deadline
                  </div>

                  <div className="font-medium">
                    {selectedTask.deadline || "—"}

                    {selectedTask.deadlineTime
                      ? ` • ${selectedTask.deadlineTime}`
                      : ""}
                  </div>
                </div>
              </div>

              {/* TEAM MEMBERS */}
              {selectedTask.teamMembers &&
                selectedTask.teamMembers.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-cyan-400/10 bg-cyan-500/[0.04] p-5">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-300/70">
                      Team Members
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {selectedTask.teamMembers.map((member) => (
                        <div
                          key={member.id}
                          className="rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-sm"
                        >
                          {member.name}

                          {member.id === selectedTask.teamLeadId && (
                            <span className="ml-2 text-xs text-cyan-300">
                              Lead
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* DRIVE REFERENCE */}
              {selectedTask.referenceDriveUrl && (
                <div className="mt-4 rounded-2xl border border-[var(--brand-red-secondary)]/10 bg-[var(--brand-red)]/[0.04] p-5">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--brand-red)]">
                    Task Reference
                  </div>

                  <a
                    href={selectedTask.referenceDriveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/10 px-4 py-2.5 text-sm font-semibold text-[var(--brand-red)] transition hover:bg-[var(--brand-red)]/15"
                  >
                    <ExternalLink size={16} />
                    Open Google Drive
                  </a>
                </div>
              )}

              {/* SUBMISSION */}
              {selectedTask.submissionUrl && (
                <div className="mt-4 rounded-2xl border border-emerald-400/10 bg-emerald-500/[0.04] p-5">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700/70">
                    <CheckCircle2 size={15} />
                    Submitted Work
                  </div>

                  {selectedTask.submissionName && (
                    <div className="mb-2 text-sm font-medium">
                      {selectedTask.submissionName}
                    </div>
                  )}

                  {selectedTask.submissionNote && (
                    <p className="mb-3 whitespace-pre-wrap text-sm leading-6 text-[var(--brand-medium-gray)]">
                      {selectedTask.submissionNote}
                    </p>
                  )}

                  <a
                    href={selectedTask.submissionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/15"
                  >
                    <ExternalLink size={16} />
                    Open Submitted Work
                  </a>
                </div>
              )}

              {/* DELETION INFO */}
              <div className="mt-4 rounded-2xl border border-red-400/10 bg-red-500/[0.035] p-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-700/70">
                  Deletion Information
                </div>

                <div className="space-y-2 text-sm text-[var(--brand-black)]">
                  <div>
                    Deleted by:{" "}
                    <span className="text-[var(--brand-black)]">
                      {selectedTask.deletedByName || "—"}
                    </span>
                  </div>

                  <div>
                    Deleted on:{" "}
                    <span className="text-[var(--brand-black)]">
                      {formatDate(selectedTask.deletedAt)}
                    </span>
                  </div>

                  <div>
                    Reason:{" "}
                    <span className="text-[var(--brand-black)]">
                      {selectedTask.deletionReason || "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col gap-3 border-t border-[var(--brand-border)] px-6 py-5 sm:flex-row sm:justify-end">
              <button
                onClick={() => restoreTask(selectedTask)}
                disabled={restoringId === selectedTask.id}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-500/15 disabled:opacity-50"
              >
                {restoringId === selectedTask.id ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <RotateCcw size={17} />
                )}
                Restore Task
              </button>

              <button
                onClick={() => permanentlyDeleteTask(selectedTask)}
                disabled={permanentDeleteId === selectedTask.id}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-700 hover:bg-red-500/15 disabled:opacity-50"
              >
                {permanentDeleteId === selectedTask.id ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <Trash2 size={17} />
                )}
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
