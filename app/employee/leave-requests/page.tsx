"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock,
  FileText,
  Info,
  Plus,
  RefreshCw,
  Send,
  X,
  XCircle,
} from "lucide-react";

import {
  addDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";

import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";

import { auth, db } from "@/lib/firebase";

type LeaveRequest = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;

  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;

  status: "PENDING" | "APPROVED" | "REJECTED";

  responseNote?: string;

  createdAt?: any;
  updatedAt?: any;
};

const leaveTypes = [
  "Casual Leave",
  "Sick Leave",
  "Personal Leave",
  "Emergency Leave",
  "Work From Home",
];

export default function EmployeeLeaveRequestsPage() {
  const [firebaseUser, setFirebaseUser] =
    useState<FirebaseUser | null>(null);

  const [requests, setRequests] = useState<LeaveRequest[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [showModal, setShowModal] = useState(false);

  const [message, setMessage] = useState("");

  const [form, setForm] = useState({
    leaveType: "Casual Leave",
    startDate: "",
    endDate: "",
    reason: "",
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setFirebaseUser(user);

        if (user) {
          loadRequests(user.uid);
        } else {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  async function loadRequests(userId: string) {
    try {
      setLoading(true);

      const q = query(
        collection(db, "leaveRequests"),
        where("userId", "==", userId)
      );

      const snapshot = await getDocs(q);

      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as LeaveRequest[];

      data.sort((a, b) => {
        const aTime =
          a.createdAt?.seconds || 0;

        const bTime =
          b.createdAt?.seconds || 0;

        return bTime - aTime;
      });

      setRequests(data);
    } catch (error) {
      console.error("Leave loading error:", error);
      setMessage(
        "Unable to load your leave requests."
      );
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    return {
      total: requests.length,

      pending: requests.filter(
        (request) => request.status === "PENDING"
      ).length,

      approved: requests.filter(
        (request) => request.status === "APPROVED"
      ).length,

      rejected: requests.filter(
        (request) => request.status === "REJECTED"
      ).length,
    };
  }, [requests]);

  async function submitLeaveRequest() {
    if (!firebaseUser) {
      setMessage("Please login again.");
      return;
    }

    if (!form.startDate) {
      setMessage("Please select a start date.");
      return;
    }

    if (!form.endDate) {
      setMessage("Please select an end date.");
      return;
    }

    if (
      new Date(form.endDate) <
      new Date(form.startDate)
    ) {
      setMessage(
        "End date cannot be before the start date."
      );
      return;
    }

    if (!form.reason.trim()) {
      setMessage("Please provide a reason.");
      return;
    }

    try {
      setSubmitting(true);
      setMessage("");

      /*
       * GET EMPLOYEE PROFILE
       */
      const usersSnapshot = await getDocs(
        query(
          collection(db, "users"),
          where("__name__", "==", firebaseUser.uid)
        )
      );

      let userName =
        firebaseUser.displayName || "Employee";

      let userEmail =
        firebaseUser.email || "";
      let userRole = "employee";
      let userDepartment = "";

      if (!usersSnapshot.empty) {
        const userData =
          usersSnapshot.docs[0].data();

        userName =
          userData.name || userName;

        userEmail =
          userData.email || userEmail;

        userRole =
          userData.role === "intern"
            ? "intern"
            : "employee";

        userDepartment =
          userData.department || "";
      }

      /*
       * CREATE LEAVE REQUEST
       */
      const leaveRef = await addDoc(
        collection(db, "leaveRequests"),
        {
          userId: firebaseUser.uid,

          userName,
          userEmail,

          leaveType: form.leaveType,

          startDate: form.startDate,
          endDate: form.endDate,

          reason: form.reason.trim(),

          status: "PENDING",

          responseNote: "",

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );

      /*
       * FIND ACTIVE FOUNDER
       *
       * Never use a literal value such as "founder" here.
       * Firebase Auth UID and the Firestore document ID are the
       * actual recipient identity.
       */
      const founderQuery = query(
        collection(db, "users"),
        where("role", "==", "founder"),
        where("active", "==", true)
      );

      const founderSnapshot = await getDocs(founderQuery);

      if (founderSnapshot.empty) {
        throw new Error("No active Founder account was found.");
      }

      const founderDoc = founderSnapshot.docs[0];
      const founderData = founderDoc.data();

      /*
       * FOUNDER RECEIVES THE LEAVE REQUEST
       */
      await addDoc(collection(db, "notifications"), {
        userId: founderDoc.id,
        recipientId: founderDoc.id,
        recipientName: founderData.name || "Founder",

        senderId: firebaseUser.uid,
        senderName: userName,
        senderRole: userRole,
        senderDepartment: userDepartment,
        direction: "received",

        title: "New leave request",
        message: `${userName} requested ${form.leaveType} from ${formatDate(
          form.startDate
        )} to ${formatDate(form.endDate)}.`,

        type: "leave",
        priority: "important",
        read: false,

        leaveRequestId: leaveRef.id,
        link: "/founder/leave-requests",
        createdAt: serverTimestamp(),
      });

      /*
       * EMPLOYEE SENT COPY
       * This appears under the employee's Sent notifications.
       */
      await addDoc(collection(db, "notifications"), {
        userId: firebaseUser.uid,
        recipientId: founderDoc.id,
        recipientName: founderData.name || "Founder",

        senderId: firebaseUser.uid,
        senderName: userName,
        senderRole: userRole,
        senderDepartment: userDepartment,
        direction: "sent",

        title: "Leave request sent",
        message: `Your ${form.leaveType.toLowerCase()} request from ${formatDate(
          form.startDate
        )} to ${formatDate(form.endDate)} was sent to the Founder.`,

        type: "leave",
        priority: "normal",
        read: true,

        leaveRequestId: leaveRef.id,
        link: "/employee/leave-requests",
        createdAt: serverTimestamp(),
      });

      setMessage(
        "Leave request submitted successfully."
      );

      setForm({
        leaveType: "Casual Leave",
        startDate: "",
        endDate: "",
        reason: "",
      });

      setShowModal(false);

      await loadRequests(firebaseUser.uid);
    } catch (error) {
      console.error(
        "Leave submission error:",
        error
      );

      setMessage(
        "Leave request failed. Please check Firebase permissions."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050507] text-white">
      {/* BACKGROUND */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-violet-700/10 blur-[150px]" />

        <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] rounded-full bg-blue-700/10 blur-[150px]" />
      </div>

      {/* HEADER */}
      <header className="relative z-10 border-b border-white/[0.07] bg-black/60 backdrop-blur-xl">
        <div className="px-6 md:px-10 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() =>
                window.history.back()
              }
              className="w-11 h-11 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] flex items-center justify-center"
            >
              <ArrowLeft size={20} />
            </button>

            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-violet-300">
                Employee / Workspace
              </p>

              <h1 className="text-xl md:text-2xl font-bold">
                Leave Requests
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-300 text-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Workspace Active
            </div>

            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center font-bold">
              {(
                firebaseUser?.email || "E"
              )
                .charAt(0)
                .toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 px-5 md:px-10 py-10 max-w-[1500px] mx-auto">
        {/* HERO */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-2 text-violet-300 text-sm mb-3">
              <CalendarDays size={17} />
              Time away & availability
            </div>

            <h2 className="text-4xl md:text-5xl font-bold">
              Take time when you need it.
            </h2>

            <p className="text-white/40 mt-3 max-w-2xl">
              Submit leave requests, track approval status,
              and keep your workspace schedule transparent.
            </p>
          </div>

          <button
            onClick={() => {
              setMessage("");
              setShowModal(true);
            }}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 font-semibold flex items-center justify-center gap-2 hover:brightness-110"
          >
            <Plus size={18} />
            Request Leave
          </button>
        </div>

        {/* MESSAGE */}
        {message && (
          <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 text-emerald-300 text-sm flex items-center gap-2">
            <Check size={17} />
            {message}
          </div>
        )}

        {/* STATS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<FileText size={19} />}
            title="Total Requests"
            value={stats.total}
            text="All applications"
          />

          <StatCard
            icon={<Clock size={19} />}
            title="Pending"
            value={stats.pending}
            text="Awaiting approval"
          />

          <StatCard
            icon={<Check size={19} />}
            title="Approved"
            value={stats.approved}
            text="Approved leaves"
          />

          <StatCard
            icon={<XCircle size={19} />}
            title="Rejected"
            value={stats.rejected}
            text="Declined requests"
          />
        </div>

        {/* INFO */}
        <div className="rounded-2xl border border-violet-500/15 bg-violet-500/[0.04] p-5 mb-8 flex gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-300 flex items-center justify-center shrink-0">
            <Info size={19} />
          </div>

          <div>
            <h3 className="font-semibold">
              Leave approval workflow
            </h3>

            <p className="text-sm text-white/35 mt-1 leading-6">
              Submit → Founder Review → Approved /
              Rejected. You will receive an in-app
              notification whenever your request is updated.
            </p>
          </div>
        </div>

        {/* REQUESTS */}
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
          <div className="p-6 border-b border-white/[0.07] flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">
                My Leave History
              </h3>

              <p className="text-sm text-white/30 mt-1">
                Your personal leave applications
              </p>
            </div>

            <button
              onClick={() =>
                firebaseUser &&
                loadRequests(firebaseUser.uid)
              }
              className="w-10 h-10 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.07]"
            >
              <RefreshCw size={17} />
            </button>
          </div>

          {loading ? (
            <div className="py-20 text-center text-white/30">
              Loading leave history...
            </div>
          ) : requests.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-violet-500/10 text-violet-300 flex items-center justify-center">
                <CalendarDays size={24} />
              </div>

              <h3 className="font-semibold mt-5">
                No leave requests yet
              </h3>

              <p className="text-sm text-white/30 mt-2">
                Your leave applications will appear here.
              </p>

              <button
                onClick={() =>
                  setShowModal(true)
                }
                className="mt-5 px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-sm"
              >
                Request your first leave
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {requests.map((request) => (
                <LeaveRow
                  key={request.id}
                  request={request}
                />
              ))}
            </div>
          )}
        </section>

        {/* FOOTER */}
        <div className="mt-8 pt-6 border-t border-white/[0.06] flex items-center justify-between text-xs text-white/20">
          <span>
            © 2026 The Ant Media · Internal Management
            System
          </span>

          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Secure workspace
          </span>
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/[0.1] bg-[#0b0b0f] shadow-2xl">
            {/* MODAL HEADER */}
            <div className="sticky top-0 z-10 bg-[#0b0b0f]/95 backdrop-blur-xl p-6 border-b border-white/[0.07] flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-violet-300">
                  Time off
                </p>

                <h2 className="text-xl font-bold mt-1">
                  Request Leave
                </h2>
              </div>

              <button
                onClick={() =>
                  setShowModal(false)
                }
                className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            {/* FORM */}
            <div className="p-6 space-y-5">
              {/* TYPE */}
              <div>
                <label className="text-xs text-white/40">
                  Leave Type
                </label>

                <select
                  value={form.leaveType}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      leaveType: e.target.value,
                    })
                  }
                  className="mt-2 w-full h-12 rounded-xl border border-white/[0.08] bg-black/20 px-4 outline-none text-sm"
                >
                  {leaveTypes.map((type) => (
                    <option
                      key={type}
                      value={type}
                      className="bg-[#0b0b0f]"
                    >
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* DATES */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DateInput
                  label="Start Date"
                  value={form.startDate}
                  onChange={(value) =>
                    setForm({
                      ...form,
                      startDate: value,
                    })
                  }
                />

                <DateInput
                  label="End Date"
                  value={form.endDate}
                  onChange={(value) =>
                    setForm({
                      ...form,
                      endDate: value,
                    })
                  }
                />
              </div>

              {/* REASON */}
              <div>
                <label className="text-xs text-white/40">
                  Reason *
                </label>

                <textarea
                  rows={5}
                  value={form.reason}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      reason: e.target.value,
                    })
                  }
                  placeholder="Tell the founder why you need leave..."
                  className="mt-2 w-full rounded-xl border border-white/[0.08] bg-black/20 p-4 outline-none text-sm resize-none placeholder:text-white/20 focus:border-violet-500/40"
                />
              </div>

              {/* SUBMIT */}
              <button
                onClick={submitLeaveRequest}
                disabled={submitting}
                className="w-full h-14 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw
                      size={18}
                      className="animate-spin"
                    />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    Submit Leave Request
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
/* COMPONENTS                                                                 */
/* -------------------------------------------------------------------------- */

function StatCard({
  icon,
  title,
  value,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
      <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-300 flex items-center justify-center mb-5">
        {icon}
      </div>

      <p className="text-xs text-white/30">
        {title}
      </p>

      <p className="text-3xl font-bold mt-1">
        {value}
      </p>

      <p className="text-xs text-white/25 mt-1">
        {text}
      </p>
    </div>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-white/40">
        {label}
      </label>

      <div className="relative mt-2">
        <CalendarDays
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25"
        />

        <input
          type="date"
          value={value}
          onChange={(e) =>
            onChange(e.target.value)
          }
          className="w-full h-12 rounded-xl border border-white/[0.08] bg-black/20 pl-10 pr-3 outline-none text-sm"
        />
      </div>
    </div>
  );
}

function LeaveRow({
  request,
}: {
  request: LeaveRequest;
}) {
  return (
    <div className="p-5 md:p-6 hover:bg-white/[0.015] transition-all">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-violet-500/10 text-violet-300 flex items-center justify-center shrink-0">
            <CalendarDays size={19} />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold">
                {request.leaveType}
              </h4>

              <StatusBadge
                status={request.status}
              />
            </div>

            <p className="text-sm text-white/40 mt-2">
              {formatDate(request.startDate)}
              {" → "}
              {formatDate(request.endDate)}
            </p>

            <p className="text-sm text-white/30 mt-2 max-w-2xl">
              {request.reason}
            </p>

            {request.responseNote && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white/40">
                <span className="text-white/60">
                  Founder response:
                </span>{" "}
                {request.responseNote}
              </div>
            )}
          </div>
        </div>

        <div className="text-xs text-white/25">
          {request.status === "PENDING"
            ? "Awaiting founder review"
            : request.status === "APPROVED"
            ? "Leave approved"
            : "Leave rejected"}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: LeaveRequest["status"];
}) {
  const style =
    status === "APPROVED"
      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
      : status === "REJECTED"
      ? "bg-red-500/10 text-red-300 border-red-500/20"
      : "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";

  return (
    <span
      className={`px-2.5 py-1 rounded-md border text-[9px] font-semibold ${style}`}
    >
      {status}
    </span>
  );
}

function formatDate(value: string) {
  if (!value) return "—";

  try {
    return new Date(
      `${value}T00:00:00`
    ).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
}