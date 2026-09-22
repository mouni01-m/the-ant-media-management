"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ArrowLeft,
  Search,
  CheckCircle2,
  Circle,
  FileText,
  AlertCircle,
  Loader2,
  Target,
  CalendarClock,
} from "lucide-react";

import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

import { auth, db } from "@/lib/firebase";
import {
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  getGoogleAccessToken,
  getGoogleCalendarEventUrl,
} from "@/lib/googleCalendar";

type Task = {
  id: string;
  title?: string;
  description?: string;
  client?: string;
  department?: string;
  taskType?: string;
  assignedTo?: string;
  assignedToId?: string;
  assignedUserId?: string;
  assignedEmail?: string;
  assignmentType?: "single" | "team";
  teamMemberIds?: string[];
  teamMembers?: {
    id: string;
    name?: string;
    email?: string;
    role?: string;
    department?: string;
    isTeamLead?: boolean;
  }[];
  calendarReminder?: boolean;
  googleCalendarEventId?: string;
  calendarEventId?: string;
  employeeGoogleCalendarEventId?: string;
  calendarSyncedAt?: Timestamp | Date | null;
  calendarSyncedBy?: string;
  priority?: string;
  status?: string;
  startDate?: string | Timestamp | Date | null;
  deadline?: string | Timestamp | Date | null;
  deadlineTime?: string;
  createdAt?: Timestamp | Date | null;
};

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    className: string;
  }
> = {
  "TO DO": {
    label: "To Do",
    className:
      "bg-white text-[var(--brand-black)] border-[var(--brand-border)]",
  },
  "IN PROGRESS": {
    label: "In Progress",
    className:
      "bg-[var(--brand-red)]/10 text-[var(--brand-red)] border-[var(--brand-red-secondary)]/20",
  },
  SUBMITTED: {
    label: "Submitted",
    className:
      "bg-[var(--brand-red)]/10 text-[var(--brand-red)] border-[var(--brand-red-secondary)]/20",
  },
  REVIEW: {
    label: "Review",
    className:
      "bg-[var(--brand-red)]/10 text-[var(--brand-red)] border-[var(--brand-red-secondary)]/20",
  },
  "CHANGES REQUESTED": {
    label: "Changes",
    className: "bg-orange-500/10 text-orange-700 border-orange-500/20",
  },
  APPROVED: {
    label: "Approved",
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  },
};

const PRIORITY_CONFIG: Record<
  string,
  {
    label: string;
    className: string;
  }
> = {
  LOW: {
    label: "Low",
    className: "text-slate-300 bg-slate-500/10 border-slate-500/20",
  },
  MEDIUM: {
    label: "Medium",
    className: "text-yellow-300 bg-yellow-500/10 border-yellow-500/20",
  },
  HIGH: {
    label: "High",
    className: "text-orange-700 bg-orange-500/10 border-orange-500/20",
  },
  URGENT: {
    label: "Urgent",
    className: "text-red-700 bg-red-500/10 border-red-500/20",
  },
};

function convertToDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }

    // Support DD/MM/YYYY
    const match = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);

    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]) - 1;
      const year = Number(match[3]);

      const date = new Date(year, month, day);

      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }

  return null;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function sameDay(a: Date, b: Date) {
  return dateKey(a) === dateKey(b);
}

function isCompleted(status?: string) {
  return (
    status === "COMPLETED" || status === "APPROVED" || status === "Completed"
  );
}

function getTaskDeadline(task: Task) {
  return convertToDate(task.deadline);
}

function getTaskDate(task: Task) {
  return convertToDate(task.deadline) || convertToDate(task.startDate);
}

function formatTime(time?: string) {
  if (!time) return "";

  const value = time.trim();

  // Already looks like 07:00 PM
  if (/[AP]M/i.test(value)) {
    return value;
  }

  const match = value.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return value;

  let hour = Number(match[1]);
  const minute = match[2];

  const suffix = hour >= 12 ? "PM" : "AM";

  if (hour === 0) hour = 12;
  if (hour > 12) hour -= 12;

  return `${String(hour).padStart(2, "0")}:${minute} ${suffix}`;
}

