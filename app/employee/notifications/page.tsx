"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Bell,
  Check,
  CheckCheck,
  ChevronLeft,
  Clock,
  FileCheck2,
  Filter,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  AlertTriangle,
  CalendarDays,
  Plane,
  Send,
  Trash2,
  UserRound,
} from "lucide-react";

import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  updateDoc,
  writeBatch,
  getDocs,
  deleteDoc,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import { auth, db } from "@/lib/firebase";

import { sendNotification } from "@/lib/notifications";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

type NotificationType =
  | "task"
  | "deadline"
  | "review"
  | "approval"
  | "submission"
  | "leave"
  | "calendar"
  | "system"
  | "warning";

type Priority =
  | "normal"
  | "important"
  | "urgent";

type NotificationItem = {
  id: string;

  userId?: string;

  title: string;
  message: string;

  type?: NotificationType;
  priority?: Priority;

  read?: boolean;

  createdAt?: any;

  taskId?: string;
  link?: string;

  direction?: "sent" | "received";

  senderId?: string;
  senderName?: string;

  recipientId?: string;
  recipientName?: string;
};

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function formatTime(timestamp: any) {
  if (!timestamp) return "Just now";

  try {
    const date =
      typeof timestamp?.toDate === "function"
        ? timestamp.toDate()
        : new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
      return "Just now";
    }

    const now = new Date();

    const diff =
      now.getTime() - date.getTime();

    const minutes = Math.floor(
      diff / 60000
    );

    const hours = Math.floor(
      diff / 3600000
    );

    const days = Math.floor(
      diff / 86400000
    );

    if (minutes < 1) {
      return "Just now";
    }

    if (minutes < 60) {
      return `${minutes}m ago`;
    }

    if (hours < 24) {
      return `${hours}h ago`;
    }

    if (days < 7) {
      return `${days}d ago`;
    }

    return date.toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  } catch {
    return "Just now";
  }
}

