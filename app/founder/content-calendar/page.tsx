"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  ExternalLink,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UserRound,
  Video,
  X,
} from "lucide-react";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import { auth, db } from "@/lib/firebase";

import {
  createFounderCalendarEvent,
  deleteFounderCalendarEvent,
  disconnectFounderCalendar,
  getFounderCalendarConnection,
  listFounderCalendars,
  selectFounderCalendar,
  startFounderCalendarConnection,
  updateFounderCalendarEvent,
  type FounderCalendarConnection,
} from "@/lib/founderGoogleCalendarClient";

type ContentType =
  | "Instagram Reel"
  | "Instagram Post"
  | "Instagram Carousel"
  | "Instagram Story"
  | "YouTube"
  | "Other";

type ContentStatus = "PLANNED" | "IN PROGRESS" | "READY" | "PUBLISHED";

type Client = {
  id: string;
  name?: string;
  company?: string;
  contactPerson?: string;
  active?: boolean;
  deletedAt?: unknown;
};

type TeamMember = {
  id: string;
  name?: string;
  email?: string;
  role?: "founder" | "employee" | "intern";
  department?: string;
  active?: boolean;
};

type ContentItem = {
  id: string;
  title: string;
  client: string;
  clientId?: string;
  type: ContentType;
  date: string;
  time: string;
  endTime: string;
  status: ContentStatus;
  description?: string;

  createdBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;

  assignedTo?: string;
  assignedToName?: string;
  assignedToEmail?: string;

  eventType?: string;
  googleCalendarSync?: boolean;
  googleCalendarEventId?: string;
  googleCalendarId?: string;
  googleCalendarAccount?: string;
  reminderMinutes?: number;
  taskId?: string;
};

type ContentForm = {
  title: string;
  clientId: string;
  client: string;
  assignedTo: string;
  type: ContentType;
  date: string;
  time: string;
  endTime: string;
  status: ContentStatus;
  description: string;
  reminderMinutes: number;
  syncGoogleCalendar: boolean;
};

const CALENDAR_TIME_ZONE = "Asia/Kolkata";

function getCalendarDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function toDateKey(date: Date) {
  const parts = getCalendarDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getCalendarMonth(date: Date) {
  const parts = getCalendarDateParts(date);
  return new Date(Number(parts.year), Number(parts.month) - 1, 1);
}

function getScheduledAt(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }
  const [hours, minutes] = time.split(":").map(Number);
  if (hours > 23 || minutes > 59) return null;
  const dateCheck = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(dateCheck.getTime()) || dateCheck.toISOString().slice(0, 10) !== date) {
    return null;
  }
  const timestamp = Date.parse(`${date}T${time}:00+05:30`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

const contentTypes: ContentType[] = [
  "Instagram Reel",
  "Instagram Post",
  "Instagram Carousel",
  "Instagram Story",
  "YouTube",
  "Other",
];

const statuses: ContentStatus[] = [
  "PLANNED",
  "IN PROGRESS",
  "READY",
  "PUBLISHED",
];

const emptyForm: ContentForm = {
  title: "",
  clientId: "",
  client: "",
  assignedTo: "",
  type: "Instagram Reel",
  date: toDateKey(new Date()),
  time: "18:00",
  endTime: "19:00",
  status: "PLANNED",
  description: "",
  reminderMinutes: 60,
  syncGoogleCalendar: false,
};

function getTypeIcon(type: ContentType) {
  switch (type) {
    case "Instagram Reel":
      return <Film size={16} />;

    case "Instagram Post":
      return <Camera size={16} />;

    case "Instagram Carousel":
      return <LayoutGrid size={16} />;

    case "Instagram Story":
      return <ImageIcon size={16} />;

    case "YouTube":
      return <Video size={16} />;

    default:
      return <Video size={16} />;
  }
}

function getTypeShort(type: ContentType) {
  switch (type) {
    case "Instagram Reel":
      return "REEL";

    case "Instagram Post":
      return "POST";

    case "Instagram Carousel":
      return "CAROUSEL";

    case "Instagram Story":
      return "STORY";

    case "YouTube":
      return "YOUTUBE";

    default:
      return "OTHER";
  }
}

function getStatusClasses(status: ContentStatus) {
  switch (status) {
    case "PUBLISHED":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";

    case "READY":
      return "border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/10 text-[var(--brand-red)]";

    case "IN PROGRESS":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700";

    default:
      return "border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/10 text-[var(--brand-red)]";
  }
}

function formatDate(dateString: string) {
  if (!dateString) return "No date";

  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getMonthLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function getCalendarDays(currentMonth: Date) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const previousMonthDays = new Date(year, month, 0).getDate();

  const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const dayOffset = index - startDay + 1;

    if (dayOffset <= 0) {
      return {
        date: new Date(year, month - 1, previousMonthDays + dayOffset),
        currentMonth: false,
      };
    }

    if (dayOffset > daysInMonth) {
      return {
        date: new Date(year, month + 1, dayOffset - daysInMonth),
        currentMonth: false,
      };
    }

    return {
      date: new Date(year, month, dayOffset),
      currentMonth: true,
    };
  });
}

function getClientDisplayName(client: Client) {
  return client.company || client.name || "Unnamed client";
}

function getTeamMemberDisplayName(member: TeamMember) {
  return member.name || member.email || "Unnamed team member";
}

function getRoleLabel(role?: TeamMember["role"]) {
  if (role === "employee") return "Employee";
  if (role === "intern") return "Intern";
  return "Team Member";
}

