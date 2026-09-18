"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  Clock,
  FileCheck2,
  Filter,
  Inbox,
  Loader2,
  MessageSquare,
  Plane,
  RefreshCw,
  Search,
  ShieldCheck,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  writeBatch,
  where,
  deleteDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type NotificationItem = {
  id: string;
  userId?: string;
  title?: string;
  message?: string;
  type?: string;
  priority?: string;
  read?: boolean;
  createdAt?: any;
  taskId?: string;
  leaveRequestId?: string;
  link?: string;
  direction?: "received" | "sent";
  senderId?: string;
  senderName?: string;
  senderRole?: string;
  recipientId?: string;
  recipientName?: string;
};

function timestamp(value: any) {
  try {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    const n = new Date(value).getTime();
    return Number.isNaN(n) ? 0 : n;
  } catch {
    return 0;
  }
}

function formatTime(value: any) {
  if (!value) return "Just now";
  try {
    const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "Just now";
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "Just now";
  }
}

function iconFor(type?: string) {
  const value = String(type || "").toLowerCase();
  if (value.includes("leave")) return <Plane size={19} />;
  if (value.includes("deadline")) return <Clock size={19} />;
  if (value.includes("submission")) return <FileCheck2 size={19} />;
  if (value.includes("approval") || value.includes("completed")) return <Check size={19} />;
  if (value.includes("review") || value.includes("change")) return <MessageSquare size={19} />;
  if (value.includes("warning") || value.includes("overdue")) return <AlertTriangle size={19} />;
  if (value.includes("calendar")) return <CalendarDays size={19} />;
  if (value.includes("rejected")) return <XCircle size={19} />;
  return <Bell size={19} />;
}

function iconClass(type?: string) {
  const value = String(type || "").toLowerCase();
  if (value.includes("leave")) return "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";
  if (value.includes("deadline") || value.includes("overdue")) return "bg-amber-500/10 text-amber-300 border-amber-500/20";
  if (value.includes("approval") || value.includes("completed")) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (value.includes("warning") || value.includes("rejected")) return "bg-red-500/10 text-red-300 border-red-500/20";
  return "bg-violet-500/10 text-violet-300 border-violet-500/20";
}

function priorityClass(priority?: string) {
  const value = String(priority || "normal").toLowerCase();
  if (value === "urgent") return "border-red-500/20 bg-red-500/10 text-red-300";
  if (value === "important" || value === "high") return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  return "border-white/10 bg-white/[0.03] text-white/35";
}