function getMillis(value: any) {
  try {
    if (!value) return 0;

    if (
      typeof value?.toMillis ===
      "function"
    ) {
      return value.toMillis();
    }

    if (
      typeof value?.toDate ===
      "function"
    ) {
      return value.toDate().getTime();
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? 0
      : date.getTime();
  } catch {
    return 0;
  }
}

function getNotificationIcon(
  type?: NotificationType
) {
  switch (type) {
    case "task":
      return <UserRound size={19} />;

    case "deadline":
      return <Clock size={19} />;

    case "review":
      return (
        <MessageSquare size={19} />
      );

    case "approval":
      return <Check size={19} />;

    case "submission":
      return (
        <FileCheck2 size={19} />
      );

    case "leave":
      return <Plane size={19} />;

    case "calendar":
      return (
        <CalendarDays size={19} />
      );

    case "warning":
      return (
        <AlertTriangle size={19} />
      );

    default:
      return <Bell size={19} />;
  }
}

function getTypeLabel(
  type?: NotificationType
) {
  switch (type) {
    case "task":
      return "Task";

    case "deadline":
      return "Deadline";

    case "review":
      return "Review";

    case "approval":
      return "Approval";

    case "submission":
      return "Submission";

    case "leave":
      return "Leave";

    case "calendar":
      return "Calendar";

    case "warning":
      return "Warning";

    default:
      return "System";
  }
}

function getIconClass(
  type?: NotificationType
) {
  switch (type) {
    case "deadline":
      return "bg-amber-500/10 text-amber-300 border-amber-500/20";

    case "approval":
      return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";

    case "review":
      return "bg-blue-500/10 text-blue-300 border-blue-500/20";

    case "warning":
      return "bg-red-500/10 text-red-300 border-red-500/20";

    case "leave":
      return "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";

    case "calendar":
      return "bg-indigo-500/10 text-indigo-300 border-indigo-500/20";

    default:
      return "bg-violet-500/10 text-violet-300 border-violet-500/20";
  }
}

function getPriorityClass(
  priority?: Priority
) {
  switch (priority) {
    case "urgent":
      return "bg-red-500/10 text-red-300 border-red-500/20";

    case "important":
      return "bg-amber-500/10 text-amber-300 border-amber-500/20";

    default:
      return "bg-white/[0.04] text-white/45 border-white/10";
  }
}

/* -------------------------------------------------------------------------- */
/* PAGE                                                                       */
/* -------------------------------------------------------------------------- */

export default function EmployeeNotificationsPage() {
  const [notifications, setNotifications] =
    useState<NotificationItem[]>([]);

  const [userName, setUserName] =
    useState("Employee");

  const [userId, setUserId] =
    useState("");

  const [founderId, setFounderId] =
    useState("");

  const [founderName, setFounderName] =
    useState("Founder");

  const [loading, setLoading] =
    useState(true);

  const [authReady, setAuthReady] =
    useState(false);

  const [search, setSearch] =
    useState("");

  const [filter, setFilter] =
    useState<
      "all" |
      "unread" |
      "important" |
      "urgent"
    >("all");

  const [viewMode, setViewMode] =
    useState<
      "received" | "sent"
    >("received");

  const [
    selectedNotification,
    setSelectedNotification,
  ] =
    useState<NotificationItem | null>(
      null
    );

  const [actionLoading, setActionLoading] =
    useState<string | null>(null);

  const [sendOpen, setSendOpen] =
    useState(false);

  const [sendTitle, setSendTitle] =
    useState("");

  const [sendMessage, setSendMessage] =
    useState("");

  const [sendPriority, setSendPriority] =
    useState<
      "normal" |
      "important" |
      "urgent"
    >("normal");

  const [sending, setSending] =
    useState(false);

  /* ---------------------------------------------------------------------- */
  /* AUTH + DATA                                                             */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let unsubscribeNotifications:
      | (() => void)
      | null = null;

    const unsubscribeAuth =
      onAuthStateChanged(
        auth,
        async (user) => {
          if (!user) {
            setLoading(false);
            setAuthReady(true);
            window.location.href = "/";
            return;
          }

          setUserId(user.uid);

          setUserName(
            user.displayName ||
              user.email?.split(
                "@"
              )[0] ||
              "Employee"
          );

          setAuthReady(true);

          try {
            /* ------------------------------------------------------------ */
            /* FIND FOUNDER                                                  */
            /* ------------------------------------------------------------ */

            const founderQuery =
              query(
                collection(
                  db,
                  "users"
                ),
                where(
                  "role",
                  "==",
                  "founder"
                ),
                where(
                  "active",
                  "==",
                  true
                )
              );

            const founderSnapshot =
              await getDocs(
                founderQuery
              );

            if (
              !founderSnapshot.empty
            ) {
              const founderDoc =
                founderSnapshot.docs[0];

              const founderData =
                founderDoc.data();

              setFounderId(
                founderDoc.id
              );

              setFounderName(
                founderData.name ||
                  "Founder"
              );
            }

            /* ------------------------------------------------------------ */
            /* NOTIFICATIONS                                                 */
            /* ------------------------------------------------------------ */

            const notificationsQuery =
              query(
                collection(
                  db,
                  "notifications"
                ),
                where(
                  "userId",
                  "==",
                  user.uid
                )
              );

            unsubscribeNotifications =
              onSnapshot(
                notificationsQuery,
                (snapshot) => {
                  const items: NotificationItem[] =
                    snapshot.docs.map(
                      (item) => ({
                        id: item.id,
                        ...item.data(),
                      } as NotificationItem)
                    );

                  items.sort(
                    (a, b) =>
                      getMillis(
                        b.createdAt
                      ) -
                      getMillis(
                        a.createdAt
                      )
                  );

                  setNotifications(
                    items
                  );

                  setLoading(false);
                },
                (error) => {
                  console.error(
                    "Notification listener error:",
                    error
                  );

                  setLoading(false);
                }
              );
          } catch (error) {
            console.error(
              "Employee notification error:",
              error
            );

            setLoading(false);
          }
        }
      );

    return () => {
      unsubscribeAuth();

      if (
        unsubscribeNotifications
      ) {
        unsubscribeNotifications();
      }
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /* COUNTS                                                                  */
  /* ---------------------------------------------------------------------- */

  const receivedNotifications =
    useMemo(
      () =>
        notifications.filter(
          (item) =>
            item.direction !==
            "sent"
        ),
      [notifications]
    );

  const sentNotifications =
    useMemo(
      () =>
        notifications.filter(
          (item) =>
            item.direction ===
            "sent"
        ),
      [notifications]
    );

  const unreadCount =
    receivedNotifications.filter(
      (item) =>
        item.read !== true
    ).length;

  const importantCount =
    receivedNotifications.filter(
      (item) =>
        item.priority ===
          "important" &&
        item.read !== true
    ).length;

  const urgentCount =
    receivedNotifications.filter(
      (item) =>
        item.priority ===
          "urgent" &&
        item.read !== true
    ).length;

  /* ---------------------------------------------------------------------- */
  /* FILTER                                                                  */
  /* ---------------------------------------------------------------------- */

  const filteredNotifications =
    useMemo(() => {
      const searchText =
        search.trim().toLowerCase();

      const source =
        viewMode === "received"
          ? receivedNotifications
          : sentNotifications;

      return source.filter(
        (notification) => {
          const matchesSearch =
            !searchText ||
            notification.title
              ?.toLowerCase()
              .includes(
                searchText
              ) ||
            notification.message
              ?.toLowerCase()
              .includes(
                searchText
              ) ||
            getTypeLabel(
              notification.type
            )
              .toLowerCase()
              .includes(
                searchText
              );

          if (!matchesSearch) {
            return false;
          }

          if (
            viewMode ===
            "sent"
          ) {
            return true;
          }

          if (
            filter ===
            "unread"
          ) {
            return (
              notification.read !==
              true
            );
          }

          if (
            filter ===
            "important"
          ) {
            return (
              notification.priority ===
                "important"
            );
          }

          if (
            filter ===
            "urgent"
          ) {
            return (
              notification.priority ===
                "urgent"
            );
          }

          return true;
        }
      );
    }, [
      notifications,
      receivedNotifications,
      sentNotifications,
      search,
      filter,
      viewMode,
    ]);

  /* ---------------------------------------------------------------------- */
  /* ACTIONS                                                                 */
  /* ---------------------------------------------------------------------- */

  async function markAsRead(
    notificationId: string
  ) {
    try {
      setActionLoading(
        notificationId
      );

      await updateDoc(
        doc(
          db,
          "notifications",
          notificationId
        ),
        {
          read: true,
        }
      );
    } catch (error) {
      console.error(
        "Failed to mark notification as read:",
        error
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function markAllAsRead() {
    const unread =
      receivedNotifications.filter(
        (item) =>
          item.read !== true
      );

    if (unread.length === 0) {
      return;
    }

    try {
      setActionLoading("all");

      const batch =
        writeBatch(db);

      unread.forEach(
        (notification) => {
          batch.update(
            doc(
              db,
              "notifications",
              notification.id
            ),
            {
              read: true,
            }
          );
        }
      );

      await batch.commit();
    } catch (error) {
      console.error(
        "Failed to mark all notifications as read:",
        error
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteNotification(
    notificationId: string
  ) {
    const confirmed = window.confirm(
      "Delete this notification? This cannot be undone."
    );

    if (!confirmed) {
      return;
    }

    try {
      setActionLoading(notificationId);

      await deleteDoc(
        doc(
          db,
          "notifications",
          notificationId
        )
      );

      setNotifications((items) =>
        items.filter(
          (item) =>
            item.id !== notificationId
        )
      );

      if (
        selectedNotification?.id ===
        notificationId
      ) {
        setSelectedNotification(null);
      }
    } catch (error) {
      console.error(
        "Failed to delete notification:",
        error
      );

      alert(
        "Unable to delete this notification. Please try again."
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSendNotification() {
    if (!userId) {
      alert(
        "User account not ready."
      );
      return;
    }

    if (!founderId) {
      alert(
        "Founder account could not be found."
      );
      return;
    }

    if (!sendTitle.trim()) {
      alert(
        "Please enter a title."
      );
      return;
    }

    if (!sendMessage.trim()) {
      alert(
        "Please enter a message."
      );
      return;
    }

    try {
      setSending(true);

      await sendNotification({
        senderId: userId,

        senderName:
          userName,

        recipientId:
          founderId,

        recipientName:
          founderName,

        title:
          sendTitle.trim(),

        message:
          sendMessage.trim(),

        type: "system",

        priority:
          sendPriority,
      });

      setSendTitle("");
      setSendMessage("");
      setSendPriority(
        "normal"
      );

      setSendOpen(false);

      alert(
        "Notification sent to Founder."
      );
    } catch (error) {
      console.error(
        "SEND NOTIFICATION ERROR:",
        error
      );

      alert(
        "Unable to send notification."
      );
    } finally {
      setSending(false);
    }
  }

  function handleBack() {
    window.location.href =
      "/employee";
  }

  /* ---------------------------------------------------------------------- */
  /* LOADING                                                                 */
  /* ---------------------------------------------------------------------- */

  if (
    !authReady ||
    loading
  ) {
    return (
      <main className="min-h-screen bg-[#050507] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-[0_0_40px_rgba(124,58,237,0.35)]">
            <Bell size={23} />
          </div>

          <div className="flex items-center gap-2 text-white/45 text-sm">
            <Loader2
              size={16}
              className="animate-spin"
            />
            Loading notifications...
          </div>
        </div>
      </main>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* UI                                                                      */
  /* ---------------------------------------------------------------------- */

  return (
    <main className="min-h-screen bg-[#050507] text-white overflow-x-hidden">
      {/* BACKGROUND */}

      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-violet-700/10 blur-[140px]" />

        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full bg-blue-700/10 blur-[150px]" />
      </div>

      {/* HEADER */}

      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#050507]/85 backdrop-blur-2xl">
        <div className="max-w-[1500px] mx-auto px-5 md:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={handleBack}
                className="w-11 h-11 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] flex items-center justify-center transition-all"
              >
                <ChevronLeft
                  size={21}
                />
              </button>

              <div>
                <p className="text-[11px] tracking-[0.22em] uppercase text-violet-300/80 font-semibold">
                  Employee / Workspace
                </p>

                <h1 className="text-xl md:text-2xl font-bold mt-1">
                  Notifications
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-300 text-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Workspace Active
              </div>

              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center font-bold">
                {userName
                  .charAt(0)
                  .toUpperCase()}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* CONTENT */}

      <div className="relative z-10 max-w-[1500px] mx-auto px-5 md:px-8 py-8 md:py-10">
        {/* HERO */}

        <section className="mb-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-violet-300 mb-3">
                <Sparkles
                  size={17}
                />

                <span className="text-sm font-medium">
                  Stay in the loop
                </span>
              </div>

              <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
                Your updates.
              </h2>

              <p className="text-white/45 mt-3 text-base md:text-lg max-w-2xl">
                Receive important workspace
                updates and communicate
                directly with the Founder.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() =>
                  setSendOpen(true)
                }
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:brightness-110 transition-all text-sm font-semibold"
              >
                <Send size={17} />
                Send to Founder
              </button>

              {unreadCount >
                0 &&
                viewMode ===
                  "received" && (
                  <button
                    onClick={
                      markAllAsRead
                    }
                    disabled={
                      actionLoading ===
                      "all"
                    }
                    className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/[0.04] border border-white/[0.09] hover:bg-white/[0.08] transition-all text-sm font-medium"
                  >
                    {actionLoading ===
                    "all" ? (
                      <Loader2
                        size={
                          17
                        }
                        className="animate-spin"
                      />
                    ) : (
                      <CheckCheck
                        size={
                          17
                        }
                      />
                    )}

                    Mark all as read
                  </button>
                )}
            </div>
          </div>
        </section>

        {/* RECEIVED / SENT */}

        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={() =>
              setViewMode(
                "received"
              )
            }
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-medium transition ${
              viewMode ===
              "received"
                ? "border-violet-500/30 bg-violet-500/10 text-violet-200"
                : "border-white/[0.07] bg-white/[0.02] text-white/40 hover:bg-white/[0.06]"
            }`}
          >
            <Inbox size={16} />
            Received

            {unreadCount >
              0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                {unreadCount >
                99
                  ? "99+"
                  : unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() =>
              setViewMode(
                "sent"
              )
            }
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-medium transition ${
              viewMode ===
              "sent"
                ? "border-blue-500/30 bg-blue-500/10 text-blue-200"
                : "border-white/[0.07] bg-white/[0.02] text-white/40 hover:bg-white/[0.06]"
            }`}
          >
            <Send size={16} />
            Sent

            <span className="text-xs opacity-50">
              {sentNotifications.length}
            </span>
          </button>
        </div>

        {/* STATS */}

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={
              <Inbox size={20} />
            }
            label="Received"
            value={
              receivedNotifications.length
            }
            description="Workspace updates"
          />

          <StatCard
            icon={
              <Bell size={20} />
            }
            label="Unread"
            value={unreadCount}
            description="Needs your attention"
            highlight={
              unreadCount >
              0
            }
          />

          <StatCard
            icon={
              <AlertTriangle
                size={20}
              />
            }
            label="Important"
            value={
              importantCount
            }
            description="Priority updates"
          />

          <StatCard
            icon={
              <Send size={20} />
            }
            label="Sent"
            value={
              sentNotifications.length
            }
            description="Messages to Founder"
          />
        </section>

        {/* SEARCH + FILTER */}

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-xl p-3 md:p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30"
              />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search notifications..."
                className="w-full h-12 pl-11 pr-4 rounded-xl border border-white/[0.07] bg-black/20 outline-none text-sm placeholder:text-white/25 focus:border-violet-500/40"
              />
            </div>

            {viewMode ===
              "received" && (
              <div className="flex gap-2 overflow-x-auto">
                <FilterButton
                  active={
                    filter ===
                    "all"
                  }
                  onClick={() =>
                    setFilter(
                      "all"
                    )
                  }
                  icon={
                    <Filter
                      size={
                        15
                      }
                    />
                  }
                >
                  All
                </FilterButton>

                <FilterButton
                  active={
                    filter ===
                    "unread"
                  }
                  onClick={() =>
                    setFilter(
                      "unread"
                    )
                  }
                >
                  Unread
                </FilterButton>

                <FilterButton
                  active={
                    filter ===
                    "important"
                  }
                  onClick={() =>
                    setFilter(
                      "important"
                    )
                  }
                >
                  Important
                </FilterButton>

                <FilterButton
                  active={
                    filter ===
                    "urgent"
                  }
                  onClick={() =>
                    setFilter(
                      "urgent"
                    )
                  }
                >
                  Urgent
                </FilterButton>
              </div>
            )}
          </div>
        </section>

        {/* LIST */}

        <section className="rounded-3xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
          <div className="px-5 md:px-7 py-5 border-b border-white/[0.07] flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg">
                {viewMode ===
                "received"
                  ? "Received Notifications"
                  : "Sent Notifications"}
              </h3>

              <p className="text-white/35 text-sm mt-1">
                {
                  filteredNotifications.length
                }{" "}
                notification
                {filteredNotifications.length ===
                1
                  ? ""
                  : "s"}{" "}
                shown
              </p>
            </div>

            <button
              onClick={() =>
                window.location.reload()
              }
              className="w-10 h-10 rounded-xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.07] flex items-center justify-center transition-all"
            >
              <RefreshCw
                size={17}
              />
            </button>
          </div>

          {filteredNotifications.length ===
          0 ? (
            <div className="py-24 px-6 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-white/25 mb-5">
                {viewMode ===
                "sent" ? (
                  <Send size={27} />
                ) : (
                  <Inbox
                    size={27}
                  />
                )}
              </div>

              <h3 className="font-semibold text-lg">
                {viewMode ===
                "sent"
                  ? "Nothing sent yet"
                  : "You're all caught up"}
              </h3>

              <p className="text-white/30 text-sm mt-2 max-w-md">
                {viewMode ===
                "sent"
                  ? "Notifications you send to the Founder will appear here."
                  : "New task assignments, reviews and workspace updates will appear here."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {filteredNotifications.map(
                (notification) => {
                  const unread =
                    notification.read !==
                    true;

                  return (
                    <div
                      key={
                        notification.id
                      }
                      onClick={() =>
                        setSelectedNotification(
                          notification
                        )
                      }
                      className={`group relative p-5 md:p-6 transition-all cursor-pointer ${
                        unread &&
                        viewMode ===
                          "received"
                          ? "bg-violet-500/[0.025] hover:bg-violet-500/[0.05]"
                          : "hover:bg-white/[0.025]"
                      }`}
                    >
                      {unread &&
                        viewMode ===
                          "received" && (
                          <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-violet-500 to-blue-500" />
                        )}

                      <div className="flex items-start gap-4">
                        <div
                          className={`w-11 h-11 shrink-0 rounded-xl border flex items-center justify-center ${getIconClass(
                            notification.type
                          )}`}
                        >
                          {getNotificationIcon(
                            notification.type
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h4
                                  className={`text-sm md:text-base ${
                                    unread &&
                                    viewMode ===
                                      "received"
                                      ? "font-semibold text-white"
                                      : "font-medium text-white/75"
                                  }`}
                                >
                                  {
                                    notification.title
                                  }
                                </h4>

                                {unread &&
                                  viewMode ===
                                    "received" && (
                                    <span className="w-2 h-2 rounded-full bg-violet-400" />
                                  )}
                              </div>

                              <p className="text-xs text-white/30 mt-1">
                                {viewMode ===
                                "sent"
                                  ? `To: ${
                                      notification.recipientName ||
                                      "Founder"
                                    }`
                                  : `From: ${
                                      notification.senderName ||
                                      "Founder"
                                    }`}
                              </p>
                            </div>

                            <span className="text-[11px] text-white/25 shrink-0">
                              {formatTime(
                                notification.createdAt
                              )}
                            </span>
                          </div>

                          <p className="text-sm text-white/45 leading-6 mt-3 max-w-4xl">
                            {
                              notification.message
                            }
                          </p>

                          <div className="flex flex-wrap items-center gap-2 mt-4">
                            {notification.priority &&
                              notification.priority !==
                                "normal" && (
                                <span
                                  className={`px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-wide ${getPriorityClass(
                                    notification.priority
                                  )}`}
                                >
                                  {
                                    notification.priority
                                  }
                                </span>
                              )}

                            <span className="px-2.5 py-1 rounded-full border border-white/[0.07] bg-white/[0.025] text-white/30 text-[10px]">
                              {getTypeLabel(
                                notification.type
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {viewMode ===
                            "received" &&
                            unread && (
                              <button
                                onClick={(
                                  event
                                ) => {
                                  event.stopPropagation();

                                  markAsRead(
                                    notification.id
                                  );
                                }}
                                disabled={
                                  actionLoading ===
                                  notification.id
                                }
                                className="w-9 h-9 rounded-xl border border-white/[0.07] bg-white/[0.03] hover:bg-emerald-500/10 hover:text-emerald-300 flex items-center justify-center transition-all"
                                title="Mark as read"
                              >
                                {actionLoading ===
                                notification.id ? (
                                  <Loader2
                                    size={
                                      15
                                    }
                                    className="animate-spin"
                                  />
                                ) : (
                                  <Check
                                    size={
                                      15
                                    }
                                  />
                                )}
                              </button>
                            )}

                          <button
                            onClick={(
                              event
                            ) => {
                              event.stopPropagation();

                              deleteNotification(
                                notification.id
                              );
                            }}
                            disabled={
                              actionLoading ===
                              notification.id
                            }
                            className="w-9 h-9 rounded-xl border border-white/[0.07] bg-white/[0.03] hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-300 flex items-center justify-center transition-all"
                            title="Delete notification"
                          >
                            {actionLoading ===
                            notification.id ? (
                              <Loader2
                                size={
                                  15
                                }
                                className="animate-spin"
                              />
                            ) : (
                              <Trash2
                                size={
                                  15
                                }
                              />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </section>

        {/* PRIVACY */}

        <div className="mt-6 rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.025] p-5 flex items-start gap-4">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-emerald-500/10 text-emerald-300 flex items-center justify-center">
            <ShieldCheck
              size={19}
            />
          </div>

          <div>
            <p className="font-medium text-sm">
              Private workspace communication
            </p>

            <p className="text-white/35 text-xs md:text-sm mt-1 leading-relaxed">
              Received notifications belong
              to your account. Messages sent
              from this workspace are delivered
              directly to the Founder.
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* VIEW MODAL                                                         */}
      {/* ------------------------------------------------------------------ */}

      {selectedNotification && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() =>
            setSelectedNotification(
              null
            )
          }
        >
          <div
            className="w-full max-w-xl rounded-3xl border border-white/[0.1] bg-[#0c0c10] shadow-2xl overflow-hidden"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="p-6 border-b border-white/[0.07] flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-violet-300">
                  {viewMode ===
                  "sent"
                    ? "Sent notification"
                    : "Received notification"}
                </p>

                <h3 className="text-xl font-bold mt-2">
                  {
                    selectedNotification.title
                  }
                </h3>

                <p className="text-xs text-white/30 mt-2">
                  {viewMode ===
                  "sent"
                    ? `To: ${
                        selectedNotification.recipientName ||
                        "Founder"
                      }`
                    : `From: ${
                        selectedNotification.senderName ||
                        "Founder"
                      }`}
                </p>
              </div>

              <button
                onClick={() =>
                  setSelectedNotification(
                    null
                  )
                }
                className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6">
              <p className="text-white/65 leading-7 text-sm md:text-base">
                {
                  selectedNotification.message
                }
              </p>

              <div className="mt-6 pt-5 border-t border-white/[0.07] text-xs text-white/30">
                {formatTime(
                  selectedNotification.createdAt
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* SEND MODAL                                                         */}
      {/* ------------------------------------------------------------------ */}

      {sendOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() =>
            setSendOpen(false)
          }
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-white/[0.1] bg-[#0c0c10] shadow-2xl overflow-hidden"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="p-6 border-b border-white/[0.07] flex items-start justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-violet-300">
                  Internal Communication
                </p>

                <h3 className="text-xl font-bold mt-1">
                  Send to Founder
                </h3>

                <p className="text-xs text-white/35 mt-2">
                  Send an internal notification
                  directly to {founderName}.
                </p>
              </div>

              <button
                onClick={() =>
                  setSendOpen(false)
                }
                className="w-9 h-9 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="text-xs text-white/40">
                  To
                </label>

                <div className="mt-2 px-4 py-3 rounded-xl border border-white/[0.07] bg-white/[0.03] flex items-center gap-3 text-sm">
                  <UserRound
                    size={16}
                    className="text-violet-300"
                  />

                  {founderName}
                </div>
              </div>

              <div>
                <label className="text-xs text-white/40">
                  Title
                </label>

                <input
                  value={sendTitle}
                  onChange={(event) =>
                    setSendTitle(
                      event.target.value
                    )
                  }
                  placeholder="Enter notification title..."
                  className="mt-2 w-full h-12 px-4 rounded-xl border border-white/[0.07] bg-black/20 outline-none text-sm placeholder:text-white/25 focus:border-violet-500/40"
                />
              </div>

              <div>
                <label className="text-xs text-white/40">
                  Priority
                </label>

                <select
                  value={
                    sendPriority
                  }
                  onChange={(
                    event
                  ) =>
                    setSendPriority(
                      event.target
                        .value as
                        | "normal"
                        | "important"
                        | "urgent"
                    )
                  }
                  className="mt-2 w-full h-12 px-4 rounded-xl border border-white/[0.07] bg-[#0c0c10] outline-none text-sm"
                >
                  <option value="normal">
                    Normal
                  </option>

                  <option value="important">
                    Important
                  </option>

                  <option value="urgent">
                    Urgent
                  </option>
                </select>
              </div>

              <div>
                <label className="text-xs text-white/40">
                  Message
                </label>

                <textarea
                  value={
                    sendMessage
                  }
                  onChange={(
                    event
                  ) =>
                    setSendMessage(
                      event.target
                        .value
                    )
                  }
                  placeholder="Write your message..."
                  rows={5}
                  className="mt-2 w-full px-4 py-3 rounded-xl border border-white/[0.07] bg-black/20 outline-none text-sm resize-none placeholder:text-white/25 focus:border-violet-500/40"
                />
              </div>

              <button
                onClick={
                  handleSendNotification
                }
                disabled={
                  sending
                }
                className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <Loader2
                      size={17}
                      className="animate-spin"
                    />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send
                      size={17}
                    />
                    Send Notification
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
/* STAT CARD                                                                  */
/* -------------------------------------------------------------------------- */

function StatCard({
  icon,
  label,
  value,
  description,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  description: string;
  highlight?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
      <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-violet-600/5 blur-3xl" />

      <div className="relative">
        <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-300 border border-violet-500/10 flex items-center justify-center mb-5">
          {icon}
        </div>

        <p className="text-xs text-white/35">
          {label}
        </p>

        <p
          className={`text-3xl font-bold mt-1 ${
            highlight
              ? "text-violet-300"
              : "text-white"
          }`}
        >
          {value}
        </p>

        <p className="text-xs text-white/25 mt-1">
          {description}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* FILTER BUTTON                                                              */
/* -------------------------------------------------------------------------- */

function FilterButton({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-12 px-4 rounded-xl border flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-all ${
        active
          ? "border-violet-500/30 bg-violet-500/10 text-violet-200"
          : "border-white/[0.07] bg-white/[0.02] text-white/40 hover:bg-white/[0.06] hover:text-white/70"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}