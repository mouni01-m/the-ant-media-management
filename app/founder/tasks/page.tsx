"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Sparkles,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";

import { onAuthStateChanged } from "firebase/auth";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import ClientSelector from "@/app/components/client-selector";

type UserProfile = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  department?: string;
  active?: boolean;
};

type Client = {
  id: string;
  name?: string;
  company?: string;
  active?: boolean;
  contactPerson?: string;
  accountStatus?: string;
  deletedAt?: unknown;
};

type ClientWork = { id: string; clientId: string; name: string; status?: string };

type Task = {
  id: string;

  title?: string;
  description?: string;

  assignedTo?: string;
  assignedToId?: string;
  assignedToName?: string;

  clientId?: string;
  client?: string;
  clientName?: string;
  workId?: string | null;

  department?: string;
  taskType?: string;

  priority?: string;
  status?: string;

  startDate?: string;
  deadline?: string;
  deadlineDate?: string;
  deadlineTime?: string;

  // Legacy Firebase Storage fields retained for backwards compatibility.
  attachmentUrls?: string[];
  attachmentNames?: string[];

  // Google Drive reference for the task.
  referenceDriveUrl?: string;
  referenceDriveType?: "google_drive";

  submissionUrl?: string;
  submissionName?: string;
  submissionNote?: string;
  submittedBy?: string;
  submittedByName?: string;
  submissionAt?: unknown;
  feedback?: string;
  reviewComment?: string;
  approvedAt?: unknown;
  approvedBy?: string;
  approvedByName?: string;
  reviewedAt?: unknown;
  reviewedBy?: string;
  reviewedByName?: string;

  calendarReminder?: boolean;
  calendarEventId?: string;
  googleCalendarSync?: boolean;
  googleCalendarEventId?: string;

  // Team task support.
  assignmentType?: "single" | "team";
  teamMemberIds?: string[];
  teamMembers?: Array<{
    id: string;
    name?: string;
    email?: string;
    role?: string;
    department?: string;
    isTeamLead?: boolean;
  }>;
  teamLeadId?: string;
  teamLeadName?: string;
  submitterMode?: "selected" | "anybody";
  submitterId?: string;
  submitterName?: string;
  changeRecipientIds?: string[];
  changeRecipientNames?: string[];
  submittedById?: string;

  // Employee task deletion permission workflow.
  deleteRequestStatus?: "none" | "pending" | "approved" | "rejected";
  deleteRequestedBy?: string;
  deleteRequestedByName?: string;
  deleteRequestedAt?: unknown;
  deleteReviewedAt?: unknown;
  deleteReviewedBy?: string;
  deleteReviewedByName?: string;
  deleteReviewMessage?: string;

  createdBy?: string;
  createdByName?: string;

  createdAt?: unknown;
  updatedAt?: unknown;
  deleted?: boolean;
  isDeleted?: boolean;
  deletedAt?: unknown;
};

type FounderSession = {
  uid: string;
  name?: string;
  email?: string;
  role?: string;
  active?: boolean;
};

const DEPARTMENTS = ["Management", "Editor", "Content", "Development"];

const TASK_TYPES = [
  "Website Development",
  "Content Writing",
  "Video Editing",
  "Social Media",
  "Design",
  "Research",
  "Other",
];

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const STATUSES = [
  "TO DO",
  "IN PROGRESS",
  "SUBMITTED",
  "CHANGES REQUESTED",
  "APPROVED",
  "COMPLETED",
];

function normalizeStatus(value?: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "_")
    .trim();
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

function isTaskOverdue(task: Task) {
  const raw = task.deadlineDate || task.deadline;
  if (
    !raw ||
    isFinalTaskStatus(task.status) ||
    task.deleted === true ||
    task.isDeleted === true ||
    task.deletedAt
  )
    return false;
  const rawString = String(raw);
  const deadlineValue = rawString.includes("T")
    ? rawString
    : task.deadlineTime
      ? `${rawString}T${task.deadlineTime}`
      : `${rawString}T23:59:59`;
  const deadline = new Date(deadlineValue);
  return !Number.isNaN(deadline.getTime()) && deadline.getTime() < Date.now();
}

function isFinalTaskStatus(status?: string) {
  return normalizeStatus(status) === "completed";
}

function isSubmittedTask(status?: string) {
  return ["submitted", "review"].includes(normalizeStatus(status));
}

function isChangesTask(status?: string) {
  return ["changes_requested", "changes"].includes(normalizeStatus(status));
}

