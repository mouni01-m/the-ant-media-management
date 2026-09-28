"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Filter,
  FolderOpen,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  Paperclip,
  Pencil,
  Play,
  Search,
  Send,
  Sparkles,
  Upload,
  UserRound,
  X,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { motion } from "framer-motion";
import BrandLogo from "@/app/components/brand-logo";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  addDoc,
  runTransaction,
} from "firebase/firestore";

import { onAuthStateChanged, signOut, User } from "firebase/auth";

import { auth, db } from "@/lib/firebase";
import { toFirestoreDate, toFirestoreMillis } from "@/lib/firestore-time";

type TaskStatus =
  | "todo"
  | "in_progress"
  | "submitted"
  | "review"
  | "changes_requested"
  | "approved"
  | "completed";

type Task = {
  id: string;

  title?: string;
  description?: string;

  client?: string;
  department?: string;
  taskType?: string;

  assignedTo?: string;
  assignedToName?: string;
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
  submittedBy?: string;
  deleteRequestStatus?: "none" | "pending" | "approved" | "rejected";
  deleteRequestedBy?: string;
  deleteRequestedByName?: string;
  deleteRequestedAt?: unknown;
  deleteReviewedAt?: unknown;
  deleteReviewedBy?: string;
  deleteReviewedByName?: string;
  deleteReviewMessage?: string;
  submittedByName?: string;
  submissionNote?: string;

  priority?: string;
  status?: string;

  startDate?: string;
  deadline?: string;
  deadlineTime?: string;

  attachments?: unknown[];
  referenceDriveUrl?: string;
  referenceDriveType?: string;

  submissionUrl?: string;
  submissionType?: string;
  submissionName?: string;
  submissionAt?: unknown;
  submissionEditedAt?: unknown;
  submissionEditedBy?: string;
  submissionEditedByName?: string;

  feedback?: string;
  reviewComment?: string;

  createdAt?: unknown;
  updatedAt?: unknown;
};

type Profile = {
  name?: string;
  email?: string;
  role?: string;
  department?: string;
  active?: boolean;
};

type Founder = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
};

const statusConfig: Record<
  string,
  {
    label: string;
    className: string;
    icon: LucideIcon;
  }
> = {
  todo: {
    label: "To Do",
    className: "text-slate-300 bg-slate-500/10 border-slate-500/20",
    icon: FolderOpen,
  },

  "to do": {
    label: "To Do",
    className: "text-slate-300 bg-slate-500/10 border-slate-500/20",
    icon: FolderOpen,
  },

  in_progress: {
    label: "In Progress",
    className:
      "text-[var(--brand-red)] bg-[var(--brand-red)]/10 border-[var(--brand-red-secondary)]/20",
    icon: Play,
  },

  "in progress": {
    label: "In Progress",
    className:
      "text-[var(--brand-red)] bg-[var(--brand-red)]/10 border-[var(--brand-red-secondary)]/20",
    icon: Play,
  },

  submitted: {
    label: "Submitted",
    className:
      "text-[var(--brand-red)] bg-[var(--brand-red)]/10 border-[var(--brand-red-secondary)]/20",
    icon: Send,
  },

  review: {
    label: "Under Review",
    className:
      "text-[var(--brand-red)] bg-[var(--brand-red)]/10 border-[var(--brand-red-secondary)]/20",
    icon: MessageSquare,
  },

  changes_requested: {
    label: "Changes Requested",
    className: "text-orange-700 bg-orange-500/10 border-orange-500/20",
    icon: RefreshCw,
  },

  changes: {
    label: "Changes Requested",
    className: "text-orange-700 bg-orange-500/10 border-orange-500/20",
    icon: RefreshCw,
  },

  approved: {
    label: "Approved",
    className: "text-emerald-700 bg-emerald-500/10 border-emerald-500/20",
    icon: CheckCircle2,
  },

  completed: {
    label: "Completed",
    className: "text-emerald-700 bg-emerald-500/10 border-emerald-500/20",
    icon: CheckCircle2,
  },
};

const priorityConfig: Record<string, string> = {
  low: "text-slate-300 bg-slate-500/10 border-slate-500/20",
  medium: "text-yellow-300 bg-yellow-500/10 border-yellow-500/20",
  high: "text-orange-700 bg-orange-500/10 border-orange-500/20",
  urgent: "text-red-700 bg-red-500/10 border-red-500/20",
};

function normalize(value?: string) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .trim();

  if (normalized === "to_do" || normalized === "todo") {
    return "todo";
  }

  return normalized;
}

function formatDate(value?: string) {
  if (!value) return "No deadline";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: unknown) {
  if (!value) return "Not available";

  try {
    const date = toFirestoreDate(value);
    if (!date) return "Not available";

    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Not available";
  }
}

function getTimestamp(value: unknown) { return toFirestoreMillis(value); }

function isCompleted(status?: string) {
  return normalize(status) === "completed";
}

function isReview(status?: string) {
  return ["submitted", "review"].includes(normalize(status));
}

function isChangesRequested(status?: string) {
  return ["changes_requested", "changes"].includes(normalize(status));
}

function isOverdue(task: Task) {
  if (!task.deadline) return false;

  const date = new Date(task.deadline);

  if (Number.isNaN(date.getTime())) return false;

  return date.getTime() < Date.now() && !isCompleted(task.status);
}

