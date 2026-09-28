"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  UserCheck,
  X,
  XCircle,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { toFirestoreMillis } from "@/lib/firestore-time";

type LeaveRequest = {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  leaveType?: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status?: "PENDING" | "APPROVED" | "REJECTED";
  responseNote?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  approvedBy?: string;
  approvedByName?: string;
};

function timeValue(value: unknown) { return toFirestoreMillis(value); }

function dateLabel(value?: string) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function dateKeys(start: string, end: string) {
  const result: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime()))
    return result;
  while (cursor <= last && result.length < 366) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export default function FounderLeaveRequestsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<
    "ALL" | "PENDING" | "APPROVED" | "REJECTED"
  >("ALL");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selected, setSelected] = useState<LeaveRequest | null>(null);
  const [responseNote, setResponseNote] = useState("");
  const [responseMode, setResponseMode] = useState<"approve" | "reject" | null>(
    null,
  );

  useEffect(() => {
    let unsubscribeRequests: (() => void) | null = null;
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
        if (
          !profile ||
          profile.role !== "founder" ||
          profile.active === false
        ) {
          setLoading(false);
          setCheckingAuth(false);
          return;
        }
        setAuthorized(true);
        unsubscribeRequests = onSnapshot(
          collection(db, "leaveRequests"),
          (snapshot) => {
            const data = snapshot.docs.map(
              (item) => ({ id: item.id, ...item.data() }) as LeaveRequest,
            );
            data.sort(
              (a, b) => timeValue(b.createdAt) - timeValue(a.createdAt),
            );
            setRequests(data);
            setLoading(false);
          },
          (error) => {
            console.error("Founder leave listener error:", error);
            setLoading(false);
          },
        );
      } catch (error) {
        console.error("Founder leave authentication error:", error);
        setLoading(false);
      } finally {
        setCheckingAuth(false);
      }
    });
    return () => {
      unsubscribeAuth();
      if (unsubscribeRequests) unsubscribeRequests();
    };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return requests.filter((item) => {
      const status = item.status || "PENDING";
      const matchesFilter = filter === "ALL" || status === filter;
      const haystack = [
        item.userName,
        item.userEmail,
        item.leaveType,
        item.reason,
        item.startDate,
        item.endDate,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesFilter && (!term || haystack.includes(term));
    });
  }, [filter, requests, search]);

  const counts = {
    total: requests.length,
    pending: requests.filter((r) => (r.status || "PENDING") === "PENDING")
      .length,
    approved: requests.filter((r) => r.status === "APPROVED").length,
    rejected: requests.filter((r) => r.status === "REJECTED").length,
  };

  function openDecision(request: LeaveRequest, mode: "approve" | "reject") {
    setSelected(request);
    setResponseMode(mode);
    setResponseNote(request.responseNote || "");
  }

  async function decideLeave() {
    if (!selected || !responseMode) return;
    const user = auth.currentUser;
    if (!user) return;
    if (responseMode === "reject" && !responseNote.trim()) {
      alert("Please enter a reason before rejecting the leave request.");
      return;
    }

    try {
      setActionLoading(selected.id);
      const founderSnap = await getDoc(doc(db, "users", user.uid));
      const founder = founderSnap.exists() ? founderSnap.data() : {};
      const founderName = founder.name || user.displayName || "Founder";
      const nextStatus = responseMode === "approve" ? "APPROVED" : "REJECTED";

      await updateDoc(doc(db, "leaveRequests", selected.id), {
        status: nextStatus,
        responseNote: responseNote.trim(),
        approvedBy: user.uid,
        approvedByName: founderName,
        updatedAt: serverTimestamp(),
      });

      if (nextStatus === "APPROVED") {
        const employeeSnap = await getDoc(doc(db, "users", selected.userId));
        const employeeProfile = employeeSnap.exists()
          ? employeeSnap.data()
          : {};

        for (const date of dateKeys(selected.startDate, selected.endDate)) {
          await setDoc(
            doc(db, "attendance", `${selected.userId}_${date}`),
            {
              userId: selected.userId,
              userName:
                selected.userName ||
                employeeProfile.name ||
                selected.userEmail ||
                "Employee",
              userEmail: selected.userEmail || employeeProfile.email || "",
              date,
              role: employeeProfile.role || "employee",
              department: employeeProfile.department || "",
              status: "LEAVE",
              checkIn: null,
              checkOut: null,
              totalHours: 0,
              leaveRequestId: selected.id,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
      }

      await addDoc(collection(db, "notifications"), {
        userId: selected.userId,
        recipientId: selected.userId,
        senderId: user.uid,
        senderName: founderName,
        direction: "received",
        title:
          nextStatus === "APPROVED"
            ? "Leave request approved"
            : "Leave request rejected",
        message:
          nextStatus === "APPROVED"
            ? `Your ${selected.leaveType || "leave"} request from ${dateLabel(selected.startDate)} to ${dateLabel(selected.endDate)} was approved by the Founder.`
            : `Your ${selected.leaveType || "leave"} request from ${dateLabel(selected.startDate)} to ${dateLabel(selected.endDate)} was rejected by the Founder.${responseNote.trim() ? ` Reason: ${responseNote.trim()}` : ""}`,
        type: nextStatus === "APPROVED" ? "approval" : "rejected",
        priority: "important",
        read: false,
        leaveRequestId: selected.id,
        link: "/employee/leave-requests",
        createdAt: serverTimestamp(),
      });

      setSelected(null);
      setResponseMode(null);
      setResponseNote("");
      alert(
        nextStatus === "APPROVED"
          ? "Leave approved. Attendance has been marked as LEAVE."
          : "Leave request rejected and the employee has been notified.",
      );
    } catch (error) {
      console.error("Leave decision error:", error);
      alert("Unable to update the leave request. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }

  if (checkingAuth)
    return (
      <main className="min-h-screen bg-white text-[var(--brand-black)] flex items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--brand-black)]">
          <Loader2 size={20} className="animate-spin" />
          Checking founder workspace...
        </div>
      </main>
    );
  if (!authorized)
    return (
      <main className="min-h-screen bg-white text-[var(--brand-black)] flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-3xl border border-[var(--brand-border)] bg-white p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-700">
            <XCircle size={26} />
          </div>
          <h1 className="text-2xl font-semibold">Founder access required</h1>
          <p className="mt-3 text-sm text-[var(--brand-medium-gray)]">
            Only an active Founder can manage leave requests.
          </p>
          <button
            onClick={() => (window.location.href = "/")}
            className="mt-7 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black"
          >
            Back to login
          </button>
        </div>
      </main>
    );

  return (
    <main className="min-h-screen bg-white text-[var(--brand-black)]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden"></div>
      <header className="sticky top-0 z-30 border-b border-[var(--brand-border)] bg-white ">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-5 lg:px-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => (window.location.href = "/founder")}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--brand-border)] bg-white hover:bg-[var(--brand-red-light)]"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--brand-red)]">
                Founder / Management
              </p>
              <h1 className="mt-1 text-xl font-semibold sm:text-2xl">
                Leave Management
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-2 text-xs font-medium text-emerald-700 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Workspace Active
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-red)] text-sm font-bold">
              A
            </div>
          </div>
        </div>
      </header>
      <div className="relative mx-auto max-w-[1600px] px-6 py-10 lg:px-10">
        <section className="mb-10">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div>
              <div className="mb-5 flex items-center gap-3 text-[var(--brand-red)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-red)]/10">
                  <CalendarDays size={19} />
                </div>
                <span className="text-sm font-medium">
                  Time away & availability
                </span>
              </div>
              <h2 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                Keep leave decisions
                <br />
                <span className="text-[var(--brand-red)]">
                  clear and centralized.
                </span>
              </h2>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-[var(--brand-medium-gray)]">
                Review employee and intern leave requests, approve or reject
                them, and automatically reflect approved leave in attendance.
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--brand-black)] hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </section>
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            title="Total Requests"
            value={counts.total}
            icon={<FileText size={19} />}
          />
          <Stat
            title="Pending"
            value={counts.pending}
            icon={<Clock size={19} />}
          />
          <Stat
            title="Approved"
            value={counts.approved}
            icon={<Check size={19} />}
          />
          <Stat
            title="Rejected"
            value={counts.rejected}
            icon={<XCircle size={19} />}
          />
        </section>
        <section className="mt-8 rounded-3xl border border-[var(--brand-border)] bg-white p-3">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search
                size={17}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--brand-black)]"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employee, leave type, reason..."
                className="w-full rounded-2xl border border-[var(--brand-border)] bg-white py-4 pl-11 pr-4 text-sm text-[var(--brand-black)] outline-none placeholder:text-[var(--brand-black)] focus:border-[var(--brand-red-secondary)]/30"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map(
                (item) => (
                  <button
                    key={item}
                    onClick={() => setFilter(item)}
                    className={`rounded-xl px-4 py-3 text-xs font-semibold ${filter === item ? "bg-white text-black" : "border border-[var(--brand-border)] bg-white text-[var(--brand-black)] hover:text-[var(--brand-black)]"}`}
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
          </div>
        </section>
        <section className="mt-6 overflow-hidden rounded-3xl border border-[var(--brand-border)] bg-white ">
          <div className="border-b border-[var(--brand-border)] px-6 py-5">
            <h3 className="text-lg font-semibold">Leave Requests</h3>
            <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
              {filtered.length} request{filtered.length === 1 ? "" : "s"} shown
            </p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-24 text-[var(--brand-black)]">
              <Loader2 size={20} className="animate-spin" />
              Loading leave requests...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-24 text-center text-[var(--brand-black)]">
              No leave requests match this filter.
            </div>
          ) : (
            <div className="divide-y divide-[var(--brand-border)]">
              {filtered.map((request) => (
                <LeaveRow
                  key={request.id}
                  request={request}
                  onApprove={() => openDecision(request, "approve")}
                  onReject={() => openDecision(request, "reject")}
                  loading={actionLoading === request.id}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      {selected && responseMode && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 ">
          <div className="w-full max-w-xl rounded-3xl border border-[var(--brand-border)] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--brand-red)]">
                  Leave decision
                </p>
                <h2 className="mt-2 text-xl font-semibold">
                  {responseMode === "approve"
                    ? "Approve leave request"
                    : "Reject leave request"}
                </h2>
                <p className="mt-2 text-xs text-[var(--brand-medium-gray)]">
                  {selected.userName || selected.userEmail || "Employee"} ·{" "}
                  {dateLabel(selected.startDate)} →{" "}
                  {dateLabel(selected.endDate)}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelected(null);
                  setResponseMode(null);
                }}
                className="rounded-xl bg-white p-2 text-[var(--brand-black)] hover:text-[var(--brand-black)]"
              >
                <X size={17} />
              </button>
            </div>
            <div className="mt-5 rounded-2xl border border-[var(--brand-border)] bg-white p-4">
              <p className="text-xs text-[var(--brand-medium-gray)]">Reason</p>
              <p className="mt-2 text-sm leading-6 text-[var(--brand-medium-gray)]">
                {selected.reason || "No reason provided."}
              </p>
            </div>
            <textarea
              value={responseNote}
              onChange={(e) => setResponseNote(e.target.value)}
              rows={5}
              placeholder={
                responseMode === "approve"
                  ? "Optional note to the employee..."
                  : "Explain why the request is being rejected..."
              }
              className="mt-4 w-full resize-none rounded-2xl border border-[var(--brand-border)] bg-white p-4 text-sm leading-6 text-[var(--brand-black)] outline-none placeholder:text-[var(--brand-black)]"
            />
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => {
                  setSelected(null);
                  setResponseMode(null);
                }}
                className="flex-1 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--brand-black)]"
              >
                Cancel
              </button>
              <button
                onClick={decideLeave}
                disabled={actionLoading === selected.id}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold ${responseMode === "approve" ? "bg-emerald-700" : "bg-red-700"}`}
              >
                {actionLoading === selected.id ? (
                  <Loader2 size={17} className="mx-auto animate-spin" />
                ) : responseMode === "approve" ? (
                  "Approve Leave"
                ) : (
                  "Reject Leave"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-[var(--brand-border)] bg-white p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-red)]/10 text-[var(--brand-red)]">
        {icon}
      </div>
      <p className="mt-4 text-xs text-[var(--brand-medium-gray)]">{title}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}

function LeaveRow({
  request,
  onApprove,
  onReject,
  loading,
}: {
  request: LeaveRequest;
  onApprove: () => void;
  onReject: () => void;
  loading: boolean;
}) {
  const status = request.status || "PENDING";
  const statusClass =
    status === "APPROVED"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
      : status === "REJECTED"
        ? "border-red-500/20 bg-red-500/10 text-red-700"
        : "border-amber-500/20 bg-amber-500/10 text-amber-700";
  return (
    <div className="px-6 py-5 hover:bg-[var(--brand-red-light)]">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-red)]/10 text-[var(--brand-red)]">
            <UserCheck size={19} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold">
                {request.userName || "Employee"}
              </h4>
              <span
                className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase ${statusClass}`}
              >
                {status}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
              {request.userEmail || ""} · {request.leaveType || "Leave"}
            </p>
            <p className="mt-3 text-sm text-[var(--brand-medium-gray)]">
              {dateLabel(request.startDate)} → {dateLabel(request.endDate)}
            </p>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--brand-medium-gray)]">
              {request.reason || "No reason provided."}
            </p>
          </div>
        </div>
        {status === "PENDING" && (
          <div className="flex gap-2">
            <button
              onClick={onReject}
              disabled={loading}
              className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-4 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-500/10 disabled:opacity-40"
            >
              <X size={14} className="mr-1 inline" />
              Reject
            </button>
            <button
              onClick={onApprove}
              disabled={loading}
              className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-semibold disabled:opacity-40"
            >
              <Check size={14} className="mr-1 inline" />
              Approve
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