export default function FounderNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "urgent" | "important">("all");
  const [viewMode, setViewMode] = useState<"received" | "sent">("received");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selected, setSelected] = useState<NotificationItem | null>(null);

  useEffect(() => {
    let unsubscribeNotifications: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCheckingAuth(true);
      setAuthorized(false);
      setLoading(true);

      if (!user) {
        setLoading(false);
        setCheckingAuth(false);
        window.location.href = "/";
        return;
      }

      try {
        const profileSnap = await getDoc(doc(db, "users", user.uid));
        const profile = profileSnap.exists() ? profileSnap.data() : null;

        if (!profile || profile.role !== "founder" || profile.active === false) {
          setAuthorized(false);
          setLoading(false);
          setCheckingAuth(false);
          return;
        }

        setAuthorized(true);

        const notificationsQuery = query(
          collection(db, "notifications"),
          where("userId", "==", user.uid)
        );

        unsubscribeNotifications = onSnapshot(
          notificationsQuery,
          (snapshot) => {
            const items = snapshot.docs
              .map((item) => ({ id: item.id, ...item.data() } as NotificationItem))
              .sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));

            setNotifications(items);
            setLoading(false);
          },
          (error) => {
            console.error("Founder notifications listener error:", error);
            setLoading(false);
          }
        );
      } catch (error) {
        console.error("Founder notification authentication error:", error);
        setAuthorized(false);
        setLoading(false);
      } finally {
        setCheckingAuth(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeNotifications) unsubscribeNotifications();
    };
  }, []);

  const received = useMemo(
    () => notifications.filter((item) => (item.direction || "received") === "received"),
    [notifications]
  );

  const sent = useMemo(
    () => notifications.filter((item) => item.direction === "sent"),
    [notifications]
  );

  const unreadCount = received.filter((item) => item.read !== true).length;
  const priorityCount = received.filter((item) => {
    const p = String(item.priority || "").toLowerCase();
    return (p === "important" || p === "urgent" || p === "high") && item.read !== true;
  }).length;

  const filtered = useMemo(() => {
    const source = viewMode === "received" ? received : sent;
    const term = search.trim().toLowerCase();

    return source.filter((item) => {
      const matchesSearch =
        !term ||
        String(item.title || "").toLowerCase().includes(term) ||
        String(item.message || "").toLowerCase().includes(term) ||
        String(item.type || "").toLowerCase().includes(term) ||
        String(item.senderName || "").toLowerCase().includes(term);

      if (!matchesSearch) return false;
      if (viewMode === "sent") return true;
      if (filter === "unread") return item.read !== true;
      if (filter === "urgent") return String(item.priority || "").toLowerCase() === "urgent";
      if (filter === "important") {
        const p = String(item.priority || "").toLowerCase();
        return p === "important" || p === "high";
      }
      return true;
    });
  }, [filter, received, search, sent, viewMode]);

  async function markAsRead(id: string) {
    try {
      setActionLoading(id);
      await updateDoc(doc(db, "notifications", id), { read: true });
      setNotifications((items) => items.map((item) => item.id === id ? { ...item, read: true } : item));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    } finally {
      setActionLoading(null);
    }
  }

  async function markAllAsRead() {
    const unread = received.filter((item) => item.read !== true);
    if (!unread.length) return;

    try {
      setActionLoading("all");
      const batch = writeBatch(db);
      unread.forEach((item) => batch.update(doc(db, "notifications", item.id), { read: true }));
      await batch.commit();
      setNotifications((items) => items.map((item) => item.direction === "sent" ? item : { ...item, read: true }));
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteNotification(id: string) {
    const confirmed = window.confirm(
      "Delete this notification? This cannot be undone."
    );

    if (!confirmed) return;

    try {
      setActionLoading(id);
      await deleteDoc(doc(db, "notifications", id));
      setNotifications((items) =>
        items.filter((item) => item.id !== id)
      );

      if (selected?.id === id) {
        setSelected(null);
      }
    } catch (error) {
      console.error("Failed to delete notification:", error);
      alert("Unable to delete this notification. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }

  if (checkingAuth) {
    return (
      <main className="min-h-screen bg-[#050507] text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-white/50">
          <Loader2 size={20} className="animate-spin" />
          Checking founder workspace...
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen bg-[#050507] text-white flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-300">
            <XCircle size={26} />
          </div>
          <h1 className="text-2xl font-semibold">Founder access required</h1>
          <p className="mt-3 text-sm leading-6 text-white/40">Only an active Founder can view workspace notifications.</p>
          <button onClick={() => (window.location.href = "/")} className="mt-7 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black">Back to login</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[10%] top-[-15%] h-[480px] w-[480px] rounded-full bg-violet-600/10 blur-[140px]" />
        <div className="absolute right-[-10%] top-[25%] h-[480px] w-[480px] rounded-full bg-blue-600/10 blur-[140px]" />
      </div>

      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#050507]/85 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-5 lg:px-10">
          <div className="flex items-center gap-4">
            <button onClick={() => (window.location.href = "/founder")} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"><ArrowLeft size={20} /></button>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-violet-300/80">Founder / Management</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Notification Center</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-2 text-xs font-medium text-emerald-300 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Workspace Active</div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 text-sm font-bold">A</div>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1600px] px-6 py-10 lg:px-10">
        <section className="mb-10">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div>
              <div className="mb-5 flex items-center gap-3 text-violet-300"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10"><Bell size={19} /></div><span className="text-sm font-medium">Workspace activity</span></div>
              <h2 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl lg:text-6xl">Everything important,<br /><span className="bg-gradient-to-r from-white via-violet-200 to-blue-300 bg-clip-text text-transparent">in one place.</span></h2>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-white/40">Employee messages, task submissions, leave requests and important workspace updates arrive here in real time.</p>
            </div>
            <button onClick={() => window.location.reload()} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-white/60 hover:bg-white/[0.06] hover:text-white"><RefreshCw size={16} /> Refresh</button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Received" value={received.length} icon={<Inbox size={19} />} sub="Incoming workspace updates" />
          <Stat label="Unread" value={unreadCount} icon={<Bell size={19} />} sub="Needs attention" />
          <Stat label="Priority Alerts" value={priorityCount} icon={<AlertTriangle size={19} />} sub="Unread important + urgent" />
          <Stat label="Sent" value={sent.length} icon={<Send size={19} />} sub="Founder communication" />
        </section>

        <section className="mt-8 rounded-3xl border border-white/[0.08] bg-white/[0.025] p-3 backdrop-blur-xl">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25" size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notifications..." className="w-full rounded-2xl border border-white/[0.07] bg-black/20 py-4 pl-11 pr-4 text-sm text-white outline-none placeholder:text-white/20 focus:border-violet-500/30" /></div>
            <div className="flex flex-wrap gap-2">
              {(["all", "unread", "urgent", "important"] as const).map((item) => <button key={item} onClick={() => setFilter(item)} disabled={viewMode === "sent"} className={`rounded-xl border px-4 py-3 text-xs font-semibold capitalize transition ${filter === item && viewMode === "received" ? "border-white/10 bg-white text-black" : "border-white/[0.07] bg-white/[0.03] text-white/45 hover:text-white"} disabled:cursor-not-allowed disabled:opacity-35`}><Filter size={13} className="mr-1.5 inline" />{item}</button>)}
            </div>
          </div>
        </section>

        <section className="mt-6 flex gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-2">
          <button onClick={() => { setViewMode("received"); setFilter("all"); }} className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold ${viewMode === "received" ? "bg-violet-500/15 text-violet-200" : "text-white/40 hover:bg-white/[0.04] hover:text-white"}`}><Inbox size={16} className="mr-2 inline" />Received</button>
          <button onClick={() => setViewMode("sent")} className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold ${viewMode === "sent" ? "bg-blue-500/15 text-blue-200" : "text-white/40 hover:bg-white/[0.04] hover:text-white"}`}><Send size={16} className="mr-2 inline" />Sent</button>
          {viewMode === "received" && unreadCount > 0 && <button onClick={markAllAsRead} disabled={actionLoading === "all"} className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-xs font-semibold text-white/50 hover:text-white disabled:opacity-40">{actionLoading === "all" ? <Loader2 size={15} className="animate-spin" /> : <CheckCheck size={15} className="mr-1 inline" />}Mark all read</button>}
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-5"><div><h3 className="text-lg font-semibold">{viewMode === "received" ? "Received Notifications" : "Sent Notifications"}</h3><p className="mt-1 text-xs text-white/30">{filtered.length} notification{filtered.length === 1 ? "" : "s"} shown</p></div><button onClick={() => window.location.reload()} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.07]"><RefreshCw size={17} /></button></div>
          {loading ? <div className="flex items-center justify-center gap-3 py-24 text-white/40"><Loader2 size={20} className="animate-spin" />Loading notifications...</div> : filtered.length === 0 ? <Empty viewMode={viewMode} search={search} /> : <div className="divide-y divide-white/[0.06]">{filtered.map((item) => <NotificationRow key={item.id} item={item} sent={viewMode === "sent"} loading={actionLoading === item.id} onRead={() => markAsRead(item.id)} onDelete={() => deleteNotification(item.id)} onOpen={() => setSelected(item)} />)}</div>}
        </section>

        <div className="mt-6 flex items-start gap-4 rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.025] p-5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300"><ShieldCheck size={19} /></div><div><p className="text-sm font-medium">Private workspace communication</p><p className="mt-1 text-xs leading-6 text-white/35 md:text-sm">Employee and intern messages are routed to the Founder account. The dashboard badge is intentionally triggered only by unread employee/intern-originated notifications.</p></div></div>
      </div>

      {selected && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" onClick={() => setSelected(null)}><div className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#0c0c10] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[0.2em] text-violet-300">Notification details</p><h2 className="mt-2 text-xl font-semibold">{selected.title || "Notification"}</h2></div><button onClick={() => setSelected(null)} className="rounded-xl bg-white/[0.04] p-2 text-white/50 hover:text-white">×</button></div><p className="mt-5 text-sm leading-7 text-white/65">{selected.message || "No message available."}</p><div className="mt-5 flex flex-wrap gap-2 text-xs text-white/35"><span>{selected.senderName ? `From ${selected.senderName}` : "Workspace System"}</span><span>•</span><span>{formatTime(selected.createdAt)}</span></div>{selected.link && <button onClick={() => window.location.href = selected.link!} className="mt-6 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-3 text-sm font-semibold">Open linked page</button>}</div></div>}
    </main>
  );
}

function Stat({ label, value, icon, sub }: { label: string; value: number; icon: React.ReactNode; sub: string }) {
  return <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">{icon}</div><p className="mt-4 text-xs text-white/35">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p><p className="mt-2 text-[11px] text-white/25">{sub}</p></div>;
}

function NotificationRow({ item, sent, loading, onRead, onDelete, onOpen }: { item: NotificationItem; sent: boolean; loading: boolean; onRead: () => void; onDelete: () => void; onOpen: () => void }) {
  const unread = item.read !== true;
  return <div className={`flex gap-4 px-6 py-5 transition hover:bg-white/[0.018] ${unread && !sent ? "bg-violet-500/[0.018]" : ""}`}><div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${iconClass(item.type)}`}>{iconFor(item.type)}</div><button onClick={onOpen} className="min-w-0 flex-1 text-left"><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-white/85">{item.title || "Workspace notification"}</h4>{unread && !sent && <span className="rounded-full bg-violet-500/15 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-violet-300">New</span>}</div><p className="mt-1 text-sm leading-6 text-white/40">{item.message || "No message"}</p><div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-white/25"><span>{item.senderName ? `From: ${item.senderName}` : "From: The Ant Media System"}</span><span>•</span><span>{formatTime(item.createdAt)}</span>{item.priority && item.priority !== "normal" && <span className={`rounded-full border px-2 py-1 uppercase ${priorityClass(item.priority)}`}>{item.priority}</span>}</div></button><div className="mt-1 flex shrink-0 items-center gap-2">
    {!sent && unread && (
      <button onClick={(e) => { e.stopPropagation(); onRead(); }} disabled={loading} title="Mark as read" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-white/45 hover:text-emerald-300 disabled:opacity-40">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
      </button>
    )}
    <button onClick={(e) => { e.stopPropagation(); onDelete(); }} disabled={loading} title="Delete notification" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-white/35 hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40">
      {loading ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
    </button>
  </div></div>;
}

function Empty({ viewMode, search }: { viewMode: "received" | "sent"; search: string }) {
  return <div className="flex flex-col items-center justify-center px-6 py-24 text-center"><div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.04] text-white/25">{search ? <Search size={27} /> : viewMode === "sent" ? <Send size={27} /> : <Inbox size={27} />}</div><h3 className="text-lg font-semibold">{search ? "No matching notifications" : viewMode === "sent" ? "Nothing sent yet" : "You're all caught up"}</h3><p className="mt-2 max-w-md text-sm text-white/30">{search ? "Try changing your search." : viewMode === "sent" ? "Founder communication will appear here." : "Employee messages, leave requests and workspace updates will appear here."}</p></div>;
}