function formatDateTime(value?: unknown) {
  if (!value) return "";

  try {
    const date =
      value instanceof Date
        ? value
        : typeof value === "object" &&
            value !== null &&
            "toDate" in value &&
            typeof value.toDate === "function"
          ? value.toDate()
          : typeof value === "string" || typeof value === "number"
            ? new Date(value)
            : null;

    if (!date || Number.isNaN(date.getTime())) return "";

    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function getDateMillis(value: unknown) {
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
  return 0;
}

function formatDate(dateValue?: string) {
  if (!dateValue) return "Not set";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getPriorityClass(priority?: string) {
  switch (priority) {
    case "URGENT":
      return "border-red-500/20 bg-red-500/10 text-red-700";

    case "HIGH":
      return "border-orange-500/20 bg-orange-500/10 text-orange-700";

    case "MEDIUM":
      return "border-yellow-500/20 bg-yellow-500/10 text-yellow-300";

    default:
      return "border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/10 text-[var(--brand-red)]";
  }
}

function getStatusClass(status?: string) {
  switch (status) {
    case "COMPLETED":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";

    case "APPROVED":
      return "border-cyan-500/20 bg-cyan-500/10 text-cyan-300";

    case "SUBMITTED":
      return "border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/10 text-[var(--brand-red)]";

    case "CHANGES REQUESTED":
      return "border-orange-500/20 bg-orange-500/10 text-orange-700";

    case "IN PROGRESS":
      return "border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/10 text-[var(--brand-red)]";

    default:
      return "border-[var(--brand-border)] bg-white text-[var(--brand-black)]";
  }
}

export default function FounderTasksPage() {
  const [currentUser, setCurrentUser] = useState<FounderSession | null>(null);

  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientWork, setClientWork] = useState<ClientWork[]>([]);

  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [workFilter, setWorkFilter] = useState("");
  const [taskViewFilter, setTaskViewFilter] = useState<
    "all" | "active" | "overdue"
  >("all");

  const [showCreateModal, setShowCreateModal] = useState(false);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState(false);

  const [creating, setCreating] = useState(false);

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [reviewLoading, setReviewLoading] = useState<string | null>(null);

  const [showChangesModal, setShowChangesModal] = useState(false);

  const [reviewFeedback, setReviewFeedback] = useState("");

  const [deleteReviewLoading, setDeleteReviewLoading] = useState<string | null>(
    null,
  );

  const [changeRecipientIds, setChangeRecipientIds] = useState<string[]>([]);

  const [assignmentType, setAssignmentType] = useState<"single" | "team">(
    "single",
  );

  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([]);

  const [teamLeadId, setTeamLeadId] = useState("");

  const [submitterMode, setSubmitterMode] = useState<"selected" | "anybody">(
    "selected",
  );

  const [submitterId, setSubmitterId] = useState("");

  const [form, setForm] = useState({
    title: "",
    description: "",
    assignedTo: "",
    clientId: "",
    workId: "",
    department: "Development",
    taskType: "Website Development",
    priority: "MEDIUM",
    startDate: new Date().toISOString().split("T")[0],
    deadlineDate: "",
    deadlineTime: "18:00",
    calendarReminder: true,
    referenceDriveUrl: "",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const requestedFilter = params.get("filter");
    const requestedEmployee = params.get("employee") || "";
    if (
      params.get("create") !== "1" &&
      !requestedEmployee &&
      requestedFilter !== "active" &&
      requestedFilter !== "overdue"
    )
      return;

    const frame = window.requestAnimationFrame(() => {
      if (requestedFilter === "active" || requestedFilter === "overdue") {
        setTaskViewFilter(requestedFilter);
      }
      if (requestedEmployee) setEmployeeFilter(requestedEmployee);
      if (params.get("create") === "1") {
        resetForm();
        setShowCreateModal(true);
        window.history.replaceState({}, "", "/founder/tasks");
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const taskId = new URLSearchParams(window.location.search).get("taskId");
    if (taskId) {
      const findTask = () => {
        const matched = tasks.find((task) => task.id === taskId);
        if (matched) setSelectedTask(matched);
      };
      findTask();
    }
  }, [tasks]);

  const selectedSingleUser =
    users.find((user) => user.id === form.assignedTo) || null;
  const selectedTaskClient = selectedTask?.clientId
    ? clients.find((client) => client.id === selectedTask.clientId)
    : clients.find((client) => client.name === (selectedTask?.clientName || selectedTask?.client) || client.company === (selectedTask?.clientName || selectedTask?.client));

  const selectedTeamMembers = users.filter((user) =>
    teamMemberIds.includes(user.id),
  );

  const selectedTeamLead = users.find((user) => user.id === teamLeadId) || null;

  /*
   * AUTHENTICATION
   */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (process.env.NODE_ENV === "development") {
        const currentUser = auth.currentUser;
        console.info("[Founder tasks] Firebase Auth user", {
          uid: currentUser?.uid,
          email: currentUser?.email,
        });
      }
      if (!user) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[Founder tasks] Firebase Auth has no signed-in user.");
        }
        setAuthorized(false);
        setLoading(false);
        setCheckingAuth(false);
        return;
      }

      try {
        const userRef = doc(db, "users", user.uid);

        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : null;

        if (process.env.NODE_ENV === "development") {
          console.info("[Founder tasks] Founder profile authorization", {
            uid: user.uid,
            exists: userSnap.exists(),
            role: userData?.role,
            active: userData?.active,
          });
        }

        if (!userSnap.exists()) {
          setAuthorized(false);
          setLoading(false);
          setCheckingAuth(false);
          return;
        }

        if (userData?.role !== "founder" || userData.active !== true) {
          setAuthorized(false);
          setLoading(false);
          setCheckingAuth(false);
          return;
        }

        setCurrentUser({
          uid: user.uid,
          ...userData,
        });

        setAuthorized(true);
      } catch (error) {
        console.error("Founder authentication error:", error);

        setAuthorized(false);
      }

      setLoading(false);
      setCheckingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  /*
   * LOAD TASKS
   */
  useEffect(() => {
    if (!authorized) return;

    const tasksRef = collection(db, "tasks");

    const unsubscribe = onSnapshot(
      tasksRef,
      (snapshot) => {
        const taskData: Task[] = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as Task[];

        taskData.sort((a, b) => {
          const aTime = getDateMillis(a.createdAt);

          const bTime = getDateMillis(b.createdAt);

          return bTime - aTime;
        });

        setTasks(taskData);
      },
      (error) => {
        console.error("[Founder tasks] Firestore read denied/failed: tasks", {
          uid: auth.currentUser?.uid,
          code: error.code,
          message: error.message,
        });
      },
    );

    return () => unsubscribe();
  }, [authorized]);

  /*
   * LOAD TEAM MEMBERS
   */
  useEffect(() => {
    if (!authorized) return;

    async function loadUsers() {
      try {
        const usersSnapshot = await getDocs(collection(db, "users"));

        const data: UserProfile[] = usersSnapshot.docs
          .map(
            (item) =>
              ({
                id: item.id,
                ...item.data(),
              }) as UserProfile,
          )
          .filter((item) => {
            return (
              item.active === true &&
              (item.role === "employee" || item.role === "intern")
            );
          }) as UserProfile[];

        data.sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || "")),
        );

        setUsers(data);
      } catch (error) {
        console.error("[Founder tasks] Firestore read denied/failed: users", {
          uid: auth.currentUser?.uid,
          error,
        });
      }
    }

    loadUsers();
  }, [authorized]);

  /*
   * LOAD CLIENTS
   */
  useEffect(() => {
    if (!authorized) return;

    async function loadClients() {
      try {
        const clientsSnapshot = await getDocs(collection(db, "clients"));

        const data: Client[] = clientsSnapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as Client[];

        setClients(data.filter((client) => !client.deletedAt && client.active !== false && client.accountStatus !== "Archived"));
        try {
          const workSnapshot = await getDocs(collection(db, "clientWork"));
          setClientWork(workSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as ClientWork));
        } catch (error) {
          setClientWork([]);
          console.error(
            "[Founder tasks] Firestore read denied/failed: clientWork",
            { uid: auth.currentUser?.uid, error },
          );
        }
      } catch (error) {
        console.error("[Founder tasks] Firestore read denied/failed: clients", {
          uid: auth.currentUser?.uid,
          error,
        });
      }
    }

    loadClients();
  }, [authorized]);

  /*
   * FILTERED TASKS
   */
  const filteredTasks = useMemo(() => {
    const queryText = search.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesSearch =
        !queryText ||
        String(task.title || "")
          .toLowerCase()
          .includes(queryText) ||
        String(task.description || "")
          .toLowerCase()
          .includes(queryText) ||
        String(task.assignedToName || "")
          .toLowerCase()
          .includes(queryText) ||
        String(task.clientName || task.client || "")
          .toLowerCase()
          .includes(queryText);

      const matchesStatus =
        statusFilter === "ALL" ||
        normalizeStatus(task.status) === normalizeStatus(statusFilter);

      const matchesPriority =
        priorityFilter === "ALL" || task.priority === priorityFilter;

      const matchesEmployee =
        !employeeFilter ||
        task.assignedTo === employeeFilter ||
        task.assignedToId === employeeFilter ||
        task.teamLeadId === employeeFilter ||
        (task.teamMemberIds || []).includes(employeeFilter) ||
        (task.teamMembers || []).some((member) => member.id === employeeFilter);

      const matchesView =
        taskViewFilter === "all" ||
        (taskViewFilter === "active" && isActiveTask(task)) ||
        (taskViewFilter === "overdue" && isTaskOverdue(task));

      const selectedFilterClient = clients.find((client) => client.id === clientFilter);
      const matchesClient = !clientFilter || task.clientId === clientFilter || (!task.clientId && Boolean(selectedFilterClient && [selectedFilterClient.name, selectedFilterClient.company].includes(task.clientName || task.client || "")));
      const matchesWork = !workFilter || task.workId === workFilter;
      return matchesSearch && matchesStatus && matchesPriority && matchesEmployee && matchesView && matchesClient && matchesWork;
    });
  }, [tasks, clients, search, statusFilter, priorityFilter, employeeFilter, taskViewFilter, clientFilter, workFilter]);

  const worksForSelectedClient = clientWork.filter((work) => work.clientId === form.clientId);
  const worksForFilterClient = clientWork.filter((work) => work.clientId === clientFilter);

  /*
   * STATISTICS
   */
  const totalTasks = tasks.length;

  const activeTasks = tasks.filter((task) => isActiveTask(task)).length;

  const reviewTasks = tasks.filter((task) =>
    isSubmittedTask(task.status),
  ).length;

  const completedTasks = tasks.filter(
    (task) => normalizeStatus(task.status) === "completed",
  ).length;

  const urgentTasks = tasks.filter((task) => task.priority === "URGENT").length;

  const overdueTasks = tasks.filter(isTaskOverdue).length;

  /*
   * RESET FORM
   */
  function resetForm() {
    setAssignmentType("single");
    setTeamMemberIds([]);
    setTeamLeadId("");
    setSubmitterMode("selected");
    setSubmitterId("");

    setForm({
      title: "",
      description: "",
      assignedTo: "",
      clientId: "",
      workId: "",
      department: "Development",
      taskType: "Website Development",
      priority: "MEDIUM",
      startDate: new Date().toISOString().split("T")[0],
      deadlineDate: "",
      deadlineTime: "18:00",
      calendarReminder: true,
      referenceDriveUrl: "",
    });

    setMessage("");
    setErrorMessage("");
  }

  /*
   * CREATE TASK
   *
   * Supports:
   * - Single Employee: existing normal workflow.
   * - Create Team: one shared task with multiple members, a team lead
   *   and a submitter rule (selected person or anybody).
   */
  async function handleCreateTask(event: React.FormEvent) {
    event.preventDefault();

    setMessage("");
    setErrorMessage("");

    if (!currentUser) {
      setErrorMessage("Founder session not available.");
      return;
    }

    if (!form.title.trim()) {
      setErrorMessage("Task title is required.");
      return;
    }

    if (!form.deadlineDate) {
      setErrorMessage("Please select a deadline date.");
      return;
    }

    if (assignmentType === "single" && !form.assignedTo) {
      setErrorMessage("Please select a team member.");
      return;
    }

    if (assignmentType === "team" && teamMemberIds.length < 2) {
      setErrorMessage("Select at least 2 team members for a team task.");
      return;
    }

    if (assignmentType === "team" && !teamLeadId) {
      setErrorMessage("Please select a Team Lead from the selected members.");
      return;
    }

    if (assignmentType === "team" && !teamMemberIds.includes(teamLeadId)) {
      setErrorMessage("Team Lead must be one of the selected team members.");
      return;
    }

    if (
      assignmentType === "team" &&
      submitterMode === "selected" &&
      !submitterId
    ) {
      setErrorMessage("Select who is going to submit the team task.");
      return;
    }

    if (
      assignmentType === "team" &&
      submitterMode === "selected" &&
      !teamMemberIds.includes(submitterId)
    ) {
      setErrorMessage("The selected submitter must belong to the team.");
      return;
    }

  const selectedClient = clients.find(
      (client) => client.id === form.clientId,
    );

    const referenceDriveUrl = form.referenceDriveUrl.trim();

    if (referenceDriveUrl) {
      const isGoogleDriveLink =
        referenceDriveUrl.startsWith("https://drive.google.com/") ||
        referenceDriveUrl.startsWith("https://docs.google.com/");

      if (!isGoogleDriveLink) {
        setErrorMessage(
          "Please enter a valid Google Drive or Google Docs link.",
        );
        return;
      }
    }

    const singleUser =
      assignmentType === "single"
        ? users.find((user) => user.id === form.assignedTo) || null
        : null;

    if (assignmentType === "single" && !singleUser) {
      setErrorMessage("Selected team member could not be found.");
      return;
    }

    const teamMembers =
      assignmentType === "team"
        ? selectedTeamMembers.map((member) => ({
            id: member.id,
            name: member.name || member.email || "Team Member",
            email: member.email || "",
            role: member.role || "Team Member",
            department: member.department || "",
            isTeamLead: member.id === teamLeadId,
          }))
        : [];

    setCreating(true);

    try {
      if (!form.clientId && form.workId) {
        throw new Error("A work item must be linked to a client.");
      }
      if (form.clientId) {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error("Founder login required.");
        const validation = await fetch("/api/client-work/validate-task-link", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: form.clientId, workId: form.workId || null }),
          cache: "no-store",
        });
        const validationBody = await validation.json().catch(() => ({}));
        if (!validation.ok) throw new Error(validationBody.error || "Unable to validate the selected client and work.");
      }
      const deadline = `${form.deadlineDate}T${form.deadlineTime}`;

      const primaryAssignee =
        assignmentType === "single" ? singleUser : selectedTeamLead;

      if (!primaryAssignee) {
        throw new Error("A primary assignee could not be determined.");
      }

      const submitter =
        assignmentType === "team" && submitterMode === "selected"
          ? users.find((user) => user.id === submitterId) || null
          : null;

      const taskData: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim(),

        // Keep assignedTo populated for backwards compatibility and
        // for the team lead/primary assignee.
        assignedTo: primaryAssignee.id,
        assignedToId: primaryAssignee.id,
        assignedToName:
          primaryAssignee.name || primaryAssignee.email || "Team Member",
        assignedToEmail: primaryAssignee.email || "",

        assignmentType,
        teamMemberIds:
          assignmentType === "team" ? teamMemberIds : [primaryAssignee.id],
        teamMembers:
          assignmentType === "team"
            ? teamMembers
            : [
                {
                  id: primaryAssignee.id,
                  name:
                    primaryAssignee.name ||
                    primaryAssignee.email ||
                    "Team Member",
                  email: primaryAssignee.email || "",
                  role: primaryAssignee.role || "Team Member",
                  department: primaryAssignee.department || "",
                  isTeamLead: false,
                },
              ],

        teamLeadId: assignmentType === "team" ? teamLeadId : null,
        teamLeadName:
          assignmentType === "team"
            ? selectedTeamLead?.name || selectedTeamLead?.email || ""
            : null,

        submitterMode: assignmentType === "team" ? submitterMode : "selected",
        submitterId:
          assignmentType === "team" && submitterMode === "selected"
            ? submitter?.id || ""
            : assignmentType === "single"
              ? primaryAssignee.id
              : null,
        submitterName:
          assignmentType === "team" && submitterMode === "selected"
            ? submitter?.name || submitter?.email || ""
            : assignmentType === "single"
              ? primaryAssignee.name || primaryAssignee.email || ""
              : null,

        clientId: form.clientId || null,
        workId: form.clientId && form.workId ? form.workId : null,
        clientName: selectedClient
          ? selectedClient.name || selectedClient.company || ""
          : "",
        client: selectedClient
          ? selectedClient.name || selectedClient.company || ""
          : "",

        department: form.department,
        taskType: form.taskType,
        priority: form.priority,
        status: "TO DO",

        startDate: form.startDate,
        deadlineDate: form.deadlineDate,
        deadlineTime: form.deadlineTime,
        deadline,

        referenceDriveUrl,
        referenceDriveType: referenceDriveUrl ? "google_drive" : null,

        calendarReminder: form.calendarReminder,

        // No employee deletion request exists when a task is created.
        deleteRequestStatus: "none",

        createdBy: currentUser.uid,
        createdByName: currentUser.name || currentUser.email || "Founder",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const taskRef = await addDoc(collection(db, "tasks"), taskData);

      /*
       * NOTIFICATIONS
       *
       * Team task:
       * - Selected submitter -> only that member is told to submit.
       * - Anybody -> every selected member is told anybody can submit.
       *
       * Single task keeps the existing normal notification.
       */
      const notificationRecipients =
        assignmentType === "team"
          ? selectedTeamMembers
          : singleUser
            ? [singleUser]
            : [];

      for (const member of notificationRecipients) {
        const isSelectedSubmitter =
          assignmentType === "team" &&
          submitterMode === "selected" &&
          member.id === submitterId;

        const notificationMessage =
          assignmentType === "team"
            ? submitterMode === "selected"
              ? isSelectedSubmitter
                ? `${currentUser.name || "Founder"} selected you to submit the task "${form.title.trim()}". Deadline: ${formatDate(form.deadlineDate)} at ${form.deadlineTime}.`
                : `${currentUser.name || "Founder"} assigned you to the team task "${form.title.trim()}". ${submitter?.name || "The selected submitter"} is responsible for submitting it. Deadline: ${formatDate(form.deadlineDate)} at ${form.deadlineTime}.`
              : `${currentUser.name || "Founder"} assigned you to the team task "${form.title.trim()}". Anybody on the selected team can submit this task. Deadline: ${formatDate(form.deadlineDate)} at ${form.deadlineTime}.`
            : `${currentUser.name || "Founder"} assigned "${form.title.trim()}" to you. Deadline: ${formatDate(form.deadlineDate)} at ${form.deadlineTime}.`;

        await addDoc(collection(db, "notifications"), {
          userId: member.id,
          recipientId: member.id,
          recipientEmail: member.email || "",
          senderId: currentUser.uid,
          senderName: currentUser.name || currentUser.email || "Founder",
          title:
            assignmentType === "team"
              ? submitterMode === "selected"
                ? isSelectedSubmitter
                  ? "Founder selected you to submit"
                  : "New team task assigned"
                : "New team task — anybody can submit"
              : "New task assigned",
          message: notificationMessage,
          type: assignmentType === "team" ? "team_task" : "new_task",
          priority:
            form.priority === "URGENT"
              ? "urgent"
              : form.priority === "HIGH"
                ? "important"
                : "normal",
          read: false,
          taskId: taskRef.id,
          taskTitle: form.title.trim(),
          assignmentType,
          submitterMode: assignmentType === "team" ? submitterMode : "selected",
          submitterId:
            assignmentType === "team"
              ? submitterMode === "selected"
                ? submitterId
                : null
              : member.id,
          link: "/employee/tasks",
          createdAt: serverTimestamp(),
        });

        if (currentUser.uid) {
          await addDoc(collection(db, "notifications"), {
            userId: currentUser.uid,
            recipientId: member.id,
            senderId: currentUser.uid,
            senderName: currentUser.name || currentUser.email || "Founder",
            recipientName: member.name || member.email || "Team Member",
            direction: "sent",
            title:
              assignmentType === "team"
                ? "Team task assigned"
                : "Task assigned",
            message: notificationMessage,
            type: assignmentType === "team" ? "team_task" : "new_task",
            priority:
              form.priority === "URGENT"
                ? "urgent"
                : form.priority === "HIGH"
                  ? "important"
                  : "normal",
            read: true,
            taskId: taskRef.id,
            taskTitle: form.title.trim(),
            link: "/founder/tasks",
            createdAt: serverTimestamp(),
          });
        }
      }

      /*
       * INTERNAL CALENDAR + GOOGLE CALENDAR
       *
       * A team task is represented by one calendar event and the selected
       * team members are invited as attendees.
       */
      if (form.calendarReminder) {
        const calendarRef = await addDoc(collection(db, "calendarEvents"), {
          title: `Task Deadline: ${form.title.trim()}`,
          description: form.description.trim(),
          eventType: "task_deadline",
          taskId: taskRef.id,
          assignedTo: primaryAssignee.id,
          assignedToName: primaryAssignee.name || primaryAssignee.email || "",
          assignedToEmail: primaryAssignee.email || "",
          assignedToIds:
            assignmentType === "team" ? teamMemberIds : [primaryAssignee.id],
          reminderMinutes: 60,
          assignedToNames:
            assignmentType === "team"
              ? teamMembers.map(
                  (member) => member.name || member.email || "Team Member",
                )
              : [primaryAssignee.name || primaryAssignee.email || ""],
          clientId: form.clientId || null,
          clientName: selectedClient
            ? selectedClient.name || selectedClient.company || ""
            : "",
          date: form.deadlineDate,
          time: form.deadlineTime,
          reminderEnabled: true,
          googleCalendarSync: false,
          googleCalendarEventId: "",
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
        });

        await updateDoc(doc(db, "tasks", taskRef.id), {
          calendarEventId: calendarRef.id,
        });

        // Google Calendar OAuth is intentionally not requested during task creation.
        // The internal employee calendar reminder is created here without a popup.
        // Google Calendar/email synchronization will be handled as the final MVP step.
        setMessage(
          assignmentType === "team"
            ? "Team task created, all selected members notified and calendar reminders set."
            : "Task created, employee notified and calendar reminder set.",
        );
      } else {
        setMessage(
          assignmentType === "team"
            ? "Team task created and all selected members notified."
            : "Task created successfully and notification sent.",
        );
      }

      resetForm();

      setTimeout(() => {
        setShowCreateModal(false);
        setMessage("");
      }, 1200);
    } catch (error) {
      console.error("Create task error:", error);

      setErrorMessage(
        "Could not create the task. Please check Firebase permissions and try again.",
      );
    } finally {
      setCreating(false);
    }
  }

  /*
   * NOTIFY TASK MEMBERS
   *
   * For single tasks this targets assignedTo.
   * For team tasks this targets the requested recipient list.
   */
  async function notifyTaskMembers(
    task: Task,
    title: string,
    notificationMessage: string,
    type: string,
    priority: string = "important",
    recipientIds?: string[],
  ) {
    const ids =
      recipientIds && recipientIds.length > 0
        ? recipientIds
        : task.teamMemberIds && task.teamMemberIds.length > 0
          ? task.teamMemberIds
          : task.assignedTo
            ? [task.assignedTo]
            : [];

    if (ids.length === 0) return;

    const uniqueIds = [...new Set(ids)];

    try {
      for (const recipientId of uniqueIds) {
        const recipient = users.find((user) => user.id === recipientId);

        await addDoc(collection(db, "notifications"), {
          userId: recipientId,
          recipientId,
          recipientEmail: recipient?.email || "",
          senderId: currentUser?.uid || "",
          senderName: currentUser?.name || currentUser?.email || "Founder",
          title,
          message: notificationMessage,
          type,
          priority,
          read: false,
          taskId: task.id,
          taskTitle: task.title || "Untitled task",
          link: "/employee/tasks",
          createdAt: serverTimestamp(),
        });

        if (currentUser?.uid) {
          await addDoc(collection(db, "notifications"), {
            userId: currentUser.uid,
            recipientId,
            senderId: currentUser.uid,
            senderName: currentUser.name || currentUser.email || "Founder",
            recipientName: recipient?.name || recipient?.email || "Team Member",
            direction: "sent",
            title,
            message: notificationMessage,
            type,
            priority,
            read: true,
            taskId: task.id,
            taskTitle: task.title || "Untitled task",
            link: "/founder/tasks",
            createdAt: serverTimestamp(),
          });
        }
      }
    } catch (error) {
      console.error("Failed to notify task members:", error);
    }
  }

  async function notifyAssignedUser(
    task: Task,
    title: string,
    notificationMessage: string,
    type: string,
    priority: string = "important",
  ) {
    await notifyTaskMembers(task, title, notificationMessage, type, priority);
  }

  /*
   * APPROVE TASK
   */
  async function approveTask(task: Task) {
    try {
      setReviewLoading(task.id);

      await updateDoc(doc(db, "tasks", task.id), {
        status: "APPROVED",
        approvedAt: serverTimestamp(),
        approvedBy: currentUser?.uid || "",
        approvedByName: currentUser?.name || currentUser?.email || "Founder",
        updatedAt: serverTimestamp(),
      });

      await notifyAssignedUser(
        task,
        "Task approved",
        `Your work on "${task.title || "Untitled task"}" was approved by the Founder. Please mark the task as completed.`,
        "approval",
        "important",
      );

      setSelectedTask({
        ...task,
        status: "APPROVED",
      });
      alert("Work approved. The employee can now mark the task as completed.");
    } catch (error) {
      console.error("Approve task error:", error);
      alert("Unable to approve this task. Please try again.");
    } finally {
      setReviewLoading(null);
    }
  }

  /*
   * MARK APPROVED TASK AS COMPLETED
   */
  async function markTaskCompleted(task: Task) {
    if (normalizeStatus(task.status) !== "approved") {
      alert("Only an approved task can be marked as completed.");
      return;
    }

    try {
      setReviewLoading(task.id);

      await updateDoc(doc(db, "tasks", task.id), {
        status: "COMPLETED",
        completedAt: serverTimestamp(),
        completedBy: currentUser?.uid || "",
        completedByName: currentUser?.name || currentUser?.email || "Founder",
        updatedAt: serverTimestamp(),
      });

      await notifyAssignedUser(
        task,
        "Task completed",
        `The Founder marked "${task.title || "Untitled task"}" as completed.`,
        "completion",
        "important",
      );

      setSelectedTask({
        ...task,
        status: "COMPLETED",
      });

      alert("Task marked as completed successfully.");
    } catch (error) {
      console.error("Founder completion error:", error);
      alert("Unable to mark the task as completed. Please try again.");
    } finally {
      setReviewLoading(null);
    }
  }

  /*
   * REQUEST CHANGES
   *
   * Founder chooses exactly who should receive the changes:
   * - one or more named members
   * - All team members
   */
  async function requestChanges(task: Task) {
    const feedback = reviewFeedback.trim();

    if (!feedback) {
      alert("Please enter the changes or feedback before requesting changes.");
      return;
    }

    const availableRecipientIds =
      task.teamMemberIds && task.teamMemberIds.length > 0
        ? task.teamMemberIds
        : task.assignedTo
          ? [task.assignedTo]
          : [];

    const selectedRecipients = changeRecipientIds.filter((id) =>
      availableRecipientIds.includes(id),
    );

    if (selectedRecipients.length === 0) {
      alert(
        "Please select at least one employee to receive the requested changes.",
      );
      return;
    }

    try {
      setReviewLoading(task.id);

      const recipientNames = selectedRecipients.map((id) => {
        const member = users.find((user) => user.id === id);
        return member?.name || member?.email || "Team Member";
      });

      await updateDoc(doc(db, "tasks", task.id), {
        status: "CHANGES REQUESTED",
        feedback,
        reviewComment: feedback,
        reviewedAt: serverTimestamp(),
        reviewedBy: currentUser?.uid || "",
        reviewedByName: currentUser?.name || currentUser?.email || "Founder",
        changeRecipientIds: selectedRecipients,
        changeRecipientNames: recipientNames,
        updatedAt: serverTimestamp(),
      });

      const recipientLabel =
        selectedRecipients.length === availableRecipientIds.length
          ? "all selected team members"
          : recipientNames.join(", ");

      await notifyTaskMembers(
        task,
        "Changes requested",
        `The Founder requested changes on "${task.title || "Untitled task"}" for ${recipientLabel}: ${feedback}`,
        "changes_requested",
        task.priority === "URGENT" ? "urgent" : "important",
        selectedRecipients,
      );

      setSelectedTask({
        ...task,
        status: "CHANGES REQUESTED",
        feedback,
        reviewComment: feedback,
        changeRecipientIds: selectedRecipients,
        changeRecipientNames: recipientNames,
      });

      setShowChangesModal(false);
      setReviewFeedback("");
      setChangeRecipientIds([]);

      alert(
        selectedRecipients.length === availableRecipientIds.length
          ? "Changes requested from all selected team members."
          : "Changes requested from the selected employee(s).",
      );
    } catch (error) {
      console.error("Request changes error:", error);
      alert("Unable to request changes. Please try again.");
    } finally {
      setReviewLoading(null);
    }
  }

  /*
   * DEADLINE NOTIFICATIONS
   */
  useEffect(() => {
    if (!authorized || !currentUser) return;
    const founder = currentUser;

    async function checkDeadlines() {
      const now = Date.now();

      for (const task of tasks) {
        if (!task.deadline || isFinalTaskStatus(task.status)) continue;

        const deadline = new Date(task.deadline).getTime();
        if (!Number.isFinite(deadline)) continue;

        const remaining = deadline - now;
        let kind: "24h" | "1h" | "overdue" | null = null;
        let title = "";
        let notificationMessage = "";
        let priority = "important";

        if (remaining > 0 && remaining <= 60 * 60 * 1000) {
          kind = "1h";
          title = "Task deadline in 1 hour";
          notificationMessage = `"${task.title || "Untitled task"}" is due in less than 1 hour (${task.deadlineTime || "deadline time"}).`;
          priority = "urgent";
        } else if (
          remaining > 60 * 60 * 1000 &&
          remaining <= 24 * 60 * 60 * 1000
        ) {
          kind = "24h";
          title = "Task deadline approaching";
          notificationMessage = `"${task.title || "Untitled task"}" is due within 24 hours (${task.deadlineTime || "deadline time"}).`;
        } else if (remaining <= 0) {
          kind = "overdue";
          title = "Task deadline passed";
          notificationMessage = `The deadline for "${task.title || "Untitled task"}" has passed. Current status: ${task.status || "unknown"}.`;
          priority = "urgent";
        }

        if (!kind) continue;

        const notificationId = `deadline_${task.id}_${kind}_${founder.uid}`;

        try {
          await setDoc(
            doc(db, "notifications", notificationId),
            {
              userId: founder.uid,
              recipientId: founder.uid,
              senderId: founder.uid,
              senderName: "The Ant Media System",
              title,
              message: notificationMessage,
              type: "deadline",
              priority,
              read: false,
              taskId: task.id,
              taskTitle: task.title || "Untitled task",
              link: "/founder/tasks",
              createdAt: serverTimestamp(),
            },
            { merge: true },
          );
        } catch (error) {
          console.error("Deadline notification error:", error);
        }
      }
    }

    checkDeadlines();
    const timer = window.setInterval(checkDeadlines, 60_000);
    return () => window.clearInterval(timer);
  }, [authorized, currentUser, tasks]);

  /*
   * DELETE / RECYCLE BIN
   *
   * Founder can delete a task only after the work has been approved.
   * APPROVED and COMPLETED tasks are moved to the founder recycle bin first.
   * Nothing is permanently removed from Firestore during this action.
   */
  async function moveTaskToRecycleBin(
    task: Task,
    deletedBy: string,
    deletedByName: string,
    ownerUserId: string,
    ownerRole: "founder" | "employee" | "intern",
    deletionSource: "founder" | "employee",
  ) {
    const recyclePayload = {
      ...task,
      originalTaskId: task.id,
      deletedAt: serverTimestamp(),
      deletedBy,
      deletedByName,
      ownerUserId,
      ownerRole,
      deletionSource,
      recycleBinType: ownerRole === "founder" ? "founder" : "employee",
      permanentlyDeleted: false,
    };

    const recycleRef = doc(collection(db, "recycleBinTasks"));
    const batch = writeBatch(db);
    batch.set(recycleRef, recyclePayload);
    batch.delete(doc(db, "tasks", task.id));
    await batch.commit();
    return recycleRef.id;
  }

  async function handleDeleteTask(task: Task, alreadyConfirmed = false) {
    if (
      !alreadyConfirmed &&
      !window.confirm(
        `Move "${task.title || "Untitled task"}" to the Recycle Bin?`,
      )
    )
      return;
    setDeletingTask(true);
    setErrorMessage("");
    try {
      const recycleId = await moveTaskToRecycleBin(
        task,
        currentUser?.uid || "",
        currentUser?.name || currentUser?.email || "Founder",
        currentUser?.uid || "",
        "founder",
        "founder",
      );

      console.info("Task moved to founder recycle bin:", recycleId);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      setSelectedTask(null);
      setTaskToDelete(null);
      setMessage("Task moved to the Founder Recycle Bin.");
    } catch (error) {
      console.error("Delete task / recycle bin error:", error);
      setErrorMessage(
        "Unable to move the task to the Recycle Bin. The original task was kept safe.",
      );
    } finally {
      setDeletingTask(false);
    }
  }

  async function reviewEmployeeDeleteRequest(
    task: Task,
    decision: "approved" | "rejected",
  ) {
    if (!currentUser?.uid) return;

    if (task.deleteRequestStatus !== "pending") {
      alert("There is no pending delete request for this task.");
      return;
    }

    try {
      setDeleteReviewLoading(task.id);

      const employeeId = task.deleteRequestedBy || task.assignedTo || "";
      const employee = users.find((user) => user.id === employeeId);
      const employeeName =
        task.deleteRequestedByName ||
        employee?.name ||
        employee?.email ||
        task.assignedToName ||
        "Employee";

      const taskTitle = task.title || "Untitled task";

      if (decision === "approved") {
        await updateDoc(doc(db, "tasks", task.id), {
          deleteRequestStatus: "approved",
          deleteReviewedAt: serverTimestamp(),
          deleteReviewedBy: currentUser.uid,
          deleteReviewedByName:
            currentUser.name || currentUser.email || "Founder",
          deleteReviewMessage: `Founder approved ${employeeName} to delete the task.`,
          updatedAt: serverTimestamp(),
        });

        if (employeeId) {
          await addDoc(collection(db, "notifications"), {
            userId: employeeId,
            recipientId: employeeId,
            recipientEmail: employee?.email || "",
            senderId: currentUser.uid,
            senderName: currentUser.name || currentUser.email || "Founder",
            title: "Founder approved task deletion",
            message: `Founder approved you can delete the task "${taskTitle}". Task details: ${task.description || "No description provided."} Deadline: ${formatDate(task.deadlineDate || task.deadline)} at ${task.deadlineTime || "Not set"}. You can now delete this task from your task history.`,
            type: "task_delete_approved",
            priority: "important",
            read: false,
            taskId: task.id,
            taskTitle,
            link: "/employee/tasks",
            createdAt: serverTimestamp(),
          });
        }

        setSelectedTask({
          ...task,
          deleteRequestStatus: "approved",
          deleteReviewedBy: currentUser.uid,
          deleteReviewedByName:
            currentUser.name || currentUser.email || "Founder",
        });

        alert(`Delete permission approved for ${employeeName}.`);
      } else {
        const rejectionMessage = `Founder rejected your delete request for the task "${taskTitle}". Please continue working on this task and complete it.`;

        await updateDoc(doc(db, "tasks", task.id), {
          deleteRequestStatus: "rejected",
          deleteReviewedAt: serverTimestamp(),
          deleteReviewedBy: currentUser.uid,
          deleteReviewedByName:
            currentUser.name || currentUser.email || "Founder",
          deleteReviewMessage: rejectionMessage,
          updatedAt: serverTimestamp(),
        });

        if (employeeId) {
          await addDoc(collection(db, "notifications"), {
            userId: employeeId,
            recipientId: employeeId,
            recipientEmail: employee?.email || "",
            senderId: currentUser.uid,
            senderName: currentUser.name || currentUser.email || "Founder",
            title: "Founder rejected task deletion",
            message: rejectionMessage,
            type: "task_delete_rejected",
            priority: "important",
            read: false,
            taskId: task.id,
            taskTitle,
            link: "/employee/tasks",
            createdAt: serverTimestamp(),
          });
        }

        setSelectedTask({
          ...task,
          deleteRequestStatus: "rejected",
          deleteReviewedBy: currentUser.uid,
          deleteReviewedByName:
            currentUser.name || currentUser.email || "Founder",
          deleteReviewMessage: rejectionMessage,
        });

        alert(`Delete request rejected for ${employeeName}.`);
      }
    } catch (error) {
      console.error("Delete permission review error:", error);
      alert("Unable to process the delete request. Please try again.");
    } finally {
      setDeleteReviewLoading(null);
    }
  }

  /*
   * EXPORT TASKS
   */
  function exportTasks() {
    const headers = [
      "Title",
      "Assigned To",
      "Client",
      "Department",
      "Task Type",
      "Priority",
      "Status",
      "Start Date",
      "Deadline",
    ];

    const rows = filteredTasks.map((task) => [
      task.title || "",
      task.assignedToName || "",
      task.clientName || task.client || "",
      task.department || "",
      task.taskType || "",
      task.priority || "",
      task.status || "",
      task.startDate || "",
      task.deadline || "",
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = `ant-media-tasks-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  /*
   * LOADING
   */
  if (checkingAuth) {
    return (
      <main className="min-h-screen bg-white text-[var(--brand-black)] flex items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--brand-black)]">
          <Loader2 size={20} className="animate-spin" />
          Checking founder workspace...
        </div>
      </main>
    );
  }

  /*
   * ACCESS DENIED
   */
  if (!authorized) {
    return (
      <main className="min-h-screen bg-white text-[var(--brand-black)] flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-3xl border border-[var(--brand-border)] bg-white p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-700">
            <AlertCircle size={26} />
          </div>

          <h1 className="text-2xl font-semibold">Founder access required</h1>

          <p className="mt-3 text-sm leading-6 text-[var(--brand-medium-gray)]">
            Please sign in to the founder workspace to manage tasks.
          </p>

          <button
            onClick={() => {
              window.location.href = "/";
            }}
            className="mt-7 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black"
          >
            Back to login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-[var(--brand-black)]">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden"></div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--brand-border)] bg-white ">
        <div className="mx-auto flex max-w-[1700px] items-center justify-between px-6 py-5 lg:px-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                window.location.href = "/founder";
              }}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--brand-border)] bg-white transition hover:bg-[var(--brand-red-light)]"
            >
              <ArrowLeft size={20} />
            </button>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--brand-red)]">
                Founder / Management
              </p>

              <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                Task Management
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                window.location.reload();
              }}
              className="hidden items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] md:flex"
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <button
              onClick={exportTasks}
              className="hidden items-center gap-2 rounded-xl border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/[0.05] px-4 py-3 text-sm font-medium text-[var(--brand-red)] transition hover:bg-[var(--brand-red)]/10 md:flex"
            >
              <Download size={16} />
              Export
            </button>

            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-red)] text-sm font-bold shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/20">
              A
            </div>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1700px] px-6 py-10 lg:px-10">
        {/* Hero */}
        <section className="mb-10">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div>
              <div className="mb-5 flex items-center gap-3 text-[var(--brand-red)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-red)]/10">
                  <FileText size={19} />
                </div>

                <span className="text-sm font-medium">
                  Work allocation & delivery
                </span>
              </div>

              <h2 className="max-w-4xl text-5xl font-semibold tracking-[-0.05em] sm:text-6xl">
                Keep every task
                <br />
                <span className="text-[var(--brand-red)]">moving forward.</span>
              </h2>

              <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--brand-medium-gray)]">
                Assign work, monitor progress, review submissions and keep the
                entire Ant Media team aligned from one place.
              </p>
            </div>

            <button
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
              className="flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-red)] px-6 py-4 text-sm font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/20 transition hover:scale-[1.02]"
            >
              <Plus size={19} />
              Create Task
            </button>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          {[
            {
              label: "TOTAL",
              value: totalTasks,
              icon: FileText,
              note: "All workspace tasks",
            },
            {
              label: "ACTIVE",
              value: activeTasks,
              icon: Zap,
              note: "Currently active",
            },
            {
              label: "REVIEW",
              value: reviewTasks,
              icon: Clock3,
              note: "Awaiting review",
            },
            {
              label: "OVERDUE",
              value: overdueTasks,
              icon: AlertCircle,
              note: "Needs attention",
            },
            {
              label: "COMPLETED",
              value: completedTasks,
              icon: CheckCircle2,
              note: "Successfully delivered",
            },
            {
              label: "URGENT",
              value: urgentTasks,
              icon: AlertCircle,
              note: "High priority work",
            },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                className="rounded-3xl border border-[var(--brand-border)] bg-white p-6 "
              >
                <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-red)]/10 text-[var(--brand-red)]">
                  <Icon size={20} />
                </div>

                <p className="text-[11px] font-semibold tracking-wider text-[var(--brand-dark-gray)]">
                  {item.label}
                </p>

                <p
                  className={`mt-2 text-3xl font-semibold ${
                    item.label === "OVERDUE" && item.value > 0
                      ? "text-red-700"
                      : ""
                  }`}
                >
                  {item.value}
                </p>

                <p className="mt-2 text-xs text-[var(--brand-medium-gray)]">
                  {item.note}
                </p>
              </div>
            );
          })}
        </section>

        {/* Search / Filters */}
        <section className="mt-8 rounded-3xl border border-[var(--brand-border)] bg-white p-4 ">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--brand-black)]"
              />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tasks, people, clients..."
                className="h-12 w-full rounded-xl border border-[var(--brand-border)] bg-white pl-11 pr-4 text-sm text-[var(--brand-black)] outline-none placeholder:text-[var(--brand-black)] focus:border-[var(--brand-red-secondary)]/40"
              />
            </div>

            <div className="relative">
              <Filter
                size={16}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--brand-black)]"
              />

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-12 min-w-[180px] appearance-none rounded-xl border border-[var(--brand-border)] bg-white pl-10 pr-8 text-sm text-[var(--brand-black)] outline-none"
              >
                <option value="ALL" className="bg-[#111]">
                  All statuses
                </option>

                {STATUSES.map((status) => (
                  <option key={status} value={status} className="bg-[#111]">
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <select
              aria-label="Filter tasks by employee"
              value={employeeFilter}
              onChange={(event) => setEmployeeFilter(event.target.value)}
              className="h-12 min-w-[180px] rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none"
            >
              <option value="">All employees</option>
              {users.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name || employee.email || "Team member"}
                </option>
              ))}
            </select>

              <select
                value={taskViewFilter}
              onChange={(event) =>
                setTaskViewFilter(
                  event.target.value as "all" | "active" | "overdue",
                )
              }
              className="h-12 min-w-[160px] rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none"
            >
              <option value="all">All work</option>
              <option value="active">Active work</option>
              <option value="overdue">Overdue work</option>
            </select>

            <div className="min-w-[220px] flex-1 lg:max-w-[280px]">
              <ClientSelector clients={clients} value={clientFilter} onChange={(value) => { setClientFilter(value); setWorkFilter(""); }} placeholder="All clients" clearLabel="All clients" />
            </div>
            {clientFilter && <select value={workFilter} onChange={(event) => setWorkFilter(event.target.value)} className="h-12 min-w-[200px] rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm"><option value="">All work</option>{worksForFilterClient.map((work) => <option key={work.id} value={work.id}>{work.name}</option>)}</select>}

            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
              className="h-12 min-w-[180px] rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none"
            >
              <option value="ALL" className="bg-[#111]">
                All priorities
              </option>

              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority} className="bg-[#111]">
                  {priority}
                </option>
              ))}
            </select>

            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("ALL");
                setPriorityFilter("ALL");
                setEmployeeFilter("");
                setTaskViewFilter("all");
                setClientFilter("");
                setWorkFilter("");
                window.history.replaceState({}, "", "/founder/tasks");
              }}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white px-5 text-sm font-medium text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)]"
            >
              <RefreshCw size={16} />
              Reset
            </button>
          </div>
        </section>

        {/* Task List */}
        <section className="mt-6 overflow-hidden rounded-3xl border border-[var(--brand-border)] bg-white ">
          <div className="flex items-center justify-between border-b border-[var(--brand-border)] px-6 py-5">
            <div>
              <h3 className="text-lg font-semibold">All workspace tasks</h3>

              <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                {filteredTasks.length} task
                {filteredTasks.length === 1 ? "" : "s"} shown
              </p>
            </div>

            <div className="hidden items-center gap-2 text-xs text-[var(--brand-black)] sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Live Firestore feed
            </div>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="flex min-h-[350px] flex-col items-center justify-center px-6 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--brand-border)] bg-white text-[var(--brand-black)]">
                <FileText size={27} />
              </div>

              <h3 className="text-lg font-semibold">No tasks found</h3>

              <p className="mt-2 max-w-md text-sm leading-6 text-[var(--brand-medium-gray)]">
                Create a task and assign it to a team member. The task will
                immediately appear here.
              </p>

              <button
                onClick={() => {
                  resetForm();
                  setShowCreateModal(true);
                }}
                className="mt-6 flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black"
              >
                <Plus size={16} />
                Create first task
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--brand-border)]">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className="group flex w-full items-stretch gap-3 p-5 text-left transition hover:bg-[var(--brand-red-light)] sm:p-6"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedTask(task)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedTask(task);
                      }
                    }}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                  >
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-semibold text-[var(--brand-black)]">
                            {task.title || "Untitled task"}
                          </h4>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${getPriorityClass(
                              task.priority,
                            )}`}
                          >
                            {task.priority || "MEDIUM"}
                          </span>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${getStatusClass(
                              task.status,
                            )}`}
                          >
                            {task.status || "TO DO"}
                          </span>

                          {task.deleteRequestStatus === "pending" && (
                            <span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-2.5 py-1 text-[10px] font-semibold text-orange-700">
                              DELETE REQUEST
                            </span>
                          )}

                          {task.deleteRequestStatus === "approved" && (
                            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                              DELETE APPROVED
                            </span>
                          )}
                        </div>

                        <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-[var(--brand-medium-gray)]">
                          {task.description || "No description provided."}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--brand-black)]">
                          <span className="flex items-center gap-1.5">
                            <User size={13} />
                            {task.assignmentType === "team"
                              ? `Team · ${task.teamMemberIds?.length || 0} members`
                              : task.assignedToName || "Unassigned"}
                          </span>

                          <span className="flex items-center gap-1.5">
                            <Users size={13} />
                            {task.department || "Management"}
                          </span>

                          <span className="flex items-center gap-1.5">
                            <Calendar size={13} />
                            {formatDate(task.deadlineDate || task.deadline)}
                          </span>

                      {task.clientName && <span>{task.clientName}</span>}
                          {task.workId && <span>{clientWork.find((work) => work.id === task.workId)?.name || "Client work"}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            window.location.href = `/founder/calendar?taskId=${encodeURIComponent(task.id)}`;
                          }}
                          className="flex items-center gap-1.5 rounded-lg border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/10 px-3 py-2 text-xs text-[var(--brand-red)] hover:bg-[var(--brand-red)]/15"
                        >
                          <Calendar size={13} />
                          Calendar
                        </button>

                        {task.referenceDriveUrl && (
                          <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                            <FileText size={13} />
                            Drive reference
                          </span>
                        )}

                        <span className="text-[var(--brand-black)] transition group-hover:text-[var(--brand-black)]">
                          →
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTaskToDelete(task)}
                    aria-label={`Delete ${task.title || "task"}`}
                    title="Delete task"
                    className="my-auto flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-red-500/25 px-2.5 text-xs text-red-700 transition hover:bg-red-50 sm:px-3"
                  >
                    <Trash2 size={14} />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* CREATE TASK MODAL */}
      {taskToDelete && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-task-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--brand-border)] bg-white p-6 shadow-xl">
            <h2 id="delete-task-title" className="text-lg font-semibold">
              Move task to Recycle Bin?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--brand-medium-gray)]">
              This task will leave the active task list and can be restored from
              the Recycle Bin.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                disabled={deletingTask}
                onClick={() => setTaskToDelete(null)}
                className="rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                disabled={deletingTask}
                onClick={() => handleDeleteTask(taskToDelete, true)}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {deletingTask ? "Moving…" : "Move to Recycle Bin"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE TASK MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 ">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[var(--brand-border)] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/30">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[var(--brand-border)] p-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-red)]">
                  Founder Workspace
                </p>

                <h2 className="mt-2 text-2xl font-semibold">Create New Task</h2>

                <p className="mt-1 text-sm text-[var(--brand-medium-gray)]">
                  Assign a new piece of work to your team.
                </p>
              </div>

              <button
                onClick={() => setShowCreateModal(false)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateTask} className="overflow-y-auto p-6">
              {message && (
                <div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-700">
                  <Check size={18} />
                  {message}
                </div>
              )}

              {errorMessage && (
                <div className="mb-5 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-700">
                  <AlertCircle size={18} />
                  {errorMessage}
                </div>
              )}

              {/* Assignment mode */}
              <div className="mb-6 rounded-2xl border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/[0.04] p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-dark-gray)]">
                  Assignment Type
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setAssignmentType("single");
                      setTeamMemberIds([]);
                      setTeamLeadId("");
                      setSubmitterMode("selected");
                      setSubmitterId("");
                    }}
                    className={`rounded-xl border px-4 py-4 text-left transition ${assignmentType === "single" ? "border-[var(--brand-red-secondary)]/40 bg-[var(--brand-red)]/15 text-[var(--brand-red)]" : "border-[var(--brand-border)] bg-white text-[var(--brand-black)] hover:bg-[var(--brand-red-light)]"}`}
                  >
                    <p className="text-sm font-semibold">Single Employee</p>
                    <p className="mt-1 text-[11px] text-[var(--brand-medium-gray)]">
                      Normal individual task
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAssignmentType("team");
                      setForm({ ...form, assignedTo: "" });
                    }}
                    className={`rounded-xl border px-4 py-4 text-left transition ${assignmentType === "team" ? "border-[var(--brand-red-secondary)]/40 bg-[var(--brand-red)]/15 text-[var(--brand-red)]" : "border-[var(--brand-border)] bg-white text-[var(--brand-black)] hover:bg-[var(--brand-red-light)]"}`}
                  >
                    <p className="text-sm font-semibold">Create Team</p>
                    <p className="mt-1 text-[11px] text-[var(--brand-medium-gray)]">
                      Shared task for multiple members
                    </p>
                  </button>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-black)]">
                  Task Title *
                </label>

                <input
                  required
                  value={form.title}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      title: event.target.value,
                    })
                  }
                  placeholder="e.g. Build Ant Media Landing Page"
                  className="h-14 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none placeholder:text-[var(--brand-black)] focus:border-[var(--brand-red-secondary)]/50"
                />
              </div>

              {/* Description */}
              <div className="mt-5">
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-black)]">
                  Description
                </label>

                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      description: event.target.value,
                    })
                  }
                  placeholder="Describe what needs to be completed..."
                  rows={4}
                  className="w-full resize-none rounded-xl border border-[var(--brand-border)] bg-white p-4 text-sm text-[var(--brand-black)] outline-none placeholder:text-[var(--brand-black)] focus:border-[var(--brand-red-secondary)]/50"
                />
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-black)]">Client <span className="font-normal normal-case text-gray-500">(optional · Internal / No client is allowed)</span></label>
                  <ClientSelector clients={clients} value={form.clientId} onChange={(value) => setForm({ ...form, clientId: value, workId: "" })} placeholder="Internal / No client" />
                </div>
                {form.clientId && <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-black)]">Work / Deliverable</label>
                  <select value={form.workId} onChange={(event) => setForm({ ...form, workId: event.target.value })} className="h-12 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm"><option value="">General client task (no specific work)</option>{worksForSelectedClient.map((work) => <option key={work.id} value={work.id}>{work.name} · {work.status || "PLANNED"}</option>)}</select>
                  {worksForSelectedClient.length === 0 && <p className="mt-1 text-xs text-gray-500">No deliverables created for this client yet. <Link className="font-medium text-[var(--brand-red)] underline" href={`/founder/clients/${encodeURIComponent(form.clientId)}?tab=Work`}>Create one in the client Work tab</Link>.</p>}
                </div>}
              </div>

              {/* Assignment */}
              {assignmentType === "single" ? (
                <div className="mt-5">
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-black)]">
                    Assign To *
                  </label>
                  <select
                    required
                    value={form.assignedTo}
                    onChange={(event) =>
                      setForm({ ...form, assignedTo: event.target.value })
                    }
                    className="h-14 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none focus:border-[var(--brand-red-secondary)]/50"
                  >
                    <option value="" className="bg-[#111]">
                      Select team member
                    </option>
                    {users.map((user) => (
                      <option
                        key={user.id}
                        value={user.id}
                        className="bg-[#111]"
                      >
                        {user.name || user.email} · {user.role}
                      </option>
                    ))}
                  </select>

                  {selectedSingleUser && (
                    <div className="mt-3 rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-red)]">
                        Selected Employee
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <div>
                          <p className="text-[10px] text-[var(--brand-medium-gray)]">
                            Name
                          </p>
                          <p className="mt-1 text-sm font-semibold text-[var(--brand-dark-gray)]">
                            {selectedSingleUser.name ||
                              selectedSingleUser.email}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[var(--brand-medium-gray)]">
                            Dep
                          </p>
                          <p className="mt-1 text-sm font-semibold text-[var(--brand-dark-gray)]">
                            {selectedSingleUser.department || "Not set"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[var(--brand-medium-gray)]">
                            Role
                          </p>
                          <p className="mt-1 text-sm font-semibold text-[var(--brand-dark-gray)]">
                            {selectedSingleUser.role || "Not set"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/[0.04] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-red)]">
                        Team Members
                      </p>
                      <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                        Select the employees who will work on this shared task.
                      </p>
                    </div>
                    <span className="rounded-full border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/10 px-3 py-1 text-[10px] font-semibold text-[var(--brand-red)]">
                      {selectedTeamMembers.length} selected
                    </span>
                  </div>

                  <div className="mt-4 space-y-2">
                    {users.map((user) => {
                      const checked = teamMemberIds.includes(user.id);
                      return (
                        <button
                          type="button"
                          key={user.id}
                          onClick={() => {
                            const next = checked
                              ? teamMemberIds.filter((id) => id !== user.id)
                              : [...teamMemberIds, user.id];
                            setTeamMemberIds(next);
                            if (user.id === teamLeadId && checked)
                              setTeamLeadId("");
                            if (user.id === submitterId && checked)
                              setSubmitterId("");
                          }}
                          className={`w-full rounded-xl border p-3 text-left transition ${checked ? "border-[var(--brand-red-secondary)]/30 bg-[var(--brand-red)]/10" : "border-[var(--brand-border)] bg-white hover:bg-[var(--brand-red-light)]"}`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-md border ${checked ? "border-[var(--brand-red-secondary)] bg-[var(--brand-red)] text-[var(--brand-black)]" : "border-[var(--brand-border)] text-transparent"}`}
                            >
                              <Check size={13} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-[var(--brand-dark-gray)]">
                                {user.name || user.email}
                              </p>
                              <p className="mt-1 text-[10px] text-[var(--brand-medium-gray)]">
                                Dep: {user.department || "Not set"} · Role:{" "}
                                {user.role || "Not set"}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {selectedTeamMembers.length > 0 && (
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-black)]">
                          Team Lead *
                        </label>
                        <select
                          required
                          value={teamLeadId}
                          onChange={(event) =>
                            setTeamLeadId(event.target.value)
                          }
                          className="h-12 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none focus:border-amber-500/40"
                        >
                          <option value="" className="bg-[#111]">
                            Select Team Lead
                          </option>
                          {selectedTeamMembers.map((user) => (
                            <option
                              key={user.id}
                              value={user.id}
                              className="bg-[#111]"
                            >
                              {user.name || user.email}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-black)]">
                          Who is going to submit? *
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSubmitterMode("selected");
                              setSubmitterId("");
                            }}
                            className={`rounded-xl border px-3 py-3 text-xs font-semibold ${submitterMode === "selected" ? "border-[var(--brand-red-secondary)]/40 bg-[var(--brand-red)]/15 text-[var(--brand-red)]" : "border-[var(--brand-border)] bg-white text-[var(--brand-black)]"}`}
                          >
                            Selected Employee
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSubmitterMode("anybody");
                              setSubmitterId("");
                            }}
                            className={`rounded-xl border px-3 py-3 text-xs font-semibold ${submitterMode === "anybody" ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700" : "border-[var(--brand-border)] bg-white text-[var(--brand-black)]"}`}
                          >
                            Anybody
                          </button>
                        </div>
                        {submitterMode === "selected" && (
                          <select
                            required
                            value={submitterId}
                            onChange={(event) =>
                              setSubmitterId(event.target.value)
                            }
                            className="mt-2 h-12 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none focus:border-[var(--brand-red-secondary)]/40"
                          >
                            <option value="" className="bg-[#111]">
                              Select submitter
                            </option>
                            {selectedTeamMembers.map((user) => (
                              <option
                                key={user.id}
                                value={user.id}
                                className="bg-[#111]"
                              >
                                {user.name || user.email}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedTeamLead && (
                    <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700/70">
                        Team Lead
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[var(--brand-dark-gray)]">
                        {selectedTeamLead.name || selectedTeamLead.email}{" "}
                        <span className="text-amber-700">(TL)</span>
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--brand-medium-gray)]">
                        Dep: {selectedTeamLead.department || "Not set"} · Role:{" "}
                        {selectedTeamLead.role || "Not set"}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Department + Type */}
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-black)]">
                    Department
                  </label>

                  <select
                    value={form.department}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        department: event.target.value,
                      })
                    }
                    className="h-14 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none focus:border-[var(--brand-red-secondary)]/50"
                  >
                    {DEPARTMENTS.map((department) => (
                      <option
                        key={department}
                        value={department}
                        className="bg-[#111]"
                      >
                        {department}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-black)]">
                    Task Type
                  </label>

                  <select
                    value={form.taskType}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        taskType: event.target.value,
                      })
                    }
                    className="h-14 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none focus:border-[var(--brand-red-secondary)]/50"
                  >
                    {TASK_TYPES.map((type) => (
                      <option key={type} value={type} className="bg-[#111]">
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Priority */}
              <div className="mt-5">
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-black)]">
                  Priority
                </label>

                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {PRIORITIES.map((priority) => (
                    <button
                      type="button"
                      key={priority}
                      onClick={() =>
                        setForm({
                          ...form,
                          priority,
                        })
                      }
                      className={`h-12 rounded-xl border text-xs font-semibold transition ${
                        form.priority === priority
                          ? getPriorityClass(priority)
                          : "border-[var(--brand-border)] bg-white text-[var(--brand-black)] hover:bg-[var(--brand-red-light)]"
                      }`}
                    >
                      {priority}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-black)]">
                    Start Date
                  </label>

                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        startDate: event.target.value,
                      })
                    }
                    className="h-14 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none focus:border-[var(--brand-red-secondary)]/50"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-black)]">
                    Deadline *
                  </label>

                  <input
                    required
                    type="date"
                    value={form.deadlineDate}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        deadlineDate: event.target.value,
                      })
                    }
                    className="h-14 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none focus:border-[var(--brand-red-secondary)]/50"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-black)]">
                    Deadline Time
                  </label>

                  <input
                    type="time"
                    value={form.deadlineTime}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        deadlineTime: event.target.value,
                      })
                    }
                    className="h-14 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none focus:border-[var(--brand-red-secondary)]/50"
                  />
                </div>
              </div>

              {/* EMPLOYEE DELETE REQUEST */}
              {selectedTask?.deleteRequestStatus === "pending" && (
                <div className="mt-4 rounded-2xl border border-orange-500/25 bg-orange-500/[0.06] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-700/80">
                        Employee delete request
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[var(--brand-dark-gray)]">
                        {selectedTask!.deleteRequestedByName ||
                          selectedTask!.assignedToName ||
                          "Employee"}{" "}
                        requested permission to delete this task.
                      </p>
                      <p className="mt-2 text-xs leading-5 text-[var(--brand-medium-gray)]">
                        This task is not completed. The employee cannot delete
                        it unless the Founder approves the request.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-orange-500/25 bg-orange-500/10 px-3 py-1.5 text-[10px] font-semibold text-orange-700">
                      PENDING
                    </span>
                  </div>

                  <div className="mt-4 rounded-xl border border-[var(--brand-border)] bg-white p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-dark-gray)]">
                      Task details
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[var(--brand-dark-gray)]">
                      {selectedTask!.title || "Untitled task"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--brand-medium-gray)]">
                      {selectedTask!.description || "No description provided."}
                    </p>
                    <p className="mt-2 text-[11px] text-[var(--brand-medium-gray)]">
                      Deadline:{" "}
                      {formatDate(
                        selectedTask!.deadlineDate || selectedTask!.deadline,
                      )}{" "}
                      · {selectedTask!.deadlineTime || "Not set"}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() =>
                        reviewEmployeeDeleteRequest(selectedTask!, "approved")
                      }
                      disabled={deleteReviewLoading === selectedTask!.id}
                      className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold disabled:opacity-50"
                    >
                      {deleteReviewLoading === selectedTask!.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Check size={16} />
                      )}
                      Approve Delete
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        reviewEmployeeDeleteRequest(selectedTask!, "rejected")
                      }
                      disabled={deleteReviewLoading === selectedTask!.id}
                      className="flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-50"
                    >
                      <X size={16} />
                      Reject Delete
                    </button>
                  </div>
                </div>
              )}

              {selectedTask?.deleteRequestStatus === "approved" && (
                <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700/80">
                    Delete permission approved
                  </p>
                  <p className="mt-2 text-sm text-[var(--brand-medium-gray)]">
                    {selectedTask!.deleteRequestedByName ||
                      selectedTask!.assignedToName ||
                      "The employee"}{" "}
                    may now delete this task from their workspace.
                  </p>
                </div>
              )}

              {selectedTask?.deleteRequestStatus === "rejected" && (
                <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700/80">
                    Delete permission rejected
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--brand-medium-gray)]">
                    {selectedTask?.deleteReviewMessage ||
                      "The employee must continue working on this task."}
                  </p>
                </div>
              )}

              {/* Google Drive Reference */}
              <div className="mt-5">
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-black)]">
                  Google Drive Reference
                </label>

                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700">
                      <FileText size={19} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--brand-dark-gray)]">
                        Add task reference files from Google Drive
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--brand-medium-gray)]">
                        Upload your reference files manually into the
                        <span className="text-[var(--brand-black)]">
                          {" "}
                          Task Reference{" "}
                        </span>
                        folder in Google Drive, then paste the folder or file
                        link below.
                      </p>
                    </div>
                  </div>

                  <input
                    type="url"
                    value={form.referenceDriveUrl}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        referenceDriveUrl: event.target.value,
                      })
                    }
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="mt-4 h-14 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none placeholder:text-[var(--brand-black)] focus:border-emerald-500/40"
                  />

                  <p className="mt-2 text-[11px] leading-5 text-[var(--brand-medium-gray)]">
                    Recommended: share the reference folder with the assigned
                    team member as Viewer.
                  </p>
                </div>
              </div>

              {/* Calendar */}
              <div className="mt-5 rounded-2xl border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/[0.05] p-5">
                <label className="flex cursor-pointer items-start gap-4">
                  <input
                    type="checkbox"
                    checked={form.calendarReminder}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        calendarReminder: event.target.checked,
                      })
                    }
                    className="mt-1 h-4 w-4 accent-[var(--brand-red)]"
                  />

                  <div>
                    <div className="flex items-center gap-2">
                      <Calendar size={17} className="text-[var(--brand-red)]" />

                      <span className="text-sm font-semibold">
                        Add deadline reminder
                      </span>
                    </div>

                    <p className="mt-1 text-xs leading-5 text-[var(--brand-medium-gray)]">
                      Creates a calendar event record for this task. Google
                      Calendar API synchronization will use this event later.
                    </p>
                  </div>
                </label>
              </div>

              {/* Smart assignment */}
              <div className="mt-4 rounded-2xl border border-[var(--brand-red-secondary)]/15 bg-[var(--brand-red)]/[0.04] p-5">
                <div className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-red)]/10 text-[var(--brand-red)]">
                    <Sparkles size={18} />
                  </div>

                  <div>
                    <p className="text-sm font-semibold">Smart assignment</p>

                    <p className="mt-1 text-xs leading-5 text-[var(--brand-medium-gray)]">
                      The assigned team member will immediately receive an
                      in-app notification with the task, priority and deadline.
                    </p>
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 rounded-xl border border-[var(--brand-border)] bg-white px-5 py-4 text-sm font-semibold text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)]"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={creating}
                  className="flex flex-[1.5] items-center justify-center gap-2 rounded-xl bg-[var(--brand-red)] px-5 py-4 text-sm font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check size={18} />
                      Create & Assign
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TASK DETAILS MODAL */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 ">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[var(--brand-border)] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between border-b border-[var(--brand-border)] p-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-red)]">
                  Task Details
                </p>

                <h2 className="mt-2 text-2xl font-semibold">
                  {selectedTask.title}
                </h2>
              </div>

              <button
                onClick={() => setSelectedTask(null)}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--brand-border)] bg-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-6">
              <div className="flex flex-wrap gap-2">
                <span
                  className={`rounded-full border px-3 py-2 text-xs font-semibold ${getStatusClass(
                    selectedTask.status,
                  )}`}
                >
                  {selectedTask.status || "TO DO"}
                </span>

                <span
                  className={`rounded-full border px-3 py-2 text-xs font-semibold ${getPriorityClass(
                    selectedTask.priority,
                  )}`}
                >
                  {selectedTask.priority || "MEDIUM"}
                </span>
              </div>

              <div className="mt-6 rounded-2xl border border-[var(--brand-border)] bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-dark-gray)]">
                  Description
                </p>

                <p className="mt-3 text-sm leading-7 text-[var(--brand-medium-gray)]">
                  {selectedTask.description || "No description provided."}
                </p>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {[
                  {
                    label: "ASSIGNED TO",
                    value: selectedTask.assignedToName || "Unassigned",
                    icon: User,
                  },
                  {
                    label: "DEPARTMENT",
                    value: selectedTask.department || "Management",
                    icon: Users,
                  },
                  {
                    label: "CLIENT",
                    value:
                      selectedTask.clientName ||
                      selectedTask.client ||
                      "Internal / No client",
                    icon: Users,
                  },
                  {
                    label: "TASK TYPE",
                    value: selectedTask.taskType || "Other",
                    icon: FileText,
                  },
                  {
                    label: "START DATE",
                    value: formatDate(selectedTask.startDate),
                    icon: Calendar,
                  },
                  {
                    label: "DEADLINE",
                    value: `${formatDate(
                      selectedTask.deadlineDate || selectedTask.deadline,
                    )} • ${selectedTask.deadlineTime || ""}`,
                    icon: Clock3,
                  },
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-[var(--brand-border)] bg-white p-5"
                    >
                      <div className="flex items-center gap-2 text-[var(--brand-black)]">
                        <Icon size={15} />

                        <span className="text-[10px] font-semibold tracking-wider">
                          {item.label}
                        </span>
                      </div>

                  <p className="mt-3 text-sm font-semibold text-[var(--brand-dark-gray)]">
                    {item.value}
                  </p>
                    </div>
                  );
                })}
              </div>

              {selectedTaskClient && <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Link href={`/founder/clients/${encodeURIComponent(selectedTaskClient.id)}?tab=Work`} className="rounded-xl border p-4 hover:border-[var(--brand-red)]">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Client</span>
                  <span className="mt-1 block text-sm font-semibold">{selectedTask.clientName || selectedTask.client || clients.find((client) => client.id === selectedTask.clientId)?.company || "View client"}</span>
                </Link>
                {selectedTask.workId && <Link href={`/founder/clients/${encodeURIComponent(selectedTaskClient.id)}?tab=Work&workId=${encodeURIComponent(selectedTask.workId)}`} className="rounded-xl border p-4 hover:border-[var(--brand-red)]">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500">Work / Deliverable</span>
                  <span className="mt-1 block text-sm font-semibold">{clientWork.find((work) => work.id === selectedTask.workId)?.name || "View work"}</span>
                </Link>}
              </div>}

              {selectedTask.assignmentType === "team" && (
                <div className="mt-4 rounded-2xl border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/[0.04] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-red)]">
                        Team Task
                      </p>
                      <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                        {selectedTask.submitterMode === "anybody"
                          ? "Anybody in the selected team can submit. The first successful submission completes the task for everyone."
                          : `Only ${selectedTask.submitterName || "the selected employee"} can submit this task.`}
                      </p>
                    </div>
                    {selectedTask.teamLeadName && (
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[10px] font-semibold text-amber-700">
                        TL: {selectedTask.teamLeadName}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    {(selectedTask.teamMembers || []).map((member) => (
                      <div
                        key={member.id}
                        className="rounded-xl border border-[var(--brand-border)] bg-white p-3"
                      >
                        <p className="text-sm font-semibold text-[var(--brand-dark-gray)]">
                          {member.name || member.email || "Team Member"}
                        </p>
                        <p className="mt-1 text-[10px] text-[var(--brand-medium-gray)]">
                          Dep: {member.department || "Not set"} · Role:{" "}
                          {member.role || "Not set"}
                          {member.isTeamLead ? " · Team Lead (TL)" : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SUBMITTED WORK / REVIEW */}
              {isSubmittedTask(selectedTask.status) && (
                <div className="mt-4 rounded-2xl border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/[0.05] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-red)]">
                        Submitted work · ready for review
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[var(--brand-dark-gray)]">
                        {selectedTask.submissionName || "Submission note only"}
                      </p>
                      {selectedTask.submittedByName && (
                        <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                          Submitted by {selectedTask.submittedByName}
                        </p>
                      )}
                      {selectedTask.assignmentType === "team" && (
                        <p className="mt-1 text-[11px] text-emerald-700/60">
                          This submission is visible to every selected team
                          member.
                        </p>
                      )}
                      {Boolean(selectedTask.submissionAt) && (
                        <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                          {formatDateTime(selectedTask.submissionAt)}
                        </p>
                      )}
                    </div>
                    {selectedTask.submissionUrl && (
                      <a
                        href={selectedTask.submissionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-2.5 text-xs font-semibold text-[var(--brand-black)] hover:bg-[var(--brand-red-light)]"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Download size={15} /> Open submission
                        </span>
                      </a>
                    )}
                  </div>

                  {selectedTask.submissionNote && (
                    <div className="mt-4 rounded-xl border border-[var(--brand-border)] bg-white p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-dark-gray)]">
                        Submission note
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--brand-medium-gray)]">
                        {selectedTask.submissionNote}
                      </p>
                    </div>
                  )}

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      onClick={() => approveTask(selectedTask)}
                      disabled={reviewLoading === selectedTask.id}
                      className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold disabled:opacity-50"
                    >
                      {reviewLoading === selectedTask.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Check size={16} />
                      )}
                      Approve Work
                    </button>
                    <button
                      onClick={() => {
                        setReviewFeedback(
                          selectedTask.feedback ||
                            selectedTask.reviewComment ||
                            "",
                        );
                        setChangeRecipientIds(
                          selectedTask.teamMemberIds?.length
                            ? [...selectedTask.teamMemberIds]
                            : selectedTask.assignedTo
                              ? [selectedTask.assignedTo]
                              : [],
                        );
                        setShowChangesModal(true);
                      }}
                      disabled={reviewLoading === selectedTask.id}
                      className="flex items-center justify-center gap-2 rounded-xl border border-orange-500/20 bg-orange-500/[0.07] px-4 py-3 text-sm font-semibold text-orange-700 disabled:opacity-50"
                    >
                      <RefreshCw size={16} /> Request Changes
                    </button>
                  </div>
                </div>
              )}

              {selectedTask.feedback &&
                !isSubmittedTask(selectedTask.status) && (
                  <div className="mt-4 rounded-2xl border border-orange-500/15 bg-orange-500/[0.04] p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-700/80">
                      Founder feedback
                    </p>
                    {selectedTask.changeRecipientNames &&
                      selectedTask.changeRecipientNames.length > 0 && (
                        <p className="mt-2 text-[11px] text-orange-700/60">
                          Sent to:{" "}
                          {selectedTask.changeRecipientNames.join(", ")}
                        </p>
                      )}
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--brand-medium-gray)]">
                      {selectedTask.feedback}
                    </p>
                  </div>
                )}

              {/* Workflow */}
              <div className="mt-4 rounded-2xl border border-[var(--brand-border)] bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-dark-gray)]">
                  Workflow
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {[
                    "TO DO",
                    "IN PROGRESS",
                    "SUBMITTED",
                    "CHANGES REQUESTED",
                    "APPROVED",
                    "COMPLETED",
                  ].map((status, index) => (
                    <div key={status} className="flex items-center gap-2">
                      <span
                        className={`rounded-lg border px-3 py-2 text-[10px] font-semibold ${
                          selectedTask.status === status
                            ? "border-[var(--brand-red-secondary)]/40 bg-[var(--brand-red)]/15 text-[var(--brand-red)]"
                            : "border-[var(--brand-border)] bg-white text-[var(--brand-black)]"
                        }`}
                      >
                        {status}
                      </span>

                      {index < 4 && (
                        <span className="text-[var(--brand-black)]">→</span>
                      )}
                    </div>
                  ))}
                </div>

                {selectedTask.status === "CHANGES REQUESTED" && (
                  <div className="mt-4 rounded-xl border border-orange-500/20 bg-orange-500/10 p-4 text-xs text-orange-700">
                    Changes have been requested. The assigned person should
                    update the work and submit it again.
                  </div>
                )}
              </div>

              {/* Google Drive Reference */}
              {selectedTask.referenceDriveUrl && (
                <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700/80">
                        Google Drive reference
                      </p>
                      <p className="mt-2 text-sm text-[var(--brand-medium-gray)]">
                        Reference files for this task are stored in Google
                        Drive.
                      </p>
                    </div>

                    <a
                      href={selectedTask.referenceDriveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-xl bg-emerald-600/90 px-4 py-2.5 text-xs font-semibold text-[var(--brand-black)] transition hover:bg-emerald-500"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Download size={15} /> Open Google Drive
                      </span>
                    </a>
                  </div>
                </div>
              )}

              {/* Legacy Firebase Storage attachments */}
              {selectedTask.attachmentUrls &&
                selectedTask.attachmentUrls.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-[var(--brand-border)] bg-white p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-dark-gray)]">
                      Legacy attachments
                    </p>
                    <div className="mt-4 space-y-2">
                      {selectedTask.attachmentUrls.map((url, index) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 transition hover:bg-[var(--brand-red-light)]"
                        >
                          <span className="flex items-center gap-3 text-sm text-[var(--brand-black)]">
                            <FileText
                              size={16}
                              className="text-[var(--brand-red)]"
                            />
                            {selectedTask.attachmentNames?.[index] ||
                              `Attachment ${index + 1}`}
                          </span>
                          <Download
                            size={16}
                            className="text-[var(--brand-black)]"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

              {selectedTask.calendarReminder && (
                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/[0.05] p-5">
                  <Calendar size={19} className="text-[var(--brand-red)]" />

                  <div>
                    <p className="text-sm font-semibold">
                      Calendar reminder enabled
                    </p>

                    <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                      This task has been prepared for calendar integration.
                    </p>
                  </div>
                </div>
              )}

              {/* Founder completion — available after approval */}
              {normalizeStatus(selectedTask.status) === "approved" && (
                <button
                  onClick={() => markTaskCompleted(selectedTask)}
                  disabled={reviewLoading === selectedTask.id}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-[var(--brand-black)] transition hover:bg-emerald-600 disabled:opacity-50"
                >
                  {reviewLoading === selectedTask.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  Mark Task Completed
                </button>
              )}

              {/* Founder delete — available only after Founder approval */}
              {(normalizeStatus(selectedTask.status) === "approved" ||
                normalizeStatus(selectedTask.status) === "completed") && (
                <button
                  onClick={() => handleDeleteTask(selectedTask)}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.05] px-5 py-3 text-sm font-medium text-red-700 transition hover:bg-red-500/10"
                >
                  <Trash2 size={16} />
                  Delete Task
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showChangesModal && selectedTask && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 ">
          <div className="w-full max-w-xl rounded-3xl border border-[var(--brand-border)] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-orange-700/70">
                  Review decision
                </p>
                <h2 className="mt-1 text-xl font-semibold">Request changes</h2>
                <p className="mt-2 text-xs text-[var(--brand-medium-gray)]">
                  Choose who should receive these changes, then describe exactly
                  what needs to be changed.
                </p>
              </div>
              <button
                onClick={() => setShowChangesModal(false)}
                className="rounded-xl bg-white p-2 text-[var(--brand-black)] hover:text-[var(--brand-black)]"
              >
                <X size={17} />
              </button>
            </div>
            <div className="mt-5 rounded-2xl border border-orange-500/15 bg-orange-500/[0.04] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-700/70">
                Send changes to
              </p>
              <div className="mt-3 space-y-2">
                {(selectedTask.teamMembers &&
                selectedTask.teamMembers.length > 0
                  ? selectedTask.teamMembers
                  : [
                      {
                        id: selectedTask.assignedTo || "",
                        name:
                          selectedTask.assignedToName || "Assigned Employee",
                        role: "",
                        department: "",
                        isTeamLead: false,
                      },
                    ]
                ).map((member) => {
                  const checked = changeRecipientIds.includes(member.id);
                  return (
                    <button
                      type="button"
                      key={member.id}
                      onClick={() =>
                        setChangeRecipientIds(
                          checked
                            ? changeRecipientIds.filter(
                                (id) => id !== member.id,
                              )
                            : [...changeRecipientIds, member.id],
                        )
                      }
                      className={`w-full rounded-xl border p-3 text-left ${checked ? "border-orange-500/30 bg-orange-500/10" : "border-[var(--brand-border)] bg-white"}`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-md border ${checked ? "border-orange-400 bg-orange-500 text-[var(--brand-black)]" : "border-[var(--brand-border)] text-transparent"}`}
                        >
                          <Check size={13} />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-[var(--brand-dark-gray)]">
                            {member.name || member.email}
                          </p>
                          <p className="mt-1 text-[10px] text-[var(--brand-medium-gray)]">
                            Dep: {member.department || "Not set"} · Role:{" "}
                            {member.role || "Not set"}
                            {member.isTeamLead ? " · Team Lead (TL)" : ""}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {selectedTask.assignmentType === "team" && (
                  <button
                    type="button"
                    onClick={() => {
                      const ids = (selectedTask.teamMemberIds || []).filter(
                        Boolean,
                      );
                      setChangeRecipientIds(
                        changeRecipientIds.length === ids.length ? [] : ids,
                      );
                    }}
                    className={`w-full rounded-xl border p-3 text-left ${selectedTask.teamMemberIds?.length && changeRecipientIds.length === selectedTask.teamMemberIds.length ? "border-[var(--brand-red-secondary)]/30 bg-[var(--brand-red)]/10" : "border-[var(--brand-border)] bg-white"}`}
                  >
                    <p className="text-sm font-semibold text-[var(--brand-red)]">
                      All
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--brand-medium-gray)]">
                      Send the change request to every selected team member.
                    </p>
                  </button>
                )}
              </div>
            </div>

            <textarea
              autoFocus
              value={reviewFeedback}
              onChange={(event) => setReviewFeedback(event.target.value)}
              rows={7}
              placeholder="Example: Please correct the opening section, replace the final clip and resubmit before the deadline."
              className="mt-5 w-full resize-none rounded-2xl border border-[var(--brand-border)] bg-white p-4 text-sm leading-6 text-[var(--brand-black)] outline-none placeholder:text-[var(--brand-black)] focus:border-orange-500/40"
            />
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setShowChangesModal(false)}
                className="flex-1 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--brand-black)]"
              >
                Cancel
              </button>
              <button
                onClick={() => requestChanges(selectedTask)}
                disabled={reviewLoading === selectedTask.id}
                className="flex-1 rounded-xl bg-[var(--brand-red)] px-4 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {reviewLoading === selectedTask.id
                  ? "Saving..."
                  : "Request Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