export default function ContentCalendarPage() {
  const [taskId, setTaskId] = useState("");
  const [items, setItems] = useState<ContentItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const [loading, setLoading] = useState(true);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(true);

  const [authorized, setAuthorized] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);

  const [currentMonth, setCurrentMonth] = useState(() => getCalendarMonth(new Date()));
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const [typeFilter, setTypeFilter] = useState<ContentType | "ALL">("ALL");

  const [statusFilter, setStatusFilter] = useState<ContentStatus | "ALL">(
    "ALL",
  );

  const [showModal, setShowModal] = useState(false);

  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);

  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [calendarConnection, setCalendarConnection] = useState<FounderCalendarConnection>({ connected: false });
  const [availableCalendars, setAvailableCalendars] = useState<Array<{ id: string; name: string; primary: boolean }>>([]);
  const [calendarBusy, setCalendarBusy] = useState(false);

  const [form, setForm] = useState<ContentForm>(emptyForm);
  const [linkedTask, setLinkedTask] = useState<Record<string, unknown> | null>(
    null,
  );
  const [linkedTaskLoading, setLinkedTaskLoading] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTaskId(
        new URLSearchParams(window.location.search).get("taskId") || "",
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!authorized) return;
    let active = true;
    getFounderCalendarConnection().then(async (connection) => {
      if (!active) return;
      setCalendarConnection(connection);
      if (connection.needsAttention) {
        setMessage("Google Calendar connection needs attention. Reconnect the account to load calendars and sync content.");
      }
      if (connection.connected && connection.accountMatchesTarget === false) {
        setMessage(`Connected as ${connection.email}. Disconnect and reconnect using the The Ant Media Google account before syncing content.`);
      }
      if (connection.connected) {
        const result = await listFounderCalendars();
        if (active) setAvailableCalendars(result.calendars);
      }
    }).catch((error) => { if (active) setMessage(error.message); });
    const params = new URLSearchParams(window.location.search);
    const connectError = params.get("googleCalendarError");
    const connectSuccess = params.has("googleCalendarConnected");
    const feedbackFrame = connectError || connectSuccess
      ? window.requestAnimationFrame(() => setMessage(connectError || "Google Calendar connected successfully."))
      : 0;
    if (connectError || params.has("googleCalendarConnected")) {
      params.delete("googleCalendarError"); params.delete("googleCalendarConnected");
      window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
    }
    return () => { active = false; if (feedbackFrame) window.cancelAnimationFrame(feedbackFrame); };
  }, [authorized]);

  /* =====================================================
     FOUNDER AUTHORIZATION
  ===================================================== */

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthChecking(true);

      if (!user) {
        setAuthorized(false);
        setAuthChecking(false);

        window.location.href = "/";

        return;
      }

      try {
        const profileRef = doc(db, "users", user.uid);

        const profileSnap = await getDoc(profileRef);

        if (!profileSnap.exists()) {
          setAuthorized(false);
          setAuthChecking(false);
          return;
        }

        const profile = profileSnap.data();

        if (profile.role === "founder" && profile.active === true) {
          setAuthorized(true);
        } else {
          setAuthorized(false);
        }
      } catch (error) {
        console.error("Founder authorization error:", error);

        setAuthorized(false);
      }

      setAuthChecking(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authorized || !taskId) {
      const frame = window.requestAnimationFrame(() => setLinkedTask(null));
      return () => window.cancelAnimationFrame(frame);
    }
    let active = true;
    const loadingFrame = window.requestAnimationFrame(() => {
      if (active) setLinkedTaskLoading(true);
    });
    getDoc(doc(db, "tasks", taskId))
      .then((snapshot) => {
        if (!active) return;
        window.cancelAnimationFrame(loadingFrame);
        setLinkedTask(
          snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null,
        );
        setLinkedTaskLoading(false);
      })
      .catch((error) => {
        console.error("Linked task load error:", error);
        window.cancelAnimationFrame(loadingFrame);
        if (active) {
          setLinkedTask(null);
          setLinkedTaskLoading(false);
          setMessage("Unable to load the selected task.");
        }
      });
    return () => {
      active = false;
      window.cancelAnimationFrame(loadingFrame);
    };
  }, [authorized, taskId]);

  useEffect(() => {
    if (!taskId || !items.length) return;
    const existing = items.find((item) => item.taskId === taskId);
    if (!existing) return;
    const date = new Date(`${existing.date}T00:00:00`);
    const frame = window.requestAnimationFrame(() => {
      setSelectedDate(existing.date);
      setForm((current) => ({
        ...current,
        date: existing.date,
        time: existing.time,
        endTime: existing.endTime || "19:00",
      }));
      if (!Number.isNaN(date.getTime()))
        setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [items, taskId]);

  /* =====================================================
     LOAD CONTENT
  ===================================================== */

  useEffect(() => {
    if (!authorized) return;

    const contentRef = collection(db, "calendarEvents");

    const unsubscribe = onSnapshot(
      contentRef,
      (snapshot) => {
        const data: ContentItem[] = snapshot.docs
          .map((item) => {
            const value = item.data();

            return {
              id: item.id,

              title: value.title || "Untitled content",

              client: value.client || "Internal",

              clientId: value.clientId || "",

              type: value.type || "Other",

              date: value.date || "",

              time: value.time || "",

              status: value.status || "PLANNED",

              description: value.description || "",

              createdBy: value.createdBy || "",

              createdAt: value.createdAt,

              updatedAt: value.updatedAt,

              assignedTo: value.assignedTo || "",

              assignedToName: value.assignedToName || "",

              assignedToEmail: value.assignedToEmail || "",

              eventType: value.eventType || "content",

              googleCalendarSync: value.googleCalendarSync === true,

              googleCalendarEventId: value.googleCalendarEventId || "",
              googleCalendarId: value.googleCalendarId || "",
              googleCalendarAccount: value.googleCalendarAccount || "",

              reminderMinutes:
                typeof value.reminderMinutes === "number"
                  ? value.reminderMinutes
                  : 60,
              taskId: value.taskId || "",
              endTime: value.endTime || "",
            };
          })
          .filter(
            (item) =>
              !item.eventType ||
              item.eventType === "content" ||
              item.eventType === "task_schedule",
          );

        setItems(data);
        setLoading(false);
      },
      (error) => {
        console.error("Calendar loading error:", error);

        setMessage(
          "Unable to load calendar data. Please check Firestore permissions.",
        );

        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [authorized]);

  /* =====================================================
     LOAD CLIENTS
  ===================================================== */

  useEffect(() => {
    if (!authorized) return;

    const clientsRef = collection(db, "clients");

    const unsubscribe = onSnapshot(
      clientsRef,
      (snapshot) => {
        const data: Client[] = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<Client, "id">),
          }))
          .filter((client) => client.active !== false && !client.deletedAt)
          .sort((a, b) =>
            getClientDisplayName(a).localeCompare(getClientDisplayName(b)),
          );

        setClients(data);
        setClientsLoading(false);
      },
      (error) => {
        console.error("Client loading error:", error);

        setClients([]);
        setClientsLoading(false);

        setMessage(
          "Unable to load clients. You can still create Internal content.",
        );
      },
    );

    return () => unsubscribe();
  }, [authorized]);

  /* =====================================================
     LOAD TEAM MEMBERS
  ===================================================== */

  useEffect(() => {
    if (!authorized) return;

    const usersRef = collection(db, "users");

    const unsubscribe = onSnapshot(
      usersRef,
      (snapshot) => {
        const data: TeamMember[] = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<TeamMember, "id">),
          }))
          .filter(
            (member) =>
              member.active !== false &&
              (member.role === "employee" || member.role === "intern"),
          )
          .sort((a, b) =>
            getTeamMemberDisplayName(a).localeCompare(
              getTeamMemberDisplayName(b),
            ),
          );

        setTeamMembers(data);
        setTeamLoading(false);
      },
      (error) => {
        console.error("Team members loading error:", error);

        setTeamMembers([]);
        setTeamLoading(false);

        setMessage("Unable to load team members.");
      },
    );

    return () => unsubscribe();
  }, [authorized]);

  /* =====================================================
     FILTERING
  ===================================================== */

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const searchValue = search.toLowerCase().trim();

      const matchesSearch =
        !searchValue ||
        item.title.toLowerCase().includes(searchValue) ||
        item.client.toLowerCase().includes(searchValue) ||
        item.type.toLowerCase().includes(searchValue) ||
        item.description?.toLowerCase().includes(searchValue) ||
        item.assignedToName?.toLowerCase().includes(searchValue);

      const matchesType = typeFilter === "ALL" || item.type === typeFilter;

      const matchesStatus =
        statusFilter === "ALL" || item.status === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [items, search, typeFilter, statusFilter]);

  const visibleScheduleItems = useMemo(() => {
    return filteredItems
      .filter((item) => {
        const scheduledAt = getScheduledAt(item.date, item.time);
        return (
          scheduledAt !== null &&
          scheduledAt > currentTime &&
          (!selectedDate || item.date === selectedDate)
        );
      })
      .sort(
        (a, b) =>
          getScheduledAt(a.date, a.time)! - getScheduledAt(b.date, b.time)!,
      );
  }, [filteredItems, currentTime, selectedDate]);

  useEffect(() => {
    const nextScheduledAt = items.reduce<number | null>((next, item) => {
      const scheduledAt = getScheduledAt(item.date, item.time);
      return scheduledAt !== null && scheduledAt > currentTime
        ? next === null || scheduledAt < next
          ? scheduledAt
          : next
        : next;
    }, null);
    if (nextScheduledAt === null) return;

    const delay = Math.min(
      2_147_000_000,
      Math.max(1, nextScheduledAt - currentTime + 1),
    );
    const timer = window.setTimeout(() => setCurrentTime(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [items, currentTime]);

  const calendarDays = useMemo(() => {
    return getCalendarDays(currentMonth);
  }, [currentMonth]);

  /* =====================================================
     STATISTICS
  ===================================================== */

  const totalContent = items.length;

  const plannedCount = items.filter((item) => item.status === "PLANNED").length;

  const inProgressCount = items.filter(
    (item) => item.status === "IN PROGRESS",
  ).length;

  const readyCount = items.filter((item) => item.status === "READY").length;

  const publishedCount = items.filter(
    (item) => item.status === "PUBLISHED",
  ).length;

  /* =====================================================
     MONTH NAVIGATION
  ===================================================== */

  function previousMonth() {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1),
    );
  }

  function nextMonth() {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1),
    );
  }

  function goToday() {
    const today = new Date();

    setCurrentMonth(getCalendarMonth(today));

    setSelectedDate(toDateKey(today));
  }

  /* =====================================================
     OPEN ADD MODAL
  ===================================================== */

  function openAddModal(date?: string) {
    setEditingItem(null);

    setForm({
      ...emptyForm,
      date: date || toDateKey(new Date()),
    });

    setMessage("");
    setShowModal(true);
  }

  /* =====================================================
     OPEN EDIT MODAL
  ===================================================== */

  function openEditModal(item: ContentItem) {
    setEditingItem(item);

    setForm({
      title: item.title || "",

      clientId: item.clientId || "",

      client: item.client || "",

      assignedTo: item.assignedTo || "",

      type: item.type || "Other",

      date: item.date || toDateKey(new Date()),

      time: item.time || "18:00",
      endTime: item.endTime || "19:00",

      status: item.status || "PLANNED",

      description: item.description || "",

      reminderMinutes: item.reminderMinutes ?? 60,

      syncGoogleCalendar: item.googleCalendarSync === true,
    });

    setMessage("");
    setShowModal(true);
  }

  /* =====================================================
     CLOSE MODAL
  ===================================================== */

  function closeModal() {
    if (saving) return;

    setShowModal(false);
    setEditingItem(null);
    setForm(emptyForm);
  }

  /* =====================================================
     FORM UPDATE
  ===================================================== */

  function updateForm(field: keyof ContentForm, value: string | number) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  /* =====================================================
     CLIENT CHANGE
  ===================================================== */

  function handleClientChange(clientId: string) {
    if (!clientId) {
      setForm((previous) => ({
        ...previous,
        clientId: "",
        client: "Internal",
      }));

      return;
    }

    const client = clients.find((item) => item.id === clientId);

    setForm((previous) => ({
      ...previous,
      clientId,
      client: client ? getClientDisplayName(client) : previous.client,
    }));
  }

  /* =====================================================
     ASSIGNMENT CHANGE
  ===================================================== */

  function handleAssigneeChange(assignedTo: string) {
    setForm((previous) => ({
      ...previous,
      assignedTo,
    }));
  }

  /* =====================================================
     SEND ASSIGNMENT NOTIFICATION
  ===================================================== */

  async function notifyAssignee(
    recipient: TeamMember,
    contentTitle: string,
    contentId: string,
    senderId: string,
  ) {
    try {
      await addDoc(collection(db, "notifications"), {
        userId: recipient.id,

        senderId,

        recipientId: recipient.id,

        direction: "received",

        type: "content_assignment",

        title: "New content assigned",

        message: `You have been assigned "${contentTitle}" in the Content Calendar.`,

        contentId,

        read: false,

        priority: "important",

        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Assignee notification error:", error);
    }
  }

  /* =====================================================
     CREATE / UPDATE CONTENT
  ===================================================== */

  async function scheduleSelectedTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!linkedTask || !taskId || !form.date || !form.time) {
      setMessage("Select a date and time to schedule this task.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const existing = items.find((item) => item.taskId === taskId);
      const payload = {
        title: `Task: ${String(linkedTask.title || "Untitled task")}`,
        description: String(linkedTask.description || ""),
        eventType: "task_schedule",
        taskId,
        assignedTo: String(linkedTask.assignedTo || ""),
        assignedToName: String(linkedTask.assignedToName || ""),
        clientId: String(linkedTask.clientId || ""),
        client: String(
          linkedTask.clientName || linkedTask.client || "Internal",
        ),
        type: "Other" as ContentType,
        date: form.date,
        time: form.time,
        endTime: form.endTime,
        status: "PLANNED" as ContentStatus,
        createdBy: auth.currentUser?.uid || "",
        updatedAt: serverTimestamp(),
      };
      if (existing) {
        await updateDoc(doc(db, "calendarEvents", existing.id), payload);
        setMessage("Task schedule updated.");
      } else {
        const eventRef = await addDoc(collection(db, "calendarEvents"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, "tasks", taskId), {
          calendarEventId: eventRef.id,
          scheduledDate: form.date,
          scheduledTime: form.time,
          updatedAt: serverTimestamp(),
        });
        setMessage("Task scheduled on the calendar.");
      }
      setSelectedDate(form.date);
      const date = new Date(`${form.date}T00:00:00`);
      setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    } catch (error) {
      console.error("Task scheduling failed:", error);
      setMessage("Unable to schedule this task. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveContent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.title.trim()) {
      setMessage("Please enter a content title.");
      return;
    }

    if (!form.date) {
      setMessage("Please select a date.");
      return;
    }

    if (!form.time) {
      setMessage("Please select a time.");
      return;
    }

    if (!form.assignedTo) {
      setMessage("Please assign this content to an employee or intern.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const user = auth.currentUser;

      if (!user) {
        setMessage("Your session has expired. Please login again.");
        return;
      }

      const selectedClient = clients.find(
        (client) => client.id === form.clientId,
      );

      const selectedMember = teamMembers.find(
        (member) => member.id === form.assignedTo,
      );

      if (!selectedMember) {
        setMessage(
          "Selected team member could not be found. Please select again.",
        );
        return;
      }

      const clientName = selectedClient
        ? getClientDisplayName(selectedClient)
        : form.client.trim() || "Internal";

      const calendarInput = {
        title: form.title.trim(),
        description: [
          `Client: ${clientName}`,
          `Content type: ${form.type}`,
          `Assigned to: ${getTeamMemberDisplayName(selectedMember)}`,
          form.description.trim() ? `\n${form.description.trim()}` : "",
        ].filter(Boolean).join("\n"),
        date: form.date,
        time: form.time,
        reminderMinutes: Number(form.reminderMinutes),
        attendeeEmail: selectedMember.email || "",
      };

      const basePayload = {
        title: form.title.trim(),
        clientId: form.clientId || "",
        client: clientName,
        assignedTo: selectedMember.id,
        assignedToName: getTeamMemberDisplayName(selectedMember),
        assignedToEmail: selectedMember.email || "",
        type: form.type,
        date: form.date,
        time: form.time,
        status: form.status,
        description: form.description.trim(),
        eventType: "content",
        reminderMinutes: Number(form.reminderMinutes),
        updatedAt: serverTimestamp(),
      };

      if (editingItem) {
        let googleCalendarSync = editingItem.googleCalendarSync === true;
        let googleCalendarEventId = editingItem.googleCalendarEventId || "";
        let googleCalendarId = editingItem.googleCalendarId || "";
        let googleCalendarAccount = editingItem.googleCalendarAccount || "";
        let calendarWarning = "";

        // Google Calendar is handled after the Firestore update so the
        // management data remains the source of truth.
        await updateDoc(doc(db, "calendarEvents", editingItem.id), {
          ...basePayload,
          googleCalendarSync: false,
          googleCalendarEventId: googleCalendarEventId,
        });

        try {
          if (form.syncGoogleCalendar) {
            if (googleCalendarEventId) {
              if (googleCalendarAccount !== calendarConnection.email || !googleCalendarId) {
                throw new Error("This event was synced to a different or unknown Google account. Remove its old event before syncing it here.");
              }
              await updateFounderCalendarEvent(googleCalendarEventId, { ...calendarInput, googleCalendarCalendarId: googleCalendarId });
            } else {
              const createdEvent = await createFounderCalendarEvent(calendarInput);

              googleCalendarEventId = createdEvent.id || "";
              googleCalendarId = createdEvent.calendarId;
              googleCalendarAccount = createdEvent.account;

              if (!googleCalendarEventId) {
                throw new Error("Google Calendar did not return an event ID.");
              }
            }

            googleCalendarSync = true;
          } else if (googleCalendarEventId) {
            if (googleCalendarAccount !== calendarConnection.email || !googleCalendarId) {
              throw new Error("This event was synced to a different or unknown Google account; it was not deleted.");
            }
            await deleteFounderCalendarEvent(googleCalendarEventId, googleCalendarId);

            googleCalendarEventId = "";
            googleCalendarId = "";
            googleCalendarAccount = "";
            googleCalendarSync = false;
          } else {
            googleCalendarSync = false;
            googleCalendarEventId = "";
          }
        } catch (calendarError) {
          console.error("Google Calendar sync error:", calendarError);

          calendarWarning = ` Google Calendar sync failed: ${calendarError instanceof Error ? calendarError.message : "unknown error"} Please reconnect Google Calendar and retry.`;

          // If sync failed while enabling it, do not mark the Firestore
          // record as synced. If an old event exists, preserve its ID so
          // the user can retry synchronization later.
          if (!editingItem.googleCalendarEventId) {
            if (googleCalendarEventId) {
              try { await deleteFounderCalendarEvent(googleCalendarEventId, googleCalendarId); }
              catch (cleanupError) { console.error("Unable to remove unlinked Google Calendar event:", cleanupError); }
            }
            googleCalendarEventId = "";
            googleCalendarId = "";
            googleCalendarAccount = "";
          }

          googleCalendarSync = false;
        }

        try {
          await updateDoc(doc(db, "calendarEvents", editingItem.id), {
            googleCalendarSync,
            googleCalendarEventId,
            googleCalendarId,
            googleCalendarAccount,
            updatedAt: serverTimestamp(),
          });
        } catch (persistError) {
          if (!editingItem.googleCalendarEventId && googleCalendarEventId) {
            try { await deleteFounderCalendarEvent(googleCalendarEventId, googleCalendarId); }
            catch (cleanupError) { console.error("Unable to remove unlinked Google Calendar event:", cleanupError); }
          }
          throw persistError;
        }

        if (editingItem.assignedTo !== selectedMember.id) {
          await notifyAssignee(
            selectedMember,
            form.title.trim(),
            editingItem.id,
            user.uid,
          );
        }

        setMessage(
          googleCalendarSync
            ? "Content updated and synced with Google Calendar."
            : `Content updated successfully.${calendarWarning}`,
        );
      } else {
        const newContentRef = await addDoc(collection(db, "calendarEvents"), {
          ...basePayload,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          googleCalendarSync: false,
          googleCalendarEventId: "",
        });

        let googleCalendarSync = false;
        let googleCalendarEventId = "";
        let createdCalendarId = "";
        let calendarWarning = "";

        if (form.syncGoogleCalendar) {
          try {
            const createdEvent = await createFounderCalendarEvent(calendarInput);

            googleCalendarEventId = createdEvent.id || "";
            createdCalendarId = createdEvent.calendarId;

            if (!googleCalendarEventId) {
              throw new Error("Google Calendar did not return an event ID.");
            }

            await updateDoc(doc(db, "calendarEvents", newContentRef.id), {
              googleCalendarSync: true,
              googleCalendarEventId,
              googleCalendarId: createdCalendarId,
              googleCalendarAccount: createdEvent.account,
              updatedAt: serverTimestamp(),
            });
            googleCalendarSync = true;
          } catch (calendarError) {
            console.error("Google Calendar create error:", calendarError);

            if (googleCalendarEventId) {
              try { await deleteFounderCalendarEvent(googleCalendarEventId, createdCalendarId); }
              catch (cleanupError) { console.error("Unable to remove unlinked Google Calendar event:", cleanupError); }
              googleCalendarEventId = "";
            }
            googleCalendarSync = false;

            calendarWarning = ` Google Calendar sync failed: ${calendarError instanceof Error ? calendarError.message : "unknown error"} Please reconnect Google Calendar and retry sync.`;
          }
        }

        await notifyAssignee(
          selectedMember,
          form.title.trim(),
          newContentRef.id,
          user.uid,
        );

        setMessage(
          googleCalendarSync
            ? "Content added, assigned and synced with Google Calendar."
            : `Content added and assigned successfully.${calendarWarning}`,
        );
      }

      setForm(emptyForm);
      setShowModal(false);
      setEditingItem(null);
    } catch (error) {
      console.error("Save content error:", error);

      setMessage("Unable to save content. Please check Firestore permissions.");
    } finally {
      setSaving(false);
    }
  }

  /* =====================================================
     UPDATE STATUS
  ===================================================== */

  async function updateContentStatus(item: ContentItem, status: ContentStatus) {
    if (item.status === status) return;

    setUpdatingStatusId(item.id);

    setMessage("");

    try {
      await updateDoc(doc(db, "calendarEvents", item.id), {
        status,
        updatedAt: serverTimestamp(),
      });

      setMessage(`Content marked as ${status}.`);
    } catch (error) {
      console.error("Status update error:", error);

      setMessage("Unable to update content status.");
    } finally {
      setUpdatingStatusId(null);
    }
  }

  /* =====================================================
     DELETE CONTENT
  ===================================================== */

  async function handleDelete(id: string) {
    const confirmed = window.confirm(
      "Delete this calendar item? This action cannot be undone.",
    );

    if (!confirmed) return;

    setDeletingId(id);
    setMessage("");

    try {
      const item = items.find((contentItem) => contentItem.id === id);

      if (!item) {
        throw new Error("Calendar item could not be found.");
      }

      if (item.googleCalendarEventId) {
        if (item.googleCalendarAccount !== calendarConnection.email || !item.googleCalendarId) {
          throw new Error("This event belongs to a different or unknown Google account. Connect the original account to remove it.");
        }
        await deleteFounderCalendarEvent(item.googleCalendarEventId, item.googleCalendarId);
      }

      await deleteDoc(doc(db, "calendarEvents", id));

      setMessage(
        item.googleCalendarEventId
          ? "Calendar item and Google Calendar event deleted successfully."
          : "Calendar item deleted successfully.",
      );
    } catch (error) {
      console.error("Delete content error:", error);

      setMessage(
        "Unable to delete this item. If it was synced, Google Calendar access may be required.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  /* =====================================================
     LOADING
  ===================================================== */

  if (authChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-[var(--brand-black)]">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-red)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/20">
            <CalendarDays size={25} />
          </div>

          <Loader2 size={20} className="animate-spin text-[var(--brand-red)]" />

          <p className="text-sm text-[var(--brand-medium-gray)]">
            Loading founder workspace...
          </p>
        </div>
      </main>
    );
  }

  /* =====================================================
     ACCESS DENIED
  ===================================================== */

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-6 text-[var(--brand-black)]">
        <div className="w-full max-w-lg rounded-3xl border border-red-500/20 bg-red-500/[0.04] p-10 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 text-red-700">
            <CalendarDays size={28} />
          </div>

          <h1 className="text-2xl font-semibold">Founder access required</h1>

          <p className="mt-3 text-sm leading-6 text-[var(--brand-medium-gray)]">
            Only the founder workspace can manage the content calendar.
          </p>

          <button
            onClick={() => {
              window.location.href = "/founder";
            }}
            className="mt-7 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-[var(--brand-red-light)]"
          >
            Return to Founder Workspace
          </button>
        </div>
      </main>
    );
  }

  /* =====================================================
     MAIN PAGE
  ===================================================== */

  return (
    <main className="min-h-screen bg-white text-[var(--brand-black)]">
      {/* BACKGROUND */}

      <div className="pointer-events-none fixed inset-0 overflow-hidden"></div>

      {/* HEADER */}

      <header className="sticky top-0 z-40 border-b border-[var(--brand-border)] bg-white ">
        <div className="flex min-h-[88px] items-center justify-between gap-5 px-6 lg:px-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                window.location.href = taskId ? "/founder/tasks" : "/founder";
              }}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
              title="Back to founder workspace"
            >
              <ArrowLeft size={19} />
            </button>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--brand-red)]">
                Founder / Management
              </p>

              <h1 className="mt-1 text-xl font-semibold tracking-tight">
                Content Calendar
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2 text-xs font-medium text-emerald-700 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_2px_8px_rgba(0,0,0,0.04)]" />
              Workspace Active
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-red)] text-sm font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/20">
              A
            </div>
          </div>
        </div>
      </header>

      {/* BODY */}

      <div className="relative mx-auto max-w-[1700px] px-5 py-8 lg:px-10 lg:py-10">
        {/* HERO */}

        <section className="mb-9">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div>
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[var(--brand-red)]">
                <CalendarDays size={17} />

                <span>Publishing operations</span>
              </div>

              <h2 className="max-w-4xl text-4xl font-bold tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                Plan every piece of content.
                <span className="block text-[var(--brand-red)]">
                  Keep every deadline visible.
                </span>
              </h2>

              <p className="mt-5 max-w-2xl text-sm leading-7 text-[var(--brand-medium-gray)] sm:text-base">
                Manage Instagram, YouTube and client content from one shared
                publishing workspace. Assign every piece of content to the right
                employee or intern and keep its date, status and delivery time
                visible.
              </p>
            </div>

            <button
              onClick={() => openAddModal(selectedDate || undefined)}
              className="group flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--brand-red)] px-6 py-3.5 text-sm font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/20 transition hover:-translate-y-0.5 hover:shadow-black/30"
            >
              <Plus size={18} />
              Add Content
              <ArrowRight
                size={16}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </button>
          </div>
        </section>

        {/* MESSAGE */}

        {message && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/[0.06] px-4 py-3 text-sm text-[var(--brand-red)]">
            <span>{message}</span>

            <button
              onClick={() => setMessage("")}
              className="text-[var(--brand-black)] hover:text-[var(--brand-black)]"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {taskId && (
          <section className="mb-7 rounded-2xl border border-[var(--brand-red-secondary)]/25 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--brand-red)]">
                  Task scheduling
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                  {linkedTaskLoading
                    ? "Loading selected task…"
                    : String(linkedTask?.title || "Selected task unavailable")}
                </h2>
              </div>
              {items.find((item) => item.taskId === taskId) && (
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-700">
                  Already scheduled
                </span>
              )}
            </div>
            {linkedTask && (
              <>
                <p className="mt-2 text-sm text-[var(--brand-medium-gray)]">
                  {String(linkedTask.description || "No description provided.")}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--brand-medium-gray)]">
                  <span>
                    Assigned:{" "}
                    {String(
                      linkedTask.assignedToName ||
                        teamMembers.find(
                          (member) =>
                            member.id ===
                            String(
                              linkedTask.assignedTo ||
                                linkedTask.assignedToId ||
                                "",
                            ),
                        )?.name ||
                        "Unassigned",
                    )}
                  </span>
                  <span>
                    Department: {String(linkedTask.department || "Management")}
                  </span>
                  <span>
                    Client:{" "}
                    {String(
                      linkedTask.clientName || linkedTask.client || "Internal",
                    )}
                  </span>
                  <span>Type: {String(linkedTask.taskType || "Other")}</span>
                  <span>Start: {String(linkedTask.startDate || "—")}</span>
                  <span>
                    Deadline:{" "}
                    {String(
                      linkedTask.deadlineDate || linkedTask.deadline || "—",
                    )}
                    {linkedTask.deadlineTime
                      ? ` at ${String(linkedTask.deadlineTime)}`
                      : ""}
                  </span>
                  <span>
                    Priority: {String(linkedTask.priority || "MEDIUM")}
                  </span>
                  <span>Status: {String(linkedTask.status || "TO DO")}</span>
                </div>
                <form
                  onSubmit={scheduleSelectedTask}
                  className="mt-5 flex flex-wrap items-end gap-3"
                >
                  <label className="text-xs">
                    Calendar date
                    <input
                      type="date"
                      required
                      value={form.date}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          date: event.target.value,
                        }))
                      }
                      className="mt-1 block rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs">
                    Start time
                    <input
                      type="time"
                      required
                      value={form.time}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          time: event.target.value,
                        }))
                      }
                      className="mt-1 block rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-xs">
                    End time
                    <input
                      type="time"
                      required
                      value={form.endTime}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          endTime: event.target.value,
                        }))
                      }
                      className="mt-1 block rounded-lg border border-[var(--brand-border)] px-3 py-2 text-sm"
                    />
                  </label>
                  <button
                    disabled={saving}
                    className="rounded-lg bg-[var(--brand-red)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {saving
                      ? "Saving…"
                      : items.some((item) => item.taskId === taskId)
                        ? "Update schedule"
                        : "Schedule task"}
                  </button>
                </form>
              </>
            )}
            {!linkedTaskLoading && !linkedTask && (
              <p className="mt-3 text-sm text-red-700">
                This task could not be found. It may have been deleted.
              </p>
            )}
          </section>
        )}

        {/* STATS */}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            icon={<CalendarDays size={18} />}
            label="Total content"
            value={totalContent}
            description="Across workspace"
          />

          <StatCard
            icon={<Clock3 size={18} />}
            label="Planned"
            value={plannedCount}
            description="Upcoming"
          />

          <StatCard
            icon={<MoreHorizontal size={18} />}
            label="In progress"
            value={inProgressCount}
            description="Being prepared"
          />

          <StatCard
            icon={<Check size={18} />}
            label="Ready"
            value={readyCount}
            description="Ready to publish"
          />

          <StatCard
            icon={<ExternalLink size={18} />}
            label="Published"
            value={publishedCount}
            description="Successfully published"
          />
        </section>

        {/* TOOLBAR */}

        <section className="mt-8 rounded-2xl border border-[var(--brand-border)] bg-white p-3 ">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search
                size={17}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--brand-black)]"
              />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search content, clients, assignees..."
                className="h-12 w-full rounded-xl border border-[var(--brand-border)] bg-white pl-11 pr-4 text-sm text-[var(--brand-black)] outline-none transition placeholder:text-[var(--brand-black)] focus:border-[var(--brand-red-secondary)]/30"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as ContentType | "ALL")
              }
              className="h-12 rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none"
            >
              <option value="ALL">All content types</option>

              {contentTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as ContentStatus | "ALL")
              }
              className="h-12 rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none"
            >
              <option value="ALL">All statuses</option>

              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* CALENDAR */}

        <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-white ">
          <div className="flex flex-col gap-5 border-b border-[var(--brand-border)] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--brand-medium-gray)]">
                Publishing schedule
              </p>

              <h3 className="mt-1 text-xl font-semibold">
                {getMonthLabel(currentMonth)}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={goToday}
                className="rounded-lg border border-[var(--brand-border)] bg-white px-3 py-2 text-xs font-medium text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
              >
                Today
              </button>

              <button
                onClick={previousMonth}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
              >
                <ChevronLeft size={17} />
              </button>

              <button
                onClick={nextMonth}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-[var(--brand-border)]">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="px-2 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--brand-black)]"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarDays.map(
              ({ date, currentMonth: isCurrentMonth }, index) => {
                const dateKey = toDateKey(date);

                const dayItems = filteredItems
                  .filter((item) => item.date === dateKey)
                  .sort((a, b) => a.time.localeCompare(b.time));

                const todayKey = toDateKey(new Date());

                const isToday = dateKey === todayKey;

                const isSelected = selectedDate === dateKey;

                return (
                  <div
                    key={`${dateKey}-${index}`}
                    onClick={() => setSelectedDate(dateKey)}
                    className={`group min-h-[145px] cursor-pointer border-b border-r border-[var(--brand-border)] p-2 transition sm:min-h-[165px] sm:p-3 ${
                      !isCurrentMonth
                        ? "bg-white opacity-35"
                        : "bg-transparent hover:bg-[var(--brand-red-light)]"
                    } ${
                      isSelected
                        ? "bg-[var(--brand-red)]/[0.04] ring-1 ring-inset ring-[var(--brand-red)]/20"
                        : ""
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold ${
                          isToday
                            ? "bg-[var(--brand-red)] text-[var(--brand-black)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/20"
                            : "text-[var(--brand-black)]"
                        }`}
                      >
                        {date.getDate()}
                      </span>

                      {dayItems.length > 0 && (
                        <span className="text-[9px] font-medium text-[var(--brand-black)]">
                          {dayItems.length}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {dayItems.slice(0, 3).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();

                            openEditModal(item);
                          }}
                          className="group/item block w-full rounded-lg border border-[var(--brand-border)] bg-white p-2 text-left transition hover:border-[var(--brand-red-secondary)]/20 hover:bg-[var(--brand-red)]/[0.05]"
                        >
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5 shrink-0 text-[var(--brand-red)]">
                              {getTypeIcon(item.type)}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[10px] font-semibold text-[var(--brand-dark-gray)]">
                                {item.title}
                              </p>

                              <div className="mt-1 flex items-center gap-1.5 text-[9px] text-[var(--brand-black)]">
                                <span>{item.time}</span>

                                <span>•</span>

                                <span className="truncate">{item.client}</span>
                              </div>

                              {item.assignedToName && (
                                <div className="mt-1 flex items-center gap-1 text-[9px] text-[var(--brand-red)]">
                                  <UserRound size={9} />

                                  <span className="truncate">
                                    {item.assignedToName}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}

                      {dayItems.length > 3 && (
                        <p className="px-1 text-[9px] text-[var(--brand-red)]">
                          +{dayItems.length - 3} more
                        </p>
                      )}
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </section>

        {/* CONTENT QUEUE */}

        <section className="mt-8 rounded-2xl border border-[var(--brand-border)] bg-white ">
          <div className="flex flex-col gap-4 border-b border-[var(--brand-border)] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--brand-medium-gray)]">
                Content queue
              </p>

              <h3 className="mt-1 text-xl font-semibold">
                {selectedDate
                  ? formatDate(selectedDate)
                  : "All scheduled content"}
              </h3>
            </div>

            <span className="text-xs text-[var(--brand-black)]">
              {visibleScheduleItems.length}{" "}
              item
              {visibleScheduleItems.length === 1 ? "" : "s"}{" "}
              shown
            </span>
          </div>

          <div className="divide-y divide-[var(--brand-border)]">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2
                  size={22}
                  className="animate-spin text-[var(--brand-red)]"
                />
              </div>
            ) : visibleScheduleItems.length === 0 ? (
              <div className="px-6 py-20 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--brand-border)] bg-white text-[var(--brand-black)]">
                  <CalendarDays size={24} />
                </div>

                <h4 className="mt-5 text-base font-semibold">
                  No content scheduled
                </h4>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--brand-medium-gray)]">
                  Add your first content item and it will appear here and on the
                  calendar.
                </p>

                <button
                  onClick={() => openAddModal(selectedDate || undefined)}
                  className="mt-6 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--brand-red-light)]"
                >
                  Add content
                </button>
              </div>
            ) : (
              visibleScheduleItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-5 p-5 transition hover:bg-[var(--brand-red-light)] sm:flex-row sm:items-center"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-red)]/10 text-[var(--brand-red)]">
                      {getTypeIcon(item.type)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold">{item.title}</h4>

                        <span className="rounded-md border border-[var(--brand-border)] bg-white px-2 py-1 text-[9px] font-bold text-[var(--brand-black)]">
                          {getTypeShort(item.type)}
                        </span>

                        <span
                          className={`rounded-md border px-2 py-1 text-[9px] font-bold ${getStatusClasses(
                            item.status,
                          )}`}
                        >
                          {item.status}
                        </span>

                        {item.googleCalendarSync && (
                          <span className="flex items-center gap-1 rounded-md border border-emerald-500/15 bg-emerald-500/[0.05] px-2 py-1 text-[9px] font-bold text-emerald-700/80">
                            <CalendarDays size={10} />
                            SYNCED
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--brand-black)]">
                        <span>{item.client}</span>

                        <span>•</span>

                        <span>{formatDate(item.date)}</span>

                        <span>•</span>

                        <span className="flex items-center gap-1">
                          <Clock3 size={12} />

                          {item.time}
                        </span>
                      </div>

                      {item.assignedToName && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--brand-red-secondary)]/10 bg-[var(--brand-red)]/[0.04] px-2.5 py-1.5 text-[10px] text-[var(--brand-red)]">
                            <UserRound size={11} />

                            <span>Assigned to:</span>

                            <span className="font-semibold text-[var(--brand-red)]">
                              {item.assignedToName}
                            </span>
                          </div>

                          {item.assignedToEmail && (
                            <span className="text-[10px] text-[var(--brand-black)]">
                              {item.assignedToEmail}
                            </span>
                          )}
                        </div>
                      )}

                      {item.description && (
                        <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--brand-medium-gray)]">
                          {item.description}
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        {statuses.map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => updateContentStatus(item, status)}
                            disabled={
                              updatingStatusId === item.id ||
                              item.status === status
                            }
                            className={`rounded-lg border px-2.5 py-1.5 text-[9px] font-semibold transition ${
                              item.status === status
                                ? getStatusClasses(status)
                                : "border-[var(--brand-border)] bg-white text-[var(--brand-black)] hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
                            } disabled:cursor-not-allowed`}
                          >
                            {updatingStatusId === item.id &&
                            item.status !== status ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              status
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(item)}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
                        title="Edit content"
                      >
                        <Edit3 size={16} />
                      </button>

                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/10 bg-red-500/[0.03] text-red-700/60 transition hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-700 disabled:opacity-50"
                        title="Delete content"
                      >
                        {deletingId === item.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>
        </section>

        {/* FEATURE CARDS */}

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <FeatureCard
            number="01"
            title="Publishing visibility"
            text="Keep every Reel, Post, Carousel and YouTube item visible against its exact delivery date."
          />

          <FeatureCard
            number="02"
            title="Assigned ownership"
            text="Every content item is assigned to a specific employee or intern, with the assignee stored directly in Firestore."
          />

          <FeatureCard
            number="03"
            title="Calendar ready"
            text="Sync content directly to Google Calendar with a reminder, assigned team member and live synchronization state."
          />
        </section>
      </div>

      {/* =================================================
          ADD / EDIT CONTENT MODAL
      ================================================= */}

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 "
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-[var(--brand-border)] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/60">
            {/* MODAL HEADER */}

            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--brand-border)] bg-white px-6 py-5 ">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brand-red)]">
                  Content planning
                </p>

                <h2 className="mt-1 text-xl font-semibold">
                  {editingItem ? "Edit content" : "Add content"}
                </h2>
              </div>

              <button
                onClick={closeModal}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--brand-border)] bg-white text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
              >
                <X size={17} />
              </button>
            </div>

            {/* FORM */}

            <form onSubmit={handleSaveContent} className="space-y-5 p-6">
              <div>
                <label className="mb-2 block text-xs font-medium text-[var(--brand-black)]">
                  Content title
                </label>

                <input
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  placeholder="e.g. Client A — Instagram Reel"
                  className="h-12 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none placeholder:text-[var(--brand-black)] focus:border-[var(--brand-red-secondary)]/40"
                  required
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-medium text-[var(--brand-black)]">
                    Client
                  </label>

                  <select
                    value={form.clientId}
                    onChange={(event) => handleClientChange(event.target.value)}
                    className="h-12 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none focus:border-[var(--brand-red-secondary)]/40"
                  >
                    <option value="">Internal / No client</option>

                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {getClientDisplayName(client)}
                      </option>
                    ))}
                  </select>

                  {clientsLoading && (
                    <p className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--brand-medium-gray)]">
                      <Loader2 size={11} className="animate-spin" />
                      Loading clients...
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium text-[var(--brand-black)]">
                    Content type
                  </label>

                  <select
                    value={form.type}
                    onChange={(event) =>
                      updateForm("type", event.target.value as ContentType)
                    }
                    className="h-12 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none focus:border-[var(--brand-red-secondary)]/40"
                  >
                    {contentTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ASSIGN TO */}

              <div>
                <label className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--brand-black)]">
                  <UserRound size={13} />
                  Assign To
                </label>

                <select
                  value={form.assignedTo}
                  onChange={(event) => handleAssigneeChange(event.target.value)}
                  className="h-12 w-full rounded-xl border border-[var(--brand-red-secondary)]/15 bg-white px-4 text-sm text-[var(--brand-black)] outline-none focus:border-[var(--brand-red-secondary)]/40"
                  required
                >
                  <option value="">Select Employee / Intern</option>

                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {getTeamMemberDisplayName(member)} —{" "}
                      {getRoleLabel(member.role)}
                      {member.department ? ` • ${member.department}` : ""}
                    </option>
                  ))}
                </select>

                {teamLoading && (
                  <p className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--brand-medium-gray)]">
                    <Loader2 size={11} className="animate-spin" />
                    Loading team members...
                  </p>
                )}

                {!teamLoading && teamMembers.length === 0 && (
                  <p className="mt-2 text-[10px] text-red-700/70">
                    No active employees or interns found.
                  </p>
                )}

                {form.assignedTo && (
                  <div className="mt-2 rounded-xl border border-[var(--brand-red-secondary)]/10 bg-[var(--brand-red)]/[0.04] px-3 py-2">
                    {(() => {
                      const selected = teamMembers.find(
                        (member) => member.id === form.assignedTo,
                      );

                      if (!selected) {
                        return null;
                      }

                      return (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-red)]/10 text-[var(--brand-red)]">
                              <UserRound size={13} />
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-semibold text-[var(--brand-dark-gray)]">
                                {getTeamMemberDisplayName(selected)}
                              </p>

                              <p className="truncate text-[9px] text-[var(--brand-medium-gray)]">
                                {getRoleLabel(selected.role)}

                                {selected.email ? ` • ${selected.email}` : ""}
                              </p>
                            </div>
                          </div>

                          <span className="shrink-0 rounded-md border border-emerald-500/15 bg-emerald-500/[0.05] px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-emerald-700/70">
                            Assigned
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-medium text-[var(--brand-black)]">
                    Date
                  </label>

                  <input
                    type="date"
                    value={form.date}
                    onChange={(event) => updateForm("date", event.target.value)}
                    className="h-12 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none focus:border-[var(--brand-red-secondary)]/40"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium text-[var(--brand-black)]">
                    Time
                  </label>

                  <input
                    type="time"
                    value={form.time}
                    onChange={(event) => updateForm("time", event.target.value)}
                    className="h-12 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none focus:border-[var(--brand-red-secondary)]/40"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-[var(--brand-black)]">
                  Status
                </label>

                <select
                  value={form.status}
                  onChange={(event) =>
                    updateForm("status", event.target.value as ContentStatus)
                  }
                  className="h-12 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none focus:border-[var(--brand-red-secondary)]/40"
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-[var(--brand-black)]">
                  Calendar reminder
                </label>

                <select
                  value={form.reminderMinutes}
                  onChange={(event) =>
                    updateForm("reminderMinutes", Number(event.target.value))
                  }
                  className="h-12 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none focus:border-[var(--brand-red-secondary)]/40"
                >
                  <option value={-1}>No reminder</option>
                  <option value={0}>At time of event</option>
                  <option value={10}>10 minutes before</option>
                  <option value={15}>15 minutes before</option>

                  <option value={30}>30 minutes before</option>

                  <option value={60}>1 hour before</option>

                  <option value={120}>2 hours before</option>

                  <option value={1440}>1 day before</option>
                </select>

        <p className="mt-2 text-[10px] leading-5 text-[var(--brand-medium-gray)]">
                  This reminder value is stored with the content event and will
                  be used for Google Calendar synchronization.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-[var(--brand-black)]">
                  Description
                </label>

                <textarea
                  value={form.description}
                  onChange={(event) =>
                    updateForm("description", event.target.value)
                  }
                  placeholder="Add a short content brief..."
                  rows={4}
                  className="w-full resize-none rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 text-sm text-[var(--brand-black)] outline-none placeholder:text-[var(--brand-black)] focus:border-[var(--brand-red-secondary)]/40"
                />
              </div>

              <div className="rounded-2xl border border-[var(--brand-red-secondary)]/15 bg-[var(--brand-red)]/[0.05] p-4">
                <div className="flex items-start gap-3">
                  <CalendarDays
                    size={18}
                    className="mt-0.5 shrink-0 text-[var(--brand-red)]"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold text-[var(--brand-red)]">
                          Google Calendar
                        </p>

                        <p className="mt-1 text-[10px] leading-5 text-[var(--brand-medium-gray)]">
                          Create a calendar event for this content, attach the
                          selected reminder and invite the assigned team member
                          when an email is available.
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={!calendarConnection.connected || (calendarConnection.accountMatchesTarget === false && !form.syncGoogleCalendar)}
                        onClick={() =>
                          setForm((previous) => ({
                            ...previous,
                            syncGoogleCalendar: !previous.syncGoogleCalendar,
                          }))
                        }
                        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                          form.syncGoogleCalendar
                            ? "bg-[var(--brand-red)]"
                            : "bg-white"
                        }`}
                        aria-label="Toggle Google Calendar sync"
                      >
                        <span
                          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${
                            form.syncGoogleCalendar ? "left-6" : "left-1"
                          }`}
                        />
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-lg border px-2.5 py-1.5 text-[9px] font-semibold ${
                          form.syncGoogleCalendar
                            ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-700"
                            : "border-[var(--brand-border)] bg-white text-[var(--brand-black)]"
                        }`}
                      >
                        {editingItem?.googleCalendarSync && form.syncGoogleCalendar
                          ? "✓ SYNCED TO THE ANT MEDIA CALENDAR"
                          : form.syncGoogleCalendar ? "SYNC ENABLED" : "SYNC OFF"}
                      </span>

                      {form.syncGoogleCalendar && (
                        <span className="text-[9px] text-[var(--brand-black)]">
                          Reminder:{" "}
                          {form.reminderMinutes < 0
                            ? "no reminder"
                            : form.reminderMinutes === 0
                              ? "at event time"
                            : form.reminderMinutes === 1440
                            ? "1 day before"
                            : form.reminderMinutes === 120
                              ? "2 hours before"
                              : form.reminderMinutes === 60
                                ? "1 hour before"
                                : `${form.reminderMinutes} minutes before`}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 rounded-xl border border-[var(--brand-border)] bg-white p-3">
                    {calendarConnection.connected ? (
                        <>
                          <p className={`text-[10px] font-semibold ${calendarConnection.accountMatchesTarget === false ? "text-amber-700" : "text-emerald-700"}`}>
                            {calendarConnection.accountMatchesTarget === false ? `Connected as ${calendarConnection.email}` : `Connected · ${calendarConnection.email}`}
                          </p>
                          {calendarConnection.accountMatchesTarget === false && (
                            <p className="mt-1 text-[10px] leading-4 text-amber-700">This is not the official account. Disconnect and reconnect as theantmediaa@gmail.com to sync content.</p>
                          )}
                          <label className="mt-2 block text-[10px] text-[var(--brand-medium-gray)]" htmlFor="google-calendar-select">Calendar</label>
                          <select id="google-calendar-select" value={calendarConnection.calendarId || ""} disabled={calendarBusy} onChange={async (event) => {
                            setCalendarBusy(true);
                            try { await selectFounderCalendar(event.target.value); setCalendarConnection(await getFounderCalendarConnection()); setMessage("Google Calendar selection updated."); }
                            catch (error) { setMessage(error instanceof Error ? error.message : "Unable to select calendar."); }
                            finally { setCalendarBusy(false); }
                          }} className="mt-1 h-9 w-full rounded-lg border border-[var(--brand-border)] bg-white px-2 text-xs text-[var(--brand-black)]">
                            {availableCalendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}{calendar.primary ? " · Primary" : ""}</option>)}
                          </select>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button type="button" disabled={calendarBusy} onClick={async () => { setCalendarBusy(true); try { await startFounderCalendarConnection(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to start Google connection."); setCalendarBusy(false); } }} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-[10px] font-semibold text-[var(--brand-black)] disabled:opacity-50">Reconnect</button>
                            <button type="button" disabled={calendarBusy} onClick={async () => { setCalendarBusy(true); try { await disconnectFounderCalendar(); setCalendarConnection({ connected: false }); setAvailableCalendars([]); setForm((previous) => ({ ...previous, syncGoogleCalendar: false })); setMessage("Google Calendar disconnected."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to disconnect Google Calendar."); } finally { setCalendarBusy(false); } }} className="rounded-lg border border-red-200 px-3 py-1.5 text-[10px] font-semibold text-red-700 disabled:opacity-50">Disconnect</button>
                          </div>
                        </>
                      ) : calendarConnection.needsAttention ? (
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-semibold text-amber-700">Connection needs attention</p>
                            {calendarConnection.email && <p className="mt-0.5 text-[10px] text-[var(--brand-medium-gray)]">{calendarConnection.email}</p>}
                          </div>
                          <button type="button" disabled={calendarBusy} onClick={async () => { setCalendarBusy(true); try { await startFounderCalendarConnection(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to start Google connection."); setCalendarBusy(false); } }} className="rounded-lg bg-[var(--brand-red)] px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-50">Reconnect Google Calendar</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[10px] text-[var(--brand-medium-gray)]">Not connected</p>
                          <button type="button" disabled={calendarBusy} onClick={async () => { setCalendarBusy(true); try { await startFounderCalendarConnection(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to start Google connection."); setCalendarBusy(false); } }} className="rounded-lg bg-[var(--brand-red)] px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-50">Connect Google Calendar</button>
                        </div>
                      )}
                    </div>

                    {editingItem?.googleCalendarEventId &&
                      form.syncGoogleCalendar && (
                        <p className="mt-3 text-[9px] text-emerald-700/60">
                          Existing Google Calendar event will be updated when
                          you save.
                        </p>
                      )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--brand-red-secondary)]/10 bg-[var(--brand-red)]/[0.035] p-4">
                <div className="flex items-start gap-3">
                  <UserRound
                    size={17}
                    className="mt-0.5 shrink-0 text-[var(--brand-red)]"
                  />

                  <div>
                    <p className="text-xs font-semibold text-[var(--brand-red)]">
                      Assignment notification
                    </p>

                    <p className="mt-1 text-[10px] leading-5 text-[var(--brand-medium-gray)]">
                      When this content is created, the assigned employee or
                      intern will receive an in-app notification automatically.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-[var(--brand-border)] pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-xl border border-[var(--brand-border)] bg-white px-5 py-3 text-sm font-medium text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)] disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-red)] px-6 py-3 text-sm font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/20 transition hover:shadow-black/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      {editingItem ? <Check size={16} /> : <Plus size={16} />}

                      {editingItem ? "Save Changes" : "Add & Assign"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

/* =====================================================
   REUSABLE COMPONENTS
===================================================== */

function StatCard({
  icon,
  label,
  value,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-5  transition hover:-translate-y-0.5 hover:bg-[var(--brand-red-light)]">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-red)]/10 text-[var(--brand-red)]">
        {icon}
      </div>

      <p className="mt-6 text-xs text-[var(--brand-medium-gray)]">{label}</p>

      <p className="mt-1 text-3xl font-bold">{value}</p>

      <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
        {description}
      </p>
    </div>
  );
}

function FeatureCard({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-6">
      <p className="text-[10px] font-bold tracking-[0.2em] text-[var(--brand-red)]">
        {number}
      </p>

      <h3 className="mt-5 text-lg font-semibold">{title}</h3>

      <p className="mt-2 text-sm leading-6 text-[var(--brand-medium-gray)]">
        {text}
      </p>
    </div>
  );
}