function getDaysRemaining(task: Task) {
  if (!task.deadline) return null;

  const deadline = new Date(task.deadline);

  if (Number.isNaN(deadline.getTime())) return null;

  const diff = deadline.getTime() - Date.now();

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((word) => word.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function EmployeeTasksPage() {
  const [user, setUser] = useState<User | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);

  const [loading, setLoading] = useState(true);

  const [menuOpen, setMenuOpen] = useState(false);

  const [search, setSearch] = useState("");

  const [filter, setFilter] = useState<
    "all" | "active" | "review" | "changes" | "completed" | "overdue"
  >("all");

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [submissionDriveUrl, setSubmissionDriveUrl] = useState("");

  const [submissionText, setSubmissionText] = useState("");

  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const [showEditSubmissionModal, setShowEditSubmissionModal] = useState(false);

  const [editingSubmissionUrl, setEditingSubmissionUrl] = useState("");

  const [editingSubmissionText, setEditingSubmissionText] = useState("");

  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    let unsubscribeTasks: (() => void) | null = null;

    let unsubscribeNotifications: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        window.location.href = "/";
        return;
      }

      setUser(currentUser);

      try {
        /*
         * PROFILE
         */

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
          !["employee", "intern"].includes(String(profileData.role || ""))
        ) {
          await signOut(auth);
          window.location.href = "/";
          return;
        }

        setProfile(profileData);

        /*
         * TASKS
         */

        /*
         * TASKS
         *
         * Listen to both:
         * 1. normal single-assignee tasks
         * 2. shared team tasks where this user is in teamMemberIds
         */
        const taskMap = new Map<string, Task>();

        const publishTasks = () => {
          const loadedTasks = Array.from(taskMap.values()).sort(
            (a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt),
          );

          setTasks(loadedTasks);
          setLoading(false);
        };

        const assignedTasksQuery = query(
          collection(db, "tasks"),
          where("assignedTo", "==", currentUser.uid),
        );

        const teamTasksQuery = query(
          collection(db, "tasks"),
          where("teamMemberIds", "array-contains", currentUser.uid),
        );

        const unsubscribeAssigned = onSnapshot(
          assignedTasksQuery,
          (snapshot) => {
            snapshot.docs.forEach((taskDoc) => {
              taskMap.set(taskDoc.id, {
                id: taskDoc.id,
                ...(taskDoc.data() as Omit<Task, "id">),
              });
            });
            publishTasks();
          },
          (error) => {
            console.error("Employee assigned-task listener error:", error);
            setLoading(false);
          },
        );

        const unsubscribeTeam = onSnapshot(
          teamTasksQuery,
          (snapshot) => {
            snapshot.docs.forEach((taskDoc) => {
              taskMap.set(taskDoc.id, {
                id: taskDoc.id,
                ...(taskDoc.data() as Omit<Task, "id">),
              });
            });
            publishTasks();
          },
          (error) => {
            console.error("Employee team-task listener error:", error);
            setLoading(false);
          },
        );

        unsubscribeTasks = () => {
          unsubscribeAssigned();
          unsubscribeTeam();
        };

        /*
         * NOTIFICATIONS
         */

        const notificationQuery = query(
          collection(db, "notifications"),
          where("userId", "==", currentUser.uid),
        );

        unsubscribeNotifications = onSnapshot(
          notificationQuery,
          (snapshot) => {
            const unread = snapshot.docs.filter(
              (item) => item.data().read !== true,
            ).length;

            setNotificationCount(unread);
          },
          (error) => {
            console.error("Employee notification listener error:", error);
          },
        );
      } catch (error) {
        console.error("EMPLOYEE TASK PAGE ERROR:", error);

        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();

      if (unsubscribeTasks) {
        unsubscribeTasks();
      }

      if (unsubscribeNotifications) {
        unsubscribeNotifications();
      }
    };
  }, []);

  /*
   * STATISTICS
   */

  const activeTasks = useMemo(
    () => tasks.filter((task) => !isCompleted(task.status)),
    [tasks],
  );

  const reviewTasks = useMemo(
    () => tasks.filter((task) => isReview(task.status)),
    [tasks],
  );

  const changesTasks = useMemo(
    () => tasks.filter((task) => isChangesRequested(task.status)),
    [tasks],
  );

  const completedTasks = useMemo(
    () => tasks.filter((task) => isCompleted(task.status)),
    [tasks],
  );

  const overdueTasks = useMemo(
    () => tasks.filter((task) => isOverdue(task)),
    [tasks],
  );

  /*
   * FILTERING
   */

  const filteredTasks = useMemo(() => {
    const term = search.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesSearch =
        !term ||
        [
          task.title,
          task.description,
          task.client,
          task.department,
          task.taskType,
          task.priority,
          task.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term);

      if (!matchesSearch) {
        return false;
      }

      switch (filter) {
        case "active":
          return !isCompleted(task.status);

        case "review":
          return isReview(task.status);

        case "changes":
          return isChangesRequested(task.status);

        case "completed":
          return isCompleted(task.status);

        case "overdue":
          return isOverdue(task);

        default:
          return true;
      }
    });
  }, [tasks, search, filter]);

  /*
   * LOGOUT
   */

  async function handleLogout() {
    await signOut(auth);
    window.location.href = "/";
  }

  /*
   * START TASK
   */

  async function startTask(task: Task) {
    try {
      setActionLoading(task.id);

      await updateDoc(doc(db, "tasks", task.id), {
        status: "in_progress",
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSelectedTask({
        ...task,
        status: "in_progress",
      });
    } catch (error) {
      console.error("Failed to start task:", error);

      alert("Unable to start this task. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }

  /*
   * RESTART AFTER CHANGES
   */

  async function continueAfterChanges(task: Task) {
    try {
      setActionLoading(task.id);

      await updateDoc(doc(db, "tasks", task.id), {
        status: "in_progress",
        changesStartedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSelectedTask({
        ...task,
        status: "in_progress",
      });
    } catch (error) {
      console.error("Failed to restart task:", error);

      alert("Unable to restart this task.");
    } finally {
      setActionLoading(null);
    }
  }

  /*
   * MARK APPROVED TASK AS COMPLETED
   */
  async function markTaskCompleted(task: Task) {
    if (normalize(task.status) !== "approved") {
      alert("Only an approved task can be marked as completed.");
      return;
    }

    try {
      setActionLoading(task.id);

      await updateDoc(doc(db, "tasks", task.id), {
        status: "COMPLETED",
        completedAt: serverTimestamp(),
        completedBy: user?.uid || "",
        completedByName:
          profile?.name ||
          user?.displayName ||
          user?.email?.split("@")[0] ||
          "Employee",
        updatedAt: serverTimestamp(),
      });

      await notifyFounder(task, "completed");

      setSelectedTask({
        ...task,
        status: "COMPLETED",
      });

      alert("Task marked as completed. The Founder has been notified.");
    } catch (error) {
      console.error("Failed to complete task:", error);

      alert("Unable to mark this task as completed. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }

  /*
   * FIND FOUNDER
   */

  async function findFounder(): Promise<Founder | null> {
    try {
      const founderQuery = query(
        collection(db, "users"),
        where("role", "==", "founder"),
      );

      const founderSnapshot = await getDocs(founderQuery);

      if (founderSnapshot.empty) {
        return null;
      }

      const founderDoc = founderSnapshot.docs[0];

      return {
        id: founderDoc.id,
        ...(founderDoc.data() as Omit<Founder, "id">),
      };
    } catch (error) {
      console.error("Unable to find founder:", error);

      return null;
    }
  }

  /*
   * SEND FOUNDER NOTIFICATION
   */

  async function notifyFounder(
    task: Task,
    type: "submission" | "changes" | "completed",
  ) {
    try {
      const founder = await findFounder();

      if (!founder) {
        console.warn("No founder account found.");

        return;
      }

      const employeeName = profile?.name || user?.displayName || "Employee";

      let title = "Task submitted";

      let message = `${employeeName} submitted "${task.title || "Untitled task"}" for review.`;

      if (type === "changes") {
        title = "Task resubmitted";

        message = `${employeeName} resubmitted "${task.title || "Untitled task"}" after requested changes.`;
      }

      if (type === "completed") {
        title = "Task completed";

        message = `${employeeName} completed "${task.title || "Untitled task"}".`;
      }

      await addDoc(collection(db, "notifications"), {
        userId: founder.id,
        recipientId: founder.id,

        senderId: user?.uid || "",
        senderName: employeeName,

        title,
        message,

        type: type === "submission" ? "submission" : "review",

        priority: task.priority === "urgent" ? "urgent" : "important",

        read: false,

        taskId: task.id,

        link: "/founder/tasks",

        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Failed to notify founder:", error);
    }
  }

  /*
   * SUBMIT TASK
   */

  function isValidDriveUrl(value: string) {
    try {
      const url = new URL(value.trim());
      return (
        url.hostname === "drive.google.com" ||
        url.hostname === "docs.google.com"
      );
    } catch {
      return false;
    }
  }

  function isAllowedToSubmit(task: Task) {
    const isTeamTask =
      task.assignmentType === "team" ||
      (task.teamMemberIds && task.teamMemberIds.length > 0);

    if (!isTeamTask) {
      return task.assignedTo === user?.uid;
    }

    const memberIds = task.teamMemberIds || [];

    if (!user?.uid || !memberIds.includes(user.uid)) {
      return false;
    }

    const recipients =
      task.changeRecipientIds && task.changeRecipientIds.length > 0
        ? task.changeRecipientIds
        : null;

    if (isChangesRequested(task.status)) {
      // When the Founder explicitly sends requested changes to a member,
      // that recipient is authorized to revise and resubmit, even if they
      // were not the original team submitter.
      if (recipients) {
        return recipients.includes(user.uid);
      }
    }

    if (task.submitterMode === "anybody") {
      return true;
    }

    // Team tasks with a selected submitter are restricted to that one person.
    // Being a team member alone must never expose the Submit Work button.
    if (task.submitterMode === "selected") {
      return task.submitterId === user.uid;
    }

    // Legacy team tasks without submitterMode remain submit-enabled only for
    // the primary assigned member, not every team member.
    return task.submitterId
      ? task.submitterId === user.uid
      : task.assignedTo === user.uid;
  }

  async function submitTask() {
    if (!selectedTask) {
      return;
    }

    if (!isAllowedToSubmit(selectedTask)) {
      alert("You are not authorized to submit this task.");
      return;
    }

    const driveUrl = submissionDriveUrl.trim();

    if (!driveUrl) {
      alert("Please paste the Google Drive link for your completed work.");
      return;
    }

    if (!isValidDriveUrl(driveUrl)) {
      alert("Please enter a valid Google Drive or Google Docs link.");
      return;
    }

    if (!submissionText.trim()) {
      alert("Please add a short submission note.");
      return;
    }

    try {
      setActionLoading(selectedTask.id);

      const isResubmission = isChangesRequested(selectedTask.status);

      const isTeamTask =
        selectedTask.assignmentType === "team" ||
        Boolean(
          selectedTask.teamMemberIds && selectedTask.teamMemberIds.length > 0,
        );

      // A shared team task is completed as soon as the first authorized
      // team member submits successfully. Use a transaction so two team
      // members submitting at nearly the same time cannot overwrite the
      // first submission.
      const nextStatus = isTeamTask ? "completed" : "submitted";
      const taskRef = doc(db, "tasks", selectedTask.id);

      await runTransaction(db, async (transaction) => {
        const latestSnapshot = await transaction.get(taskRef);
        if (!latestSnapshot.exists()) {
          throw new Error("Task no longer exists.");
        }

        const latestTask = latestSnapshot.data() as Task;
        const latestStatus = normalize(latestTask.status);

        if (isTeamTask && latestStatus === "completed") {
          throw new Error(
            "This team task has already been submitted by another team member.",
          );
        }

        transaction.update(taskRef, {
          status: nextStatus,
          submissionUrl: driveUrl,
          submissionType: "google_drive",
          submissionName: "Google Drive submission",
          submissionNote: submissionText.trim(),
          submittedBy: user?.uid || "",
          submittedByName: profile?.name || user?.displayName || "Employee",
          submissionAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      await notifyFounder(
        {
          ...selectedTask,
          status: nextStatus,
          submissionUrl: driveUrl,
          submissionName: "Google Drive submission",
          submissionNote: submissionText.trim(),
          submittedBy: user?.uid || "",
          submittedByName: profile?.name || user?.displayName || "Employee",
        },
        isTeamTask ? "completed" : isResubmission ? "changes" : "submission",
      );

      setSubmissionDriveUrl("");
      setSubmissionText("");
      setShowSubmitModal(false);

      const finalStatus =
        selectedTask.assignmentType === "team" ||
        Boolean(
          selectedTask.teamMemberIds && selectedTask.teamMemberIds.length > 0,
        )
          ? "completed"
          : "submitted";

      setSelectedTask({
        ...selectedTask,
        status: finalStatus,
        submissionUrl: driveUrl,
        submissionType: "google_drive",
        submissionName: "Google Drive submission",
        submissionNote: submissionText.trim(),
        submittedBy: user?.uid || "",
        submittedByName: profile?.name || user?.displayName || "Employee",
      });

      alert(
        finalStatus === "completed"
          ? "Team task completed. The submitted document is now visible to all selected team members."
          : "Work submitted successfully. The Founder has been notified.",
      );
    } catch (error) {
      console.error("SUBMIT TASK ERROR:", error);
      alert("Failed to submit the task. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }

  /*
   * EDIT SUBMISSION
   *
   * Allows an employee/intern to correct a submitted Google Drive
   * document link or submission note while the work is still in the
   * Founder review workflow. The original task remains the same.
   */

  function openEditSubmission(task: Task) {
    if (!task.submissionUrl) {
      alert("There is no submitted Google Drive link to edit.");
      return;
    }

    const currentStatus = normalize(task.status);

    if (!["submitted", "review"].includes(currentStatus)) {
      alert(
        "The submission can be edited only while it is waiting for Founder review.",
      );
      return;
    }

    setSelectedTask(task);
    setEditingSubmissionUrl(task.submissionUrl || "");
    setEditingSubmissionText(task.submissionNote || "");
    setShowEditSubmissionModal(true);
  }

  async function updateSubmission() {
    if (!selectedTask || !user?.uid) return;

    const driveUrl = editingSubmissionUrl.trim();

    if (!isValidDriveUrl(driveUrl)) {
      alert("Please enter a valid Google Drive or Google Docs link.");
      return;
    }

    if (!editingSubmissionText.trim()) {
      alert("Please add a short submission note.");
      return;
    }

    const currentStatus = normalize(selectedTask.status);

    if (!["submitted", "review"].includes(currentStatus)) {
      alert(
        "This submission is no longer editable because its review state has changed.",
      );
      return;
    }

    try {
      setActionLoading(selectedTask.id);

      const employeeName =
        profile?.name ||
        user.displayName ||
        user.email?.split("@")[0] ||
        "Employee";

      await updateDoc(doc(db, "tasks", selectedTask.id), {
        submissionUrl: driveUrl,
        submissionType: "google_drive",
        submissionName: "Google Drive submission",
        submissionNote: editingSubmissionText.trim(),
        submissionEditedAt: serverTimestamp(),
        submissionEditedBy: user.uid,
        submissionEditedByName: employeeName,
        updatedAt: serverTimestamp(),
      });

      try {
        const founder = await findFounder();

        if (founder) {
          await addDoc(collection(db, "notifications"), {
            userId: founder.id,
            recipientId: founder.id,
            senderId: user.uid,
            senderName: employeeName,
            title: "Submission updated",
            message: `${employeeName} updated the Google Drive submission for "${selectedTask.title || "Untitled task"}".`,
            type: "submission_updated",
            priority: "important",
            read: false,
            taskId: selectedTask.id,
            taskTitle: selectedTask.title || "Untitled task",
            submissionUrl: driveUrl,
            link: "/founder/tasks",
            createdAt: serverTimestamp(),
          });
        }
      } catch (notificationError) {
        console.error(
          "Submission updated, but Founder notification failed:",
          notificationError,
        );
      }

      setSelectedTask({
        ...selectedTask,
        submissionUrl: driveUrl,
        submissionType: "google_drive",
        submissionName: "Google Drive submission",
        submissionNote: editingSubmissionText.trim(),
        submissionEditedBy: user.uid,
        submissionEditedByName: employeeName,
      });

      setShowEditSubmissionModal(false);
      setEditingSubmissionUrl("");
      setEditingSubmissionText("");

      alert("Submission updated successfully. The Founder has been notified.");
    } catch (error) {
      console.error("EDIT SUBMISSION ERROR:", error);
      alert("Unable to update the submission. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }

  /*
   * DELETE / DELETE REQUEST / RECYCLE BIN
   */

  async function moveTaskToRecycleBin(task: Task, reason: string) {
    if (!user?.uid) {
      throw new Error("User session is missing.");
    }

    const employeeName =
      profile?.name ||
      user.displayName ||
      user.email?.split("@")[0] ||
      "Employee";

    const ownerRole = profile?.role === "intern" ? "intern" : "employee";

    await addDoc(collection(db, "recycleBinTasks"), {
      ...task,
      originalTaskId: task.id,
      deletedAt: serverTimestamp(),
      deletedBy: user.uid,
      deletedByName: employeeName,
      ownerUserId: user.uid,
      ownerRole,
      deletionSource: "employee",
      recycleBinType: "employee",
      deletionReason: reason,
      permanentlyDeleted: false,
    });

    await deleteDoc(doc(db, "tasks", task.id));
  }

  async function notifyFounderAboutDeletion(task: Task, reason: string) {
    try {
      const founder = await findFounder();
      if (!founder || !user?.uid) return;

      const employeeName =
        profile?.name ||
        user.displayName ||
        user.email?.split("@")[0] ||
        "Employee";

      await addDoc(collection(db, "notifications"), {
        userId: founder.id,
        recipientId: founder.id,
        senderId: user.uid,
        senderName: employeeName,
        title: "Task moved to Recycle Bin",
        message: `${employeeName} moved "${task.title || "Untitled task"}" to the Recycle Bin. Reason: ${reason}.`,
        type: "task_deleted",
        priority: "important",
        read: false,
        taskId: task.id,
        taskTitle: task.title || "Untitled task",
        link: "/founder/tasks",
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Failed to notify founder about deletion:", error);
    }
  }

  async function requestDeleteTask(task: Task) {
    if (!user?.uid) return;
    if (normalize(task.deleteRequestStatus) === "pending") {
      alert("Your delete request is already waiting for the Founder.");
      return;
    }
    if (
      normalize(task.deleteRequestStatus) === "approved" &&
      task.deleteRequestedBy === user.uid
    ) {
      await deleteApprovedTask(task);
      return;
    }

    if (
      !window.confirm(
        `Request permission from the Founder to delete "${task.title || "Untitled task"}"?`,
      )
    )
      return;

    try {
      setActionLoading(task.id);
      const employeeName =
        profile?.name ||
        user.displayName ||
        user.email?.split("@")[0] ||
        "Employee";

      await updateDoc(doc(db, "tasks", task.id), {
        deleteRequestStatus: "pending",
        deleteRequestedBy: user.uid,
        deleteRequestedByName: employeeName,
        deleteRequestedAt: serverTimestamp(),
        deleteReviewMessage: "",
        updatedAt: serverTimestamp(),
      });

      const founder = await findFounder();
      if (founder) {
        await addDoc(collection(db, "notifications"), {
          userId: founder.id,
          recipientId: founder.id,
          senderId: user.uid,
          senderName: employeeName,
          title: "Task deletion request",
          message: `${employeeName} requested permission to delete the task "${task.title || "Untitled task"}". Task details: ${task.description || "No description provided."} Deadline: ${formatDate(task.deadline)} at ${task.deadlineTime || "Not set"}.`,
          type: "task_delete_request",
          priority: "important",
          read: false,
          taskId: task.id,
          taskTitle: task.title || "Untitled task",
          link: "/founder/tasks",
          createdAt: serverTimestamp(),
        });
      }

      setSelectedTask({
        ...task,
        deleteRequestStatus: "pending",
        deleteRequestedBy: user.uid,
        deleteRequestedByName: employeeName,
      });
      alert("Delete request sent to the Founder.");
    } catch (error) {
      console.error("DELETE REQUEST ERROR:", error);
      alert("Unable to send the delete request. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteApprovedTask(task: Task) {
    if (!user?.uid) return;
    if (
      task.deleteRequestStatus !== "approved" ||
      task.deleteRequestedBy !== user.uid
    ) {
      alert("The Founder has not approved deletion for your account.");
      return;
    }
    if (
      !window.confirm(
        `Delete "${task.title || "Untitled task"}"? This action cannot be undone.`,
      )
    )
      return;

    try {
      setActionLoading(task.id);

      await moveTaskToRecycleBin(task, "Founder-approved employee deletion");

      await notifyFounderAboutDeletion(task, "Founder-approved deletion");

      setSelectedTask(null);
      alert("Task moved to your Recycle Bin.");
    } catch (error) {
      console.error("APPROVED DELETE ERROR:", error);
      alert(
        "Unable to move the task to the Recycle Bin. The original task was kept safe.",
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteCompletedTask(task: Task) {
    if (!isCompleted(task.status)) return;
    if (
      !window.confirm(
        `Move "${task.title || "Untitled task"}" to your Recycle Bin?`,
      )
    )
      return;

    try {
      setActionLoading(task.id);

      await moveTaskToRecycleBin(
        task,
        "Employee removed completed task from history",
      );

      await notifyFounderAboutDeletion(
        task,
        "Employee removed a completed task from history",
      );

      setSelectedTask(null);
      alert("Completed task moved to your Recycle Bin.");
    } catch (error) {
      console.error("DELETE COMPLETED TASK ERROR:", error);
      alert("Unable to move the completed task to the Recycle Bin.");
    } finally {
      setActionLoading(null);
    }
  }

  /*
   * OPEN TASK
   */

  function openTask(task: Task) {
    setSelectedTask(task);
  }

  /*
   * TODAY
   */

  const todayText = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  /*
   * LOADING
   */

  if (loading) {
    return (
      <main className="min-h-screen bg-white text-[var(--brand-black)] flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-[var(--brand-red)] flex items-center justify-center shadow-sm animate-pulse">
            <Sparkles size={23} />
          </div>

          <p className="text-[var(--brand-medium-gray)]">
            Loading your tasks...
          </p>
        </div>
      </main>
    );
  }

  const displayName =
    profile?.name ||
    user?.displayName ||
    user?.email?.split("@")[0] ||
    "Employee";

  const initials = getInitials(displayName);

  return (
    <main className="min-h-screen bg-white text-[var(--brand-black)] overflow-x-hidden">
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

              <NavItem
                icon={<Sparkles size={18} />}
                label="Overview"
                path="/employee"
              />

              <NavItem
                icon={<FolderOpen size={18} />}
                label="My Tasks"
                active
                badge={activeTasks.length}
                path="/employee/tasks"
              />

              <NavItem
                icon={<Clock3 size={18} />}
                label="Attendance"
                path="/employee/attendance"
              />

              <NavItem
                icon={<CalendarDays size={18} />}
                label="Calendar"
                path="/employee/calendar"
              />

              <NavItem
                icon={<Bell size={18} />}
                label="Notifications"
                badge={notificationCount}
                path="/employee/notifications"
              />

              <NavItem
                icon={<FileText size={18} />}
                label="Leave Requests"
                path="/employee/leave-requests"
              />
            </nav>

            {/* SIGN OUT */}

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

                <button
                  onClick={() => (window.location.href = "/employee")}
                  className="hidden lg:flex h-10 w-10 rounded-xl border border-[var(--brand-border)] items-center justify-center hover:bg-[var(--brand-red-light)]"
                >
                  <ArrowLeft size={17} />
                </button>

                <div>
                  <div className="text-xs text-[var(--brand-black)]">
                    Employee / Workspace
                  </div>

                  <h1 className="text-xl font-semibold">My Tasks</h1>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() =>
                    (window.location.href = "/employee/notifications")
                  }
                  className="relative h-10 w-10 rounded-xl border border-[var(--brand-border)] flex items-center justify-center hover:bg-[var(--brand-red-light)] transition"
                >
                  <Bell size={18} className="text-[var(--brand-black)]" />

                  {notificationCount > 0 && (
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-400 shadow-sm" />
                  )}
                </button>

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
          </header>

          {/* CONTENT */}

          <div className="p-5 lg:p-8 max-w-[1550px] mx-auto">
            {/* HERO */}

            <section className="mb-8">
              <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 text-[var(--brand-red)] mb-3">
                    <Sparkles size={17} />

                    <span className="text-sm font-medium">
                      Personal workspace
                    </span>
                  </div>

                  <div className="text-sm text-[var(--brand-black)] mb-2">
                    {todayText}
                  </div>

                  <h2 className="text-4xl lg:text-5xl font-bold tracking-tight">
                    Your work.
                    <br />
                    <span className="text-[var(--brand-red)]">
                      Your progress.
                    </span>
                  </h2>

                  <p className="mt-4 max-w-2xl text-[var(--brand-medium-gray)] text-base leading-7">
                    Manage your assignments, submit completed work, track
                    deadlines and stay connected with the Founder.
                  </p>
                </div>

                <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05]">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />

                  <span className="text-sm text-emerald-700">
                    Workspace Active
                  </span>
                </div>
              </div>
            </section>

            {/* STATS */}

            <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
              <StatCard
                icon={<FolderOpen size={19} />}
                label="Active Tasks"
                value={activeTasks.length}
                description="Currently assigned"
              />

              <StatCard
                icon={<Clock3 size={19} />}
                label="Overdue"
                value={overdueTasks.length}
                description={
                  overdueTasks.length > 0
                    ? "Needs attention"
                    : "Everything on track"
                }
                danger={overdueTasks.length > 0}
              />

              <StatCard
                icon={<MessageSquare size={19} />}
                label="Under Review"
                value={reviewTasks.length}
                description="Waiting for Founder"
              />

              <StatCard
                icon={<RefreshCw size={19} />}
                label="Changes"
                value={changesTasks.length}
                description="Needs revision"
                warning={changesTasks.length > 0}
              />

              <StatCard
                icon={<CheckCircle2 size={19} />}
                label="Completed"
                value={completedTasks.length}
                description="Finished work"
              />
            </section>

            {/* FILTER BAR */}

            <section className="rounded-2xl border border-[var(--brand-border)] bg-white p-3 mb-6">
              <div className="flex flex-col xl:flex-row gap-3">
                <div className="relative flex-1">
                  <Search
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--brand-black)]"
                  />

                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search your tasks..."
                    className="h-12 w-full rounded-xl border border-[var(--brand-border)] bg-white pl-11 pr-4 text-sm outline-none placeholder:text-[var(--brand-black)] focus:border-[var(--brand-red-secondary)]/40"
                  />
                </div>

                <div className="flex gap-2 overflow-x-auto">
                  <FilterButton
                    active={filter === "all"}
                    onClick={() => setFilter("all")}
                  >
                    <Filter size={15} />
                    All
                  </FilterButton>

                  <FilterButton
                    active={filter === "active"}
                    onClick={() => setFilter("active")}
                  >
                    Active
                    <span className="text-[10px] opacity-60">
                      {activeTasks.length}
                    </span>
                  </FilterButton>

                  <FilterButton
                    active={filter === "review"}
                    onClick={() => setFilter("review")}
                  >
                    Review
                    <span className="text-[10px] opacity-60">
                      {reviewTasks.length}
                    </span>
                  </FilterButton>

                  <FilterButton
                    active={filter === "changes"}
                    onClick={() => setFilter("changes")}
                  >
                    Changes
                    <span className="text-[10px] opacity-60">
                      {changesTasks.length}
                    </span>
                  </FilterButton>

                  <FilterButton
                    active={filter === "overdue"}
                    onClick={() => setFilter("overdue")}
                  >
                    Overdue
                  </FilterButton>

                  <FilterButton
                    active={filter === "completed"}
                    onClick={() => setFilter("completed")}
                  >
                    Completed
                  </FilterButton>
                </div>
              </div>
            </section>

            {/* TASK LIST */}

            <section className="rounded-3xl border border-[var(--brand-border)] bg-white overflow-hidden">
              <div className="p-5 lg:p-6 border-b border-[var(--brand-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">
                    {filter === "all"
                      ? "All My Tasks"
                      : filter === "active"
                        ? "Active Tasks"
                        : filter === "review"
                          ? "Tasks Under Review"
                          : filter === "changes"
                            ? "Changes Requested"
                            : filter === "overdue"
                              ? "Overdue Tasks"
                              : "Completed Tasks"}
                  </h3>

                  <p className="text-sm text-[var(--brand-medium-gray)] mt-1">
                    {filteredTasks.length}{" "}
                    {filteredTasks.length === 1 ? "task" : "tasks"} shown
                  </p>
                </div>

                <button
                  onClick={() => window.location.reload()}
                  className="w-10 h-10 rounded-xl border border-[var(--brand-border)] bg-white flex items-center justify-center hover:bg-[var(--brand-red-light)]"
                  title="Refresh"
                >
                  <RefreshCw size={17} />
                </button>
              </div>

              {filteredTasks.length === 0 ? (
                <EmptyTasks filter={filter} search={search} />
              ) : (
                <div className="divide-y divide-[var(--brand-border)]">
                  {filteredTasks.map((task, index) => {
                    const status =
                      statusConfig[normalize(task.status)] || statusConfig.todo;

                    const StatusIcon = status.icon;

                    const priority =
                      priorityConfig[normalize(task.priority)] ||
                      priorityConfig.medium;

                    const overdue = isOverdue(task);

                    const days = getDaysRemaining(task);

                    return (
                      <motion.div
                        key={task.id}
                        initial={{
                          opacity: 0,
                          y: 8,
                        }}
                        animate={{
                          opacity: 1,
                          y: 0,
                        }}
                        transition={{
                          delay: index * 0.03,
                        }}
                        onClick={() => openTask(task)}
                        className="group cursor-pointer p-5 lg:p-6 hover:bg-[var(--brand-red)]/[0.025] transition-all"
                      >
                        <div className="flex items-start gap-4">
                          {/* ICON */}

                          <div
                            className={`h-12 w-12 shrink-0 rounded-2xl border flex items-center justify-center ${status.className}`}
                          >
                            <StatusIcon size={19} />
                          </div>

                          {/* CONTENT */}

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-base font-semibold truncate">
                                    {task.title || "Untitled Task"}
                                  </h4>

                                  <span
                                    className={`text-[10px] uppercase tracking-wide px-2.5 py-1 rounded-md border ${priority}`}
                                  >
                                    {task.priority || "Medium"}
                                  </span>
                                </div>

                                <p className="text-sm text-[var(--brand-medium-gray)] mt-1 line-clamp-2">
                                  {task.description ||
                                    "No description provided."}
                                </p>
                              </div>

                              <span
                                className={`w-fit shrink-0 text-xs px-2.5 py-1.5 rounded-lg border ${status.className}`}
                              >
                                {status.label}
                              </span>
                            </div>

                            {/* META */}

                            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-xs">
                              <span className="flex items-center gap-1.5 text-[var(--brand-black)]">
                                <FolderOpen size={13} />

                                {task.client || "Internal / Ant Media"}
                              </span>

                              {task.department && (
                                <span className="flex items-center gap-1.5 text-[var(--brand-black)]">
                                  <UserRound size={13} />

                                  {task.department}
                                </span>
                              )}

                              {task.deadline && (
                                <span
                                  className={`flex items-center gap-1.5 ${
                                    overdue
                                      ? "text-red-700"
                                      : days !== null && days <= 2
                                        ? "text-amber-700"
                                        : "text-[var(--brand-black)]"
                                  }`}
                                >
                                  <CalendarDays size={13} />

                                  {overdue
                                    ? "Overdue"
                                    : `Due ${formatDate(task.deadline)}`}
                                </span>
                              )}

                              {task.deadlineTime && (
                                <span className="flex items-center gap-1.5 text-[var(--brand-black)]">
                                  <Clock3 size={13} />

                                  {task.deadlineTime}
                                </span>
                              )}
                            </div>

                            {/* QUICK ACTION */}

                            <div
                              className="mt-4 flex flex-wrap gap-2"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {normalize(task.status) === "todo" && (
                                <button
                                  onClick={() => startTask(task)}
                                  disabled={actionLoading === task.id}
                                  className="px-3 py-2 rounded-lg bg-[var(--brand-red)] text-xs font-semibold hover:brightness-110 transition disabled:opacity-50"
                                >
                                  {actionLoading === task.id ? (
                                    <Loader2
                                      size={14}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <span className="flex items-center gap-1.5">
                                      <Play size={13} />
                                      Start Task
                                    </span>
                                  )}
                                </button>
                              )}

                              {isChangesRequested(task.status) && (
                                <button
                                  onClick={() => continueAfterChanges(task)}
                                  disabled={actionLoading === task.id}
                                  className="px-3 py-2 rounded-lg bg-[var(--brand-red)] text-xs font-semibold hover:brightness-110 transition disabled:opacity-50"
                                >
                                  <span className="flex items-center gap-1.5">
                                    <RefreshCw size={13} />
                                    Work on Changes
                                  </span>
                                </button>
                              )}

                              {[
                                "in_progress",
                                "changes_requested",
                                "changes",
                              ].includes(normalize(task.status)) && (
                                <button
                                  onClick={() => {
                                    setSelectedTask(task);
                                    setSubmissionText("");
                                    setShowSubmitModal(true);
                                  }}
                                  className="px-3 py-2 rounded-lg border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/10 text-[var(--brand-red)] text-xs font-semibold hover:bg-[var(--brand-red)]/15 transition"
                                >
                                  <span className="flex items-center gap-1.5">
                                    <Send size={13} />
                                    Submit Work
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>

                          <ChevronRight
                            size={18}
                            className="shrink-0 text-[var(--brand-black)] group-hover:text-[var(--brand-red)] transition"
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* INFO CARDS */}

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <InfoCard
                number="01"
                title="Work clearly"
                text="Start assigned work, track your deadline and keep your task status updated."
              />

              <InfoCard
                number="02"
                title="Submit confidently"
                text="Upload your completed file and add a submission note before sending it to the Founder."
              />

              <InfoCard
                number="03"
                title="Improve quickly"
                text="If changes are requested, the task returns to your workspace so you can revise and resubmit."
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

      {/* TASK DETAIL MODAL */}

      {selectedTask && !showSubmitModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/75  flex items-center justify-center p-4"
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[var(--brand-border)] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
            onClick={(event) => event.stopPropagation()}
          >
            {/* MODAL HEADER */}

            <div className="p-6 border-b border-[var(--brand-border)] flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--brand-red)]">
                    Task details
                  </span>

                  <span
                    className={`text-[10px] px-2.5 py-1 rounded-full border ${
                      statusConfig[normalize(selectedTask.status)]?.className ||
                      statusConfig.todo.className
                    }`}
                  >
                    {statusConfig[normalize(selectedTask.status)]?.label ||
                      "To Do"}
                  </span>
                </div>

                <h2 className="text-2xl md:text-3xl font-bold">
                  {selectedTask.title || "Untitled Task"}
                </h2>
              </div>

              <button
                onClick={() => setSelectedTask(null)}
                className="w-10 h-10 shrink-0 rounded-xl bg-white hover:bg-[var(--brand-red-light)] flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            {/* BODY */}

            <div className="p-6 space-y-6">
              {/* DESCRIPTION */}

              <div>
                <p className="text-xs uppercase tracking-wider text-[var(--brand-medium-gray)] mb-2">
                  Description
                </p>

                <p className="text-sm text-[var(--brand-medium-gray)] leading-7">
                  {selectedTask.description || "No description provided."}
                </p>
              </div>

              {/* META GRID */}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DetailBox
                  icon={<FolderOpen size={16} />}
                  label="Client"
                  value={selectedTask.client || "Internal / Ant Media"}
                />

                <DetailBox
                  icon={<UserRound size={16} />}
                  label="Department"
                  value={selectedTask.department || "Not specified"}
                />

                <DetailBox
                  icon={<CalendarDays size={16} />}
                  label="Start date"
                  value={
                    selectedTask.startDate
                      ? formatDate(selectedTask.startDate)
                      : "Not specified"
                  }
                />

                <DetailBox
                  icon={<Clock3 size={16} />}
                  label="Deadline"
                  value={
                    selectedTask.deadline
                      ? `${formatDate(selectedTask.deadline)}${
                          selectedTask.deadlineTime
                            ? ` • ${selectedTask.deadlineTime}`
                            : ""
                        }`
                      : "No deadline"
                  }
                />
              </div>

              {selectedTask.assignmentType === "team" && (
                <div className="rounded-2xl border border-[var(--brand-red-secondary)]/15 bg-[var(--brand-red)]/[0.04] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-[var(--brand-red)] font-semibold">
                        Shared Team Task
                      </p>
                      <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                        {selectedTask.submitterMode === "anybody"
                          ? "Anybody from this team can submit. The first successful submission completes the task."
                          : `Submitter: ${selectedTask.submitterName || "Selected employee"}`}
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
                          {member.isTeamLead ? " · Team Lead (TL)" : ""}
                        </p>
                        <p className="mt-1 text-[10px] text-[var(--brand-medium-gray)]">
                          Dep: {member.department || "Not set"} · Role:{" "}
                          {member.role || "Not set"}
                        </p>
                      </div>
                    ))}
                  </div>

                  {!isAllowedToSubmit(selectedTask) &&
                    !isCompleted(selectedTask.status) && (
                      <div className="mt-4 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 text-xs text-[var(--brand-black)]">
                        You are a team member on this task, but the Founder has
                        not selected you as the submitter.
                      </div>
                    )}
                </div>
              )}

              {/* GOOGLE DRIVE REFERENCE */}

              {selectedTask.referenceDriveUrl && (
                <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.04] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-emerald-700">
                        <FolderOpen size={17} />
                        <span className="text-sm font-semibold">
                          Task Reference
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[var(--brand-medium-gray)]">
                        Reference files provided by the Founder are stored in
                        Google Drive.
                      </p>
                    </div>

                    <a
                      href={selectedTask.referenceDriveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-[var(--brand-black)] transition hover:bg-emerald-500"
                    >
                      <span className="flex items-center gap-2">
                        <FolderOpen size={15} />
                        Open Drive
                      </span>
                    </a>
                  </div>
                </div>
              )}

              {selectedTask.referenceDriveUrl && selectedTask.status && (
                <div className="rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 text-xs text-[var(--brand-black)]">
                  Make sure your completed files are uploaded to your designated{" "}
                  <span className="text-[var(--brand-black)]">
                    Task Submission
                  </span>{" "}
                  folder before submitting the link below.
                </div>
              )}

              {/* FEEDBACK */}

              {(selectedTask.feedback || selectedTask.reviewComment) && (
                <div className="rounded-2xl border border-orange-500/15 bg-orange-500/[0.04] p-5">
                  <div className="flex items-center gap-2 text-orange-700 mb-3">
                    <MessageSquare size={17} />

                    <span className="font-semibold text-sm">
                      Founder feedback
                    </span>
                  </div>

                  <p className="text-sm text-[var(--brand-medium-gray)] leading-6">
                    {selectedTask.feedback || selectedTask.reviewComment}
                  </p>
                </div>
              )}

              {/* SUBMISSION */}

              {selectedTask.submissionUrl && (
                <div className="rounded-2xl border border-[var(--brand-red-secondary)]/15 bg-[var(--brand-red)]/[0.04] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">Latest submission</p>

                      <p className="text-xs text-[var(--brand-medium-gray)] mt-1">
                        {selectedTask.submissionName || "Submitted file"}
                      </p>

                      {Boolean(selectedTask.submissionAt) && (
                        <p className="text-[11px] text-[var(--brand-medium-gray)] mt-1">
                          {formatDateTime(selectedTask.submissionAt)}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={selectedTask.submissionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2.5 rounded-xl bg-white hover:bg-[var(--brand-red-light)] text-sm flex items-center gap-2"
                      >
                        <Download size={15} />
                        Open
                      </a>

                      {["submitted", "review"].includes(
                        normalize(selectedTask.status),
                      ) && (
                        <button
                          type="button"
                          onClick={() => openEditSubmission(selectedTask)}
                          className="px-4 py-2.5 rounded-xl border border-[var(--brand-red-secondary)]/20 bg-[var(--brand-red)]/10 text-[var(--brand-red)] hover:bg-[var(--brand-red)]/15 text-sm flex items-center gap-2"
                        >
                          <Pencil size={15} />
                          Edit Submission
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ACTIONS */}

              <div className="flex flex-wrap gap-3 pt-2">
                {normalize(selectedTask.status) === "todo" && (
                  <button
                    onClick={() => startTask(selectedTask)}
                    disabled={actionLoading === selectedTask.id}
                    className="flex-1 min-w-[180px] py-3 rounded-xl bg-[var(--brand-red)] font-semibold text-sm flex items-center justify-center gap-2"
                  >
                    {actionLoading === selectedTask.id ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : (
                      <>
                        <Play size={16} />
                        Start Task
                      </>
                    )}
                  </button>
                )}

                {isChangesRequested(selectedTask.status) && (
                  <button
                    onClick={() => continueAfterChanges(selectedTask)}
                    className="flex-1 min-w-[180px] py-3 rounded-xl bg-[var(--brand-red)] font-semibold text-sm flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={16} />
                    Work on Changes
                  </button>
                )}

                {["in_progress", "changes_requested", "changes"].includes(
                  normalize(selectedTask.status),
                ) &&
                  isAllowedToSubmit(selectedTask) && (
                    <button
                      onClick={() => {
                        setSubmissionText("");
                        setShowSubmitModal(true);
                      }}
                      className="flex-1 min-w-[180px] py-3 rounded-xl bg-[var(--brand-red)] font-semibold text-sm flex items-center justify-center gap-2"
                    >
                      <Send size={16} />
                      Submit Work
                    </button>
                  )}

                {normalize(selectedTask.status) === "approved" && (
                  <button
                    onClick={() => markTaskCompleted(selectedTask)}
                    disabled={actionLoading === selectedTask.id}
                    className="w-full py-3 rounded-xl bg-emerald-700 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {actionLoading === selectedTask.id ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={17} />
                    )}
                    Mark Task Completed
                  </button>
                )}

                {!isCompleted(selectedTask.status) &&
                  selectedTask.deleteRequestStatus === "pending" && (
                    <div className="w-full rounded-xl border border-orange-500/20 bg-orange-500/[0.05] px-4 py-3 text-sm text-orange-700 flex items-center justify-center gap-2">
                      <Clock3 size={17} />
                      Delete request sent — waiting for Founder approval.
                    </div>
                  )}

                {!isCompleted(selectedTask.status) &&
                  selectedTask.deleteRequestStatus === "approved" &&
                  selectedTask.deleteRequestedBy === user?.uid && (
                    <button
                      onClick={() => deleteApprovedTask(selectedTask)}
                      disabled={actionLoading === selectedTask.id}
                      className="flex-1 min-w-[180px] py-3 rounded-xl bg-emerald-700 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Check size={16} />
                      Delete Task
                    </button>
                  )}

                {!isCompleted(selectedTask.status) &&
                  selectedTask.deleteRequestStatus !== "pending" &&
                  selectedTask.deleteRequestStatus !== "approved" && (
                    <button
                      onClick={() => requestDeleteTask(selectedTask)}
                      disabled={actionLoading === selectedTask.id}
                      className="flex-1 min-w-[180px] py-3 rounded-xl border border-red-500/20 bg-red-500/[0.07] text-red-700 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <X size={16} />
                      {selectedTask.deleteRequestStatus === "rejected"
                        ? "Request Delete Again"
                        : "Request Delete"}
                    </button>
                  )}

                {selectedTask.deleteRequestStatus === "rejected" && (
                  <div className="w-full rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-red-700/80">
                      Delete permission rejected
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--brand-medium-gray)]">
                      {selectedTask.deleteReviewMessage ||
                        "The Founder rejected the delete request. Please continue working on this task."}
                    </p>
                  </div>
                )}

                {isCompleted(selectedTask.status) && (
                  <>
                    <button
                      onClick={() => deleteCompletedTask(selectedTask)}
                      disabled={actionLoading === selectedTask.id}
                      className="flex-1 min-w-[180px] py-3 rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-black)] font-semibold text-sm flex items-center justify-center gap-2 hover:bg-red-500/10 hover:text-red-700 disabled:opacity-50"
                    >
                      <X size={16} />
                      Delete from History
                    </button>

                    <div className="w-full rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] px-4 py-3 text-sm text-emerald-700 flex items-center justify-center gap-2">
                      <CheckCircle2 size={17} />
                      This task has been completed.
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT SUBMISSION MODAL */}

      {selectedTask && showEditSubmissionModal && (
        <div
          className="fixed inset-0 z-[75] bg-black/80  flex items-center justify-center p-4"
          onClick={() => setShowEditSubmissionModal(false)}
        >
          <div
            className="w-full max-w-xl rounded-3xl border border-[var(--brand-border)] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-6 border-b border-[var(--brand-border)] flex items-start justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--brand-red)]">
                  Correct your submission
                </p>

                <h2 className="text-xl font-bold mt-1">Edit Submission</h2>

                <p className="text-xs text-[var(--brand-medium-gray)] mt-2">
                  If you pasted the wrong Google Drive document or folder,
                  replace the link here. Your task and review status remain
                  unchanged.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowEditSubmissionModal(false)}
                className="w-9 h-9 rounded-xl bg-white flex items-center justify-center"
              >
                <X size={17} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="text-xs text-[var(--brand-black)]">
                  Correct Google Drive link{" "}
                  <span className="text-[var(--brand-red)]">*</span>
                </label>

                <input
                  type="url"
                  value={editingSubmissionUrl}
                  onChange={(event) =>
                    setEditingSubmissionUrl(event.target.value)
                  }
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="mt-2 h-12 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none placeholder:text-[var(--brand-black)] focus:border-[var(--brand-red-secondary)]/40"
                />

                <p className="mt-2 text-[11px] text-[var(--brand-medium-gray)]">
                  Accepted: Google Drive folders/files and Google Docs links.
                </p>
              </div>

              <div>
                <label className="text-xs text-[var(--brand-black)]">
                  Submission note{" "}
                  <span className="text-[var(--brand-red)]">*</span>
                </label>

                <textarea
                  value={editingSubmissionText}
                  onChange={(event) =>
                    setEditingSubmissionText(event.target.value)
                  }
                  rows={5}
                  placeholder="Explain what you submitted or what was corrected..."
                  className="mt-2 w-full rounded-2xl border border-[var(--brand-border)] bg-white px-4 py-3 text-sm outline-none resize-none placeholder:text-[var(--brand-black)] focus:border-[var(--brand-red-secondary)]/40"
                />
              </div>

              <div className="rounded-2xl border border-[var(--brand-red-secondary)]/10 bg-[var(--brand-red)]/[0.03] p-4 flex gap-3">
                <Bell
                  size={17}
                  className="text-[var(--brand-red)] shrink-0 mt-0.5"
                />
                <p className="text-xs text-[var(--brand-medium-gray)] leading-5">
                  The Founder will receive a notification that your submission
                  link was updated.
                </p>
              </div>

              <button
                type="button"
                onClick={updateSubmission}
                disabled={actionLoading === selectedTask.id}
                className="w-full py-3.5 rounded-xl bg-[var(--brand-red)] font-semibold text-sm flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-50"
              >
                {actionLoading === selectedTask.id ? (
                  <>
                    <Loader2 size={17} className="animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Pencil size={17} />
                    Update Submission
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUBMIT MODAL */}

      {selectedTask && showSubmitModal && (
        <div
          className="fixed inset-0 z-[70] bg-black/80  flex items-center justify-center p-4"
          onClick={() => setShowSubmitModal(false)}
        >
          <div
            className="w-full max-w-xl rounded-3xl border border-[var(--brand-border)] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-6 border-b border-[var(--brand-border)] flex items-start justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--brand-red)]">
                  Submit completed work
                </p>

                <h2 className="text-xl font-bold mt-1">
                  {selectedTask.title || "Task"}
                </h2>

                <p className="text-xs text-[var(--brand-medium-gray)] mt-2">
                  {selectedTask.assignmentType === "team"
                    ? "Your submission will be shared with the Founder and every selected team member."
                    : "Your submission will be sent to the Founder for review."}
                </p>
              </div>

              <button
                onClick={() => setShowSubmitModal(false)}
                className="w-9 h-9 rounded-xl bg-white flex items-center justify-center"
              >
                <X size={17} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* GOOGLE DRIVE SUBMISSION */}

              <div>
                <label className="text-xs text-[var(--brand-black)]">
                  Google Drive submission{" "}
                  <span className="text-[var(--brand-red)]">*</span>
                </label>

                <div className="mt-2 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.03] p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700">
                      <FolderOpen size={19} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">
                        Upload your completed work to Google Drive
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--brand-medium-gray)]">
                        Put all completed files or videos in your Task
                        Submission folder, share the folder with the Founder,
                        then paste the link here.
                      </p>
                    </div>
                  </div>

                  <input
                    type="url"
                    value={submissionDriveUrl}
                    onChange={(event) =>
                      setSubmissionDriveUrl(event.target.value)
                    }
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="mt-4 h-12 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none placeholder:text-[var(--brand-black)] focus:border-emerald-500/40"
                  />

                  <p className="mt-2 text-[11px] leading-5 text-[var(--brand-medium-gray)]">
                    Accepted: Google Drive folders/files and Google Docs links.
                  </p>
                </div>
              </div>

              {/* NOTE */}

              <div>
                <label className="text-xs text-[var(--brand-black)]">
                  Submission note
                </label>

                <textarea
                  value={submissionText}
                  onChange={(event) => setSubmissionText(event.target.value)}
                  rows={5}
                  placeholder="Tell the Founder what you completed, what was changed, or anything they should know..."
                  className="mt-2 w-full rounded-2xl border border-[var(--brand-border)] bg-white px-4 py-3 text-sm outline-none resize-none placeholder:text-[var(--brand-black)] focus:border-[var(--brand-red-secondary)]/40"
                />
              </div>

              {/* NOTICE */}

              <div className="rounded-2xl border border-[var(--brand-red-secondary)]/10 bg-[var(--brand-red)]/[0.03] p-4 flex gap-3">
                <Bell
                  size={17}
                  className="text-[var(--brand-red)] shrink-0 mt-0.5"
                />

                <p className="text-xs text-[var(--brand-medium-gray)] leading-5">
                  The Founder will receive a real-time notification with your
                  Google Drive submission link.
                </p>
              </div>

              {/* ACTION */}

              <button
                onClick={submitTask}
                disabled={actionLoading === selectedTask.id}
                className="w-full py-3.5 rounded-xl bg-[var(--brand-red)] font-semibold text-sm flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-50"
              >
                {actionLoading === selectedTask.id ? (
                  <>
                    <Loader2 size={17} className="animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send size={17} />
                    Submit to Founder
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* NAV ITEM                                                                  */
/* -------------------------------------------------------------------------- */

function NavItem({
  icon,
  label,
  active = false,
  badge,
  path,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: number;
  path: string;
}) {
  return (
    <button
      onClick={() => (window.location.href = path)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition ${
        active
          ? "bg-[var(--brand-red)]/10 text-[var(--brand-red)] border border-[var(--brand-red-secondary)]/10"
          : "text-[var(--brand-black)] hover:text-[var(--brand-black)] hover:bg-[var(--brand-red-light)]"
      }`}
    >
      {icon}

      <span>{label}</span>

      {typeof badge === "number" && badge > 0 && (
        <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-[var(--brand-red)]/15 text-[var(--brand-red)] text-[10px] flex items-center justify-center">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* STAT CARD                                                                  */
/* -------------------------------------------------------------------------- */

function StatCard({
  icon,
  label,
  value,
  description,
  danger = false,
  warning = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  description: string;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <motion.div
      whileHover={{
        y: -2,
      }}
      className="rounded-2xl border border-[var(--brand-border)] bg-white p-5"
    >
      <div className="h-10 w-10 rounded-xl bg-[var(--brand-red)]/10 flex items-center justify-center text-[var(--brand-red)]">
        {icon}
      </div>

      <div className="mt-5 text-sm text-[var(--brand-black)]">{label}</div>

      <div
        className={`mt-1 text-3xl font-bold ${
          danger
            ? "text-red-700"
            : warning
              ? "text-orange-700"
              : "text-[var(--brand-black)]"
        }`}
      >
        {value}
      </div>

      <div
        className={`text-xs mt-1 ${
          danger
            ? "text-red-700/60"
            : warning
              ? "text-orange-700/60"
              : "text-[var(--brand-black)]"
        }`}
      >
        {description}
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* FILTER BUTTON                                                              */
/* -------------------------------------------------------------------------- */

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-11 px-4 rounded-xl border flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-all ${
        active
          ? "border-[var(--brand-red-secondary)]/30 bg-[var(--brand-red)]/10 text-[var(--brand-red)]"
          : "border-[var(--brand-border)] bg-white text-[var(--brand-black)] hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
      }`}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* DETAIL BOX                                                                 */
/* -------------------------------------------------------------------------- */

function DetailBox({
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

        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>

      <p className="text-sm text-[var(--brand-medium-gray)] mt-2">{value}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* EMPTY TASKS                                                                */
/* -------------------------------------------------------------------------- */

function EmptyTasks({ filter, search }: { filter: string; search: string }) {
  const filtered = search.length > 0 || filter !== "all";

  return (
    <div className="min-h-[380px] flex flex-col items-center justify-center text-center px-6">
      <div className="h-16 w-16 rounded-2xl bg-[var(--brand-red)]/10 border border-[var(--brand-red-secondary)]/10 flex items-center justify-center mb-5">
        {filtered ? (
          <Search size={27} className="text-[var(--brand-red)]" />
        ) : (
          <FolderOpen size={27} className="text-[var(--brand-red)]" />
        )}
      </div>

      <h3 className="text-lg font-semibold">
        {filtered ? "No matching tasks" : "No tasks assigned yet"}
      </h3>

      <p className="text-sm text-[var(--brand-medium-gray)] mt-2 max-w-md">
        {filtered
          ? "Try changing your search or filter."
          : "When the Founder assigns work to you, it will appear here automatically."}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* INFO CARD                                                                  */
/* -------------------------------------------------------------------------- */

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
      <p className="text-[10px] font-semibold tracking-[0.2em] text-[var(--brand-red)]">
        {number}
      </p>

      <h3 className="mt-4 font-semibold">{title}</h3>

      <p className="text-xs leading-6 text-[var(--brand-medium-gray)] mt-2">
        {text}
      </p>
    </div>
  );
}