function formatFullDate(date: Date) {
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function EmployeeCalendarPage() {
  const router = useRouter();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [tasks, setTasks] = useState<Task[]>([]);
  const [userName, setUserName] = useState("Employee");

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [syncingTaskId, setSyncingTaskId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState("");

  useEffect(() => {
    let unsubscribeTaskListeners: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/");
        return;
      }

      try {
        setLoading(true);
        setError("");

        // Get employee profile
        try {
          const userQuery = query(
            collection(db, "users"),
            where("__name__", "==", user.uid),
          );

          const userSnapshot = await getDocs(userQuery);

          if (!userSnapshot.empty) {
            const profile = userSnapshot.docs[0].data();

            if (profile.name) {
              setUserName(profile.name);
            }
          }
        } catch {
          // Profile failure should not stop calendar loading.
        }

        /*
         * Load both normal tasks and shared team tasks.
         * A team member must see the same task/deadline/reminder in
         * their private calendar even when assignedTo points to the TL.
         */
        /*
         * Real-time task calendar:
         * - assignedTo catches single-assignee tasks
         * - teamMemberIds catches shared/team tasks
         * When the Founder creates/updates a task, the employee calendar
         * updates automatically without requiring a page refresh.
         */
        const taskMap = new Map<string, Task>();
        let assignedReady = false;
        let teamReady = false;
        let assignedFailed = false;
        let teamFailed = false;

        const publishTasks = () => {
          setTasks(Array.from(taskMap.values()));
          setLoading(false);
        };

        const handleQueryFailure = (
          label: string,
          queryError: unknown,
          kind: "assigned" | "team",
        ) => {
          console.warn(`${label} calendar query failed:`, queryError);

          if (kind === "assigned") assignedFailed = true;
          if (kind === "team") teamFailed = true;

          if ((assignedReady || assignedFailed) && (teamReady || teamFailed)) {
            publishTasks();
          }
        };

        let unsubscribeAssigned: (() => void) | null = null;
        let unsubscribeTeam: (() => void) | null = null;

        try {
          const assignedQuery = query(
            collection(db, "tasks"),
            where("assignedTo", "==", user.uid),
          );

          unsubscribeAssigned = onSnapshot(
            assignedQuery,
            (snapshot) => {
              snapshot.docChanges().forEach((change) => {
                if (change.type === "removed") {
                  const stillTeamMember = Array.from(taskMap.values()).some(
                    (task) =>
                      task.id === change.doc.id &&
                      Array.isArray(task.teamMemberIds) &&
                      task.teamMemberIds.includes(user.uid),
                  );

                  if (!stillTeamMember) {
                    taskMap.delete(change.doc.id);
                  }
                } else {
                  taskMap.set(change.doc.id, {
                    id: change.doc.id,
                    ...change.doc.data(),
                  } as Task);
                }
              });

              // onSnapshot can initially return all documents as "added".
              assignedReady = true;
              publishTasks();
            },
            (assignedError) =>
              handleQueryFailure("Assigned task", assignedError, "assigned"),
          );
        } catch (assignedError) {
          handleQueryFailure("Assigned task", assignedError, "assigned");
        }

        try {
          const teamQuery = query(
            collection(db, "tasks"),
            where("teamMemberIds", "array-contains", user.uid),
          );

          unsubscribeTeam = onSnapshot(
            teamQuery,
            (snapshot) => {
              snapshot.docChanges().forEach((change) => {
                if (change.type === "removed") {
                  /*
                   * Only delete when the task is not also present in the
                   * single-assignee query.
                   */
                  const stillAssigned = Array.from(taskMap.values()).some(
                    (task) =>
                      task.id === change.doc.id && task.assignedTo === user.uid,
                  );

                  if (!stillAssigned) {
                    taskMap.delete(change.doc.id);
                  }
                } else {
                  taskMap.set(change.doc.id, {
                    id: change.doc.id,
                    ...change.doc.data(),
                  } as Task);
                }
              });

              teamReady = true;
              publishTasks();
            },
            (teamError) => handleQueryFailure("Team task", teamError, "team"),
          );
        } catch (teamError) {
          handleQueryFailure("Team task", teamError, "team");
        }

        /*
         * Backwards-compatible one-time fallback only when both real-time
         * queries fail. This helps older documents/rules while preserving
         * the real-time path for the normal setup.
         */
        if (assignedFailed && teamFailed) {
          try {
            const snapshot = await getDocs(collection(db, "tasks"));
            snapshot.docs.forEach((taskDoc) => {
              const data = taskDoc.data() as Task;
              const isAssigned =
                data.assignedTo === user.uid ||
                data.assignedToId === user.uid ||
                data.assignedUserId === user.uid ||
                data.assignedEmail === user.email;
              const isTeamMember =
                Array.isArray(data.teamMemberIds) &&
                data.teamMemberIds.includes(user.uid);

              if (isAssigned || isTeamMember) {
                taskMap.set(taskDoc.id, { ...data, id: taskDoc.id });
              }
            });

            publishTasks();
          } catch (fallbackError) {
            console.error("Calendar task loading error:", fallbackError);
            setError(
              "Unable to load your calendar tasks. Please check your connection.",
            );
            setLoading(false);
          }
        }

        /*
         * Stop both Firestore listeners when the employee leaves the page
         * or signs out.
         */
        unsubscribeTaskListeners = () => {
          unsubscribeAssigned?.();
          unsubscribeTeam?.();
        };
      } catch (err) {
        console.error("Calendar error:", err);

        setError("Something went wrong while loading your calendar.");
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeTaskListeners?.();
    };
  }, [router]);

  const syncTaskToGoogleCalendar = async (task: Task) => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setError("Please sign in again before syncing your calendar.");
      return;
    }

    const deadline = getTaskDeadline(task);

    if (!deadline) {
      setError(
        "This task does not have a deadline, so it cannot be added to Google Calendar.",
      );
      return;
    }

    setSyncingTaskId(task.id);
    setSyncMessage("");
    setError("");

    try {
      const date = `${deadline.getFullYear()}-${String(
        deadline.getMonth() + 1,
      ).padStart(2, "0")}-${String(deadline.getDate()).padStart(2, "0")}`;

      const time = task.deadlineTime || "09:00";

      const calendarInput = {
        title: `The Ant Media: ${task.title || "Task deadline"}`,
        description: [
          task.description || "",
          task.client ? `Client: ${task.client}` : "",
          task.department ? `Department: ${task.department}` : "",
          task.taskType ? `Task type: ${task.taskType}` : "",
          `Status: ${task.status || "TO DO"}`,
        ]
          .filter(Boolean)
          .join("\n"),
        date,
        time,
        reminderMinutes: 60,
      };

      const accessToken = await getGoogleAccessToken();
      const existingEventId = task.employeeGoogleCalendarEventId;

      let eventId = "";

      if (existingEventId) {
        try {
          const updated = await updateGoogleCalendarEvent(
            accessToken,
            existingEventId,
            calendarInput,
          );
          eventId = updated.id || existingEventId;
        } catch (updateError) {
          // A Founder-created event ID may exist in Firestore but not in
          // the employee's Google Calendar. In that case create a fresh
          // event in the employee's own calendar.
          const message =
            updateError instanceof Error ? updateError.message : "";

          if (
            !message.includes("404") &&
            !message.toLowerCase().includes("not found")
          ) {
            throw updateError;
          }

          const created = await createGoogleCalendarEvent(
            accessToken,
            calendarInput,
          );
          eventId = created.id;
        }
      } else {
        const created = await createGoogleCalendarEvent(
          accessToken,
          calendarInput,
        );
        eventId = created.id;
      }

      if (!eventId) {
        throw new Error("Google Calendar did not return an event ID.");
      }

      await import("firebase/firestore").then(({ updateDoc, doc }) =>
        updateDoc(doc(db, "tasks", task.id), {
          employeeGoogleCalendarEventId: eventId,
          calendarSyncedAt: new Date(),
          calendarSyncedBy: currentUser.uid,
        }),
      );

      setSyncMessage(
        `${task.title || "Task"} ${
          existingEventId ? "is synced with" : "was added to"
        } your Google Calendar.`,
      );

      window.open(
        getGoogleCalendarEventUrl(eventId),
        "_blank",
        "noopener,noreferrer",
      );
    } catch (syncError) {
      console.error("Google Calendar sync error:", syncError);
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Unable to sync this task to Google Calendar.",
      );
    } finally {
      setSyncingTaskId(null);
    }
  };

  const monthName = currentMonth.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDay = new Date(year, month, 1);

    // Monday = 0, Sunday = 6
    const startingDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const previousMonthDays = new Date(year, month, 0).getDate();

    const cells: {
      date: Date;
      currentMonth: boolean;
    }[] = [];

    // Previous month's trailing dates
    for (let i = startingDay - 1; i >= 0; i--) {
      cells.push({
        date: new Date(year, month - 1, previousMonthDays - i),
        currentMonth: false,
      });
    }

    // Current month
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({
        date: new Date(year, month, day),
        currentMonth: true,
      });
    }

    // Next month
    let nextDay = 1;

    while (cells.length < 42) {
      cells.push({
        date: new Date(year, month + 1, nextDay),
        currentMonth: false,
      });

      nextDay++;
    }

    return cells;
  }, [currentMonth]);

  const filteredTasks = useMemo(() => {
    const queryText = search.trim().toLowerCase();

    if (!queryText) return tasks;

    return tasks.filter((task) => {
      return (
        task.title?.toLowerCase().includes(queryText) ||
        task.description?.toLowerCase().includes(queryText) ||
        task.client?.toLowerCase().includes(queryText) ||
        task.department?.toLowerCase().includes(queryText) ||
        task.taskType?.toLowerCase().includes(queryText) ||
        task.status?.toLowerCase().includes(queryText)
      );
    });
  }, [tasks, search]);

  const selectedDayTasks = useMemo(() => {
    return filteredTasks
      .filter((task) => {
        const taskDate = getTaskDate(task);

        return taskDate && sameDay(taskDate, selectedDate);
      })
      .sort((a, b) => {
        const dateA = getTaskDeadline(a)?.getTime() || 0;
        const dateB = getTaskDeadline(b)?.getTime() || 0;

        return dateA - dateB;
      });
  }, [filteredTasks, selectedDate]);

  const upcomingTasks = useMemo(() => {
    const now = new Date();

    return filteredTasks
      .filter((task) => {
        const date = getTaskDeadline(task);

        return date && date >= now && !isCompleted(task.status);
      })
      .sort((a, b) => {
        const dateA = getTaskDeadline(a)?.getTime() || 0;
        const dateB = getTaskDeadline(b)?.getTime() || 0;

        return dateA - dateB;
      })
      .slice(0, 5);
  }, [filteredTasks]);

  const overdueTasks = useMemo(() => {
    const now = new Date();

    return filteredTasks.filter((task) => {
      const deadline = getTaskDeadline(task);

      return deadline && deadline < now && !isCompleted(task.status);
    });
  }, [filteredTasks]);

  const monthTaskCount = useMemo(() => {
    return tasks.filter((task) => {
      const date = getTaskDate(task);

      return (
        date &&
        date.getMonth() === currentMonth.getMonth() &&
        date.getFullYear() === currentMonth.getFullYear()
      );
    }).length;
  }, [tasks, currentMonth]);

  const goPreviousMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1),
    );
  };

  const goNextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1),
    );
  };

  const goToday = () => {
    const today = new Date();

    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));

    setSelectedDate(today);
  };

  const tasksForDate = (date: Date) => {
    return filteredTasks.filter((task) => {
      const taskDate = getTaskDate(task);

      return taskDate && sameDay(taskDate, date);
    });
  };

  return (
    <main className="min-h-screen bg-white text-[var(--brand-black)]">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden"></div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--brand-border)] bg-white ">
        <div className="mx-auto flex h-20 max-w-[1600px] items-center justify-between px-5 md:px-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/employee")}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-black)] transition hover:border-[var(--brand-red-secondary)]/30 hover:bg-[var(--brand-red)]/10 hover:text-[var(--brand-black)]"
              aria-label="Back to employee dashboard"
            >
              <ArrowLeft size={19} />
            </button>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-red)]">
                Employee / Workspace
              </p>

              <h1 className="mt-1 text-xl font-bold md:text-2xl">Calendar</h1>
            </div>
          </div>

          <div className="hidden items-center gap-3 sm:flex">
            <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-4 py-2 text-xs font-medium text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm" />
              Workspace Active
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-red)] font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/20">
              {userName.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1600px] px-5 py-8 md:px-8 md:py-10">
        {/* Page heading */}
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--brand-red)]">
            <CalendarDays size={17} />
            <span>Work schedule & deadlines</span>
          </div>

          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
                Plan your work.
              </h2>

              <p className="mt-3 max-w-2xl text-base text-[var(--brand-medium-gray)] md:text-lg">
                Keep track of assigned work, deadlines and upcoming deliveries
                from one place.
              </p>
            </div>

            <button
              onClick={goToday}
              className="w-fit rounded-xl border border-[var(--brand-border)] bg-white px-5 py-3 text-sm font-semibold text-[var(--brand-black)] transition hover:border-[var(--brand-red-secondary)]/30 hover:bg-[var(--brand-red)]/10 hover:text-[var(--brand-black)]"
            >
              Today
            </button>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-sm text-red-700">
            <AlertCircle size={18} />
            {error}
          </div>
        )}
        {syncMessage && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 text-sm text-emerald-700">
            <CheckCircle2 size={18} />
            {syncMessage}
          </div>
        )}

        {/* Stats */}
        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MiniStat
            icon={<CalendarDays size={18} />}
            label="This month"
            value={String(monthTaskCount)}
            description="Scheduled tasks"
          />

          <MiniStat
            icon={<CalendarClock size={18} />}
            label="Upcoming"
            value={String(upcomingTasks.length)}
            description="Next deadlines"
          />

          <MiniStat
            icon={<AlertCircle size={18} />}
            label="Overdue"
            value={String(overdueTasks.length)}
            description={
              overdueTasks.length > 0
                ? "Needs attention"
                : "Everything on track"
            }
            danger={overdueTasks.length > 0}
          />

          <MiniStat
            icon={<Target size={18} />}
            label="My schedule"
            value={String(tasks.length)}
            description="Assigned tasks"
          />
        </section>

        {/* Main layout */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
          {/* Calendar */}
          <section className="overflow-hidden rounded-3xl border border-[var(--brand-border)] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/20">
            {/* Calendar toolbar */}
            <div className="border-b border-[var(--brand-border)] p-5 md:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-dark-gray)]">
                    Schedule
                  </p>

                  <h3 className="mt-1 text-2xl font-bold">{monthName}</h3>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand-black)]"
                    />

                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search tasks..."
                      className="h-10 w-full rounded-xl border border-[var(--brand-border)] bg-white pl-9 pr-4 text-sm text-[var(--brand-black)] outline-none transition placeholder:text-[var(--brand-black)] focus:border-[var(--brand-red-secondary)]/40 sm:w-52"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={goPreviousMonth}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-black)] transition hover:bg-[var(--brand-red)]/10 hover:text-[var(--brand-black)]"
                      aria-label="Previous month"
                    >
                      <ChevronLeft size={18} />
                    </button>

                    <button
                      onClick={goNextMonth}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-black)] transition hover:bg-[var(--brand-red)]/10 hover:text-[var(--brand-black)]"
                      aria-label="Next month"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-[550px] items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-[var(--brand-black)]">
                  <Loader2
                    size={28}
                    className="animate-spin text-[var(--brand-red)]"
                  />
                  <p className="text-sm">Loading your calendar...</p>
                </div>
              </div>
            ) : (
              <div className="p-3 md:p-5">
                {/* Weekdays */}
                <div className="grid grid-cols-7 border-b border-[var(--brand-border)] pb-3">
                  {[
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday",
                  ].map((day) => (
                    <div
                      key={day}
                      className="px-1 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-black)] md:text-xs"
                    >
                      <span className="hidden sm:inline">{day}</span>

                      <span className="sm:hidden">{day.slice(0, 3)}</span>
                    </div>
                  ))}
                </div>

                {/* Days */}
                <div className="grid grid-cols-7">
                  {calendarDays.map((cell, index) => {
                    const date = cell.date;
                    const dayTasks = tasksForDate(date);
                    const today = sameDay(date, new Date());
                    const selected = sameDay(date, selectedDate);

                    return (
                      <button
                        key={`${dateKey(date)}-${index}`}
                        onClick={() => {
                          setSelectedDate(date);

                          if (!cell.currentMonth) {
                            setCurrentMonth(
                              new Date(date.getFullYear(), date.getMonth(), 1),
                            );
                          }
                        }}
                        className={[
                          "group relative min-h-[82px] border-b border-r border-[var(--brand-border)] p-1.5 text-left transition md:min-h-[105px] md:p-2.5",
                          cell.currentMonth ? "bg-transparent" : "bg-white",
                          selected
                            ? "bg-[var(--brand-red)]/[0.09] ring-1 ring-inset ring-[var(--brand-red)]/40"
                            : "hover:bg-[var(--brand-red-light)]",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={[
                              "flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition md:text-sm",
                              today
                                ? "bg-[var(--brand-red)] text-[var(--brand-black)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/25"
                                : cell.currentMonth
                                  ? "text-[var(--brand-black)] group-hover:text-[var(--brand-black)]"
                                  : "text-[var(--brand-black)]",
                            ].join(" ")}
                          >
                            {date.getDate()}
                          </span>

                          {dayTasks.length > 0 && (
                            <span className="hidden text-[10px] text-[var(--brand-black)] md:block">
                              {dayTasks.length}
                            </span>
                          )}
                        </div>

                        <div className="mt-2 space-y-1">
                          {dayTasks.slice(0, 2).map((task) => (
                            <div
                              key={task.id}
                              className={[
                                "truncate rounded-md border px-1.5 py-1 text-[9px] font-medium md:text-[10px]",
                                isCompleted(task.status)
                                  ? "border-emerald-400/15 bg-emerald-400/5 text-emerald-700/70"
                                  : "border-[var(--brand-red-secondary)]/15 bg-[var(--brand-red)]/10 text-[var(--brand-red)]",
                              ].join(" ")}
                              title={task.title}
                            >
                              {task.title || "Untitled task"}
                            </div>
                          ))}

                          {dayTasks.length > 2 && (
                            <p className="px-1 text-[9px] text-[var(--brand-medium-gray)]">
                              +{dayTasks.length - 2} more
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Right panel */}
          <aside className="space-y-6">
            {/* Selected day */}
            <section className="rounded-3xl border border-[var(--brand-border)] bg-white p-5 md:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--brand-red)]">
                    Selected day
                  </p>

                  <h3 className="mt-1 text-xl font-bold">
                    {formatFullDate(selectedDate)}
                  </h3>
                </div>

                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-red)]/10 text-[var(--brand-red)]">
                  <CalendarDays size={19} />
                </div>
              </div>

              {selectedDayTasks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--brand-border)] bg-white px-5 py-10 text-center">
                  <CalendarDays
                    size={27}
                    className="mx-auto mb-3 text-[var(--brand-black)]"
                  />

                  <p className="text-sm font-medium text-[var(--brand-dark-gray)]">
                    No tasks scheduled
                  </p>

                  <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                    Enjoy the clear schedule.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDayTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      syncing={syncingTaskId === task.id}
                      onSync={() => syncTaskToGoogleCalendar(task)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Upcoming */}
            <section className="rounded-3xl border border-[var(--brand-border)] bg-[var(--brand-red)]/[0.05] p-5 md:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--brand-red)]">
                    Coming up
                  </p>

                  <h3 className="mt-1 text-xl font-bold">Next deadlines</h3>
                </div>

                <Clock3 size={20} className="text-[var(--brand-red)]" />
              </div>

              {upcomingTasks.length === 0 ? (
                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-5 text-center">
                  <CheckCircle2
                    size={25}
                    className="mx-auto mb-2 text-emerald-700"
                  />

                  <p className="text-sm text-[var(--brand-medium-gray)]">
                    No upcoming deadlines.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingTasks.map((task) => {
                    const deadline = getTaskDeadline(task);

                    return (
                      <div
                        key={task.id}
                        className="rounded-2xl border border-[var(--brand-border)] bg-white p-4 transition hover:border-[var(--brand-red-secondary)]/20"
                      >
                        <div className="flex gap-3">
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-red)]/10 text-[var(--brand-red)]">
                            <FileText size={16} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[var(--brand-dark-gray)]">
                              {task.title || "Untitled task"}
                            </p>

                            {deadline && (
                              <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                                {formatShortDate(deadline)}
                                {task.deadlineTime
                                  ? ` • ${formatTime(task.deadlineTime)}`
                                  : ""}
                              </p>
                            )}

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <StatusBadge status={task.status} />
                              {task.calendarReminder && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/[0.06] px-2 py-1 text-[10px] text-[var(--brand-red)]">
                                  <CalendarClock size={11} /> 60 min reminder
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Calendar info */}
            <section className="rounded-3xl border border-[var(--brand-border)] bg-white p-5">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700">
                  <CheckCircle2 size={18} />
                </div>

                <div>
                  <p className="text-sm font-semibold">
                    Your calendar is private
                  </p>

                  <p className="mt-1 text-xs leading-5 text-[var(--brand-medium-gray)]">
                    Only your assigned tasks and shared team tasks appear here.
                  </p>
                </div>
              </div>
            </section>
          </aside>
        </div>

        {/* Footer */}
        <footer className="mt-10 border-t border-[var(--brand-border)] py-6">
          <div className="flex flex-col justify-between gap-3 text-xs text-[var(--brand-black)] sm:flex-row">
            <p>© 2026 The Ant Media · Internal Management System</p>

            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Secure workspace
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Components                                                                 */
/* -------------------------------------------------------------------------- */

function MiniStat({
  icon,
  label,
  value,
  description,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  description: string;
  danger?: boolean;
}) {
  return (
    <div className="group rounded-2xl border border-[var(--brand-border)] bg-white p-5 transition hover:border-[var(--brand-red-secondary)]/20 hover:bg-[var(--brand-red-light)]">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-red)]/10 text-[var(--brand-red)]">
          {icon}
        </div>

        <div className="h-1.5 w-1.5 rounded-full bg-white transition group-hover:bg-[var(--brand-red)]" />
      </div>

      <p className="text-xs font-medium text-[var(--brand-dark-gray)]">
        {label}
      </p>

      <p
        className={[
          "mt-1 text-3xl font-bold",
          danger ? "text-red-700" : "text-[var(--brand-black)]",
        ].join(" ")}
      >
        {value}
      </p>

      <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
        {description}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const normalized = (status || "TO DO").toUpperCase();

  const config = STATUS_CONFIG[normalized] || STATUS_CONFIG["TO DO"];

  return (
    <span
      className={[
        "inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold",
        config.className,
      ].join(" ")}
    >
      {config.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority?: string }) {
  const normalized = (priority || "MEDIUM").toUpperCase();

  const config = PRIORITY_CONFIG[normalized] || PRIORITY_CONFIG.MEDIUM;

  return (
    <span
      className={[
        "inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold",
        config.className,
      ].join(" ")}
    >
      {config.label}
    </span>
  );
}

function TaskItem({
  task,
  syncing = false,
  onSync,
}: {
  task: Task;
  syncing?: boolean;
  onSync?: () => void;
}) {
  const deadline = getTaskDeadline(task);
  const completed = isCompleted(task.status);

  return (
    <div className="group rounded-2xl border border-[var(--brand-border)] bg-white p-4 transition hover:border-[var(--brand-red-secondary)]/25 hover:bg-[var(--brand-red-light)]">
      <div className="flex gap-3">
        <div
          className={[
            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            completed
              ? "bg-emerald-500/10 text-emerald-700"
              : "bg-[var(--brand-red)]/10 text-[var(--brand-red)]",
          ].join(" ")}
        >
          {completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="text-sm font-semibold text-[var(--brand-black)]">
              {task.title || "Untitled task"}
            </h4>

            <PriorityBadge priority={task.priority} />
          </div>

          {task.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--brand-medium-gray)]">
              {task.description}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} />

            {task.taskType && (
              <span className="rounded-md border border-[var(--brand-border)] bg-white px-2 py-1 text-[10px] text-[var(--brand-black)]">
                {task.taskType}
              </span>
            )}

            {task.assignmentType === "team" && (
              <span className="rounded-md border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/[0.06] px-2 py-1 text-[10px] text-[var(--brand-red)]">
                Team task
              </span>
            )}

            {task.calendarReminder && (
              <span className="flex items-center gap-1 rounded-md border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/[0.06] px-2 py-1 text-[10px] text-[var(--brand-red)]">
                <CalendarClock size={11} /> Reminder set
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {deadline && (
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--brand-black)]">
                <Clock3 size={12} />
                {task.deadlineTime
                  ? formatTime(task.deadlineTime)
                  : "Deadline set"}
              </span>
            )}

            {task.client && (
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--brand-black)]">
                <FileText size={12} />
                {task.client}
              </span>
            )}

            {onSync && deadline && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSync();
                }}
                disabled={syncing}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/10 px-2.5 py-1.5 text-[10px] font-semibold text-[var(--brand-red)] transition hover:border-[var(--brand-red-secondary)]/35 hover:bg-[var(--brand-red)]/15 hover:text-[var(--brand-red)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {syncing ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <CalendarDays size={11} />
                )}
                {syncing
                  ? "Syncing..."
                  : task.employeeGoogleCalendarEventId
                    ? "Update Calendar"
                    : "Sync Calendar"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
