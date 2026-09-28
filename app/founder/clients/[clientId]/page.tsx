"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
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
} from "firebase/firestore";
import {
  ArrowLeft,
  CalendarDays,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  LockKeyhole,
  Plus,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";

type Client = {
  id: string;
  name?: string;
  company?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  website?: string;
  industry?: string;
  logoUrl?: string;
  notes?: string;
  additionalNotes?: string;
  joiningDate?: string;
  contractStartDate?: string;
  monthlyFee?: number;
  expectedMonthlyRevenue?: number;
  paymentFrequency?: string;
  paymentStatus?: string;
  nextPaymentDate?: string;
  renewalDate?: string;
  assignedTeamMember?: string;
  clientType?: string;
  accountStatus?: string;
  active?: boolean;
  [key: string]: unknown;
};
type Account = {
  id: string;
  clientId: string;
  platform: string;
  accountName?: string;
  username?: string;
  loginContact?: string;
  profileUrl?: string;
  notes?: string;
  accountType?: string;
  recoveryEmail?: string;
  recoveryPhone?: string;
  twoFactorEnabled?: boolean;
  twoFactorNotes?: string;
};
type Payment = {
  id: string;
  clientId: string;
  paymentDate: string;
  dueDate?: string;
  billingPeriod: string;
  amountDue: number;
  amountReceived: number;
  paymentStatus: string;
  paymentMethod: string;
  notes?: string;
};
type Task = {
  id: string;
  title?: string;
  status?: string;
  deadline?: string;
  deadlineDate?: string;
  deadlineTime?: string;
  startDate?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  deletedAt?: unknown;
  assignedToName?: string;
  clientId?: string;
  workId?: string | null;
  clientName?: string;
};
type ClientWork = {
  id: string;
  clientId: string;
  name: string;
  description?: string;
  category?: string;
  status?: string;
  priority?: string;
  startDate?: string;
  dueDate?: string;
  recurring?: boolean;
  assignedUserIds?: string[];
  billingType?: string;
  amount?: number;
  notes?: string;
};
type TeamMember = { id: string; name?: string; email?: string; role?: string; active?: boolean };
const workStatuses = ["PLANNED", "IN PROGRESS", "ON HOLD", "COMPLETED", "CANCELLED"];
const methods = ["UPI", "Bank Transfer", "Cash", "Card", "Other"],
  platforms = [
    "Instagram",
    "Facebook",
    "YouTube",
    "LinkedIn",
    "X / Twitter",
    "Threads",
    "Snapchat",
    "Pinterest",
    "TikTok",
    "Google Business",
    "Website",
    "Other",
  ];
const monthNow = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
};
const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(v || 0);
const monthTitle = (m: string) =>
  new Date(
    Number(m.slice(0, 4)),
    Number(m.slice(5, 7)) - 1,
    1,
  ).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const dateText = (v?: string) =>
  v
    ? new Date(v + "T00:00:00").toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const clientDuration = (v?: string) => {
  if (!v) return "Not set";
  const start = new Date(v + "T00:00:00");
  if (Number.isNaN(start.getTime())) return "—";
  const now = new Date();
  const months = Math.max(
    0,
    (now.getFullYear() - start.getFullYear()) * 12 +
      now.getMonth() -
      start.getMonth(),
  );
  return months < 12
    ? `${months} month${months === 1 ? "" : "s"}`
    : `${Math.floor(months / 12)} year${Math.floor(months / 12) === 1 ? "" : "s"} ${months % 12 ? `${months % 12} month${months % 12 === 1 ? "" : "s"}` : ""}`.trim();
};
const statusOf = (p: Payment) =>
  p.amountReceived >= p.amountDue
    ? "Paid"
    : p.amountReceived > 0
      ? "Partial"
      : p.dueDate && p.dueDate < new Date().toISOString().slice(0, 10)
      ? "Overdue"
      : "Pending";
const normalizedTaskStatus = (task: Task) => (task.status || "").toLowerCase().replace(/[ _-]+/g, " ").trim();
const isClientTaskOverdue = (task: Task) => {
  const due = task.deadlineDate || task.deadline;
  if (!due || normalizedTaskStatus(task) === "completed" || task.deletedAt) return false;
  const deadline = due.includes("T") ? new Date(due) : new Date(`${due}T${task.deadlineTime || "23:59"}:00`);
  return !Number.isNaN(deadline.getTime()) && deadline.getTime() < Date.now();
};
const monthFromTimestamp = (value: unknown) => {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().toISOString().slice(0, 7);
  if (typeof value === "string") return value.slice(0, 7);
  return "";
};
const csvDownload = (name: string, rows: unknown[][]) => {
  const csv = rows
    .map((row) =>
      row.map((x) => '"' + String(x ?? "").replace(/"/g, '""') + '"').join(","),
    )
    .join("\n");
  const u = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  URL.revokeObjectURL(u);
};
const emptyAccount = {
  platform: "Instagram",
  accountName: "",
  username: "",
  loginContact: "",
  password: "",
  profileUrl: "",
  notes: "",
  accountType: "",
  recoveryEmail: "",
  recoveryPhone: "",
  twoFactorEnabled: false,
  twoFactorNotes: "",
};
const emptyPayment = {
  paymentDate: new Date().toISOString().slice(0, 10),
  dueDate: "",
  billingPeriod: monthNow(),
  amountDue: "",
  amountReceived: "",
  paymentMethod: "UPI",
  notes: "",
};
export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>(),
    id = decodeURIComponent(clientId),
    router = useRouter();
  const [client, setClient] = useState<Client | null>(null),
    [assignedMemberName, setAssignedMemberName] = useState(""),
    [accounts, setAccounts] = useState<Account[]>([]),
    [payments, setPayments] = useState<Payment[]>([]),
    [tasks, setTasks] = useState<Task[]>([]),
    [workItems, setWorkItems] = useState<ClientWork[]>([]),
    [teamMembers, setTeamMembers] = useState<TeamMember[]>([]),
    [showWorkForm, setShowWorkForm] = useState(false),
    [expandedWorkId, setExpandedWorkId] = useState<string | null>(null),
    [workForm, setWorkForm] = useState({ name: "", description: "", category: "", status: "PLANNED", priority: "MEDIUM", startDate: "", dueDate: "", recurring: false, assignedUserIds: [] as string[], billingType: "PROJECT", amount: "", notes: "" }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [month, setMonth] = useState(monthNow()),
    [tab, setTab] = useState("Overview"),
    [accountModal, setAccountModal] = useState(false),
    [editingAccount, setEditingAccount] = useState<Account | null>(null),
    [accountForm, setAccountForm] = useState({ ...emptyAccount }),
    [paymentModal, setPaymentModal] = useState(false),
    [editingPayment, setEditingPayment] = useState<Payment | null>(null),
    [paymentForm, setPaymentForm] = useState({ ...emptyPayment }),
    [busy, setBusy] = useState(false),
    [shown, setShown] = useState<string | null>(null),
    [secret, setSecret] = useState<Record<string, string>>({}),
    [deletePayment, setDeletePayment] = useState<Payment | null>(null),
    [deleteAccount, setDeleteAccount] = useState<Account | null>(null);
  const api = async (path: string, init: RequestInit = {}) => {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: "Bearer " + (token || ""),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Error(body.error || "Secure account request failed.");
    return body;
  };
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const user = auth.currentUser;
      if (!user) throw Error("Founder login required.");
      const profile = await getDoc(doc(db, "users", user.uid));
      if (
        !profile.exists() ||
        profile.data().role !== "founder" ||
        profile.data().active !== true
      )
        throw Error("Founder access required.");
      const [cs, ps, membersSnapshot] = await Promise.all([
        getDoc(doc(db, "clients", id)),
        getDocs(
          query(collection(db, "clientPayments"), where("clientId", "==", id)),
        ),
        getDocs(collection(db, "users")),
      ]);
      if (!cs.exists() || cs.data().deletedAt) throw Error("Client not found.");
      setClient({ id: cs.id, ...cs.data() } as Client);
      const assignedId = String(cs.data().assignedTeamMember || "");
      if (assignedId) {
        const assigned = await getDoc(doc(db, "users", assignedId));
        setAssignedMemberName(
          assigned.exists()
            ? String(
                assigned.data().name || assigned.data().email || assignedId,
              )
            : assignedId,
        );
      } else setAssignedMemberName("Unassigned");
      setPayments(ps.docs.map((x) => ({ id: x.id, ...x.data() }) as Payment));
      setTeamMembers(membersSnapshot.docs.map((x) => ({ id: x.id, ...x.data() }) as TeamMember).filter((member) => member.active === true && ["employee", "intern"].includes(member.role || "")));
      try {
        const ws = await getDocs(query(collection(db, "clientWork"), where("clientId", "==", id)));
        setWorkItems(ws.docs.map((x) => ({ id: x.id, ...x.data() }) as ClientWork));
      } catch (workError) {
        setWorkItems([]);
        console.error("Client work could not be loaded. Check clientWork Firestore rules.", workError);
      }
      try {
        setAccounts(
          (await api(
            "/api/client-accounts?clientId=" + encodeURIComponent(id),
          )) as Account[],
        );
      } catch (e) {
        setAccounts([]);
        setError(
          e instanceof Error
            ? e.message
            : "Secure account service is unavailable.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load client.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const saveWork = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user || !workForm.name.trim()) return;
    if (client?.active === false || client?.accountStatus === "Archived" || client?.deletedAt) {
      setError("Archived clients cannot receive new work.");
      return;
    }
    setBusy(true);
    try {
      const profile = await getDoc(doc(db, "users", user.uid));
      if (!profile.exists() || profile.data().role !== "founder" || profile.data().active !== true) throw Error("Founder access required.");
      await addDoc(collection(db, "clientWork"), {
        clientId: id,
        name: workForm.name.trim(),
        description: workForm.description.trim(),
        category: workForm.category.trim(),
        status: workForm.status,
        priority: workForm.priority,
        startDate: workForm.startDate || null,
        dueDate: workForm.dueDate || null,
        recurring: workForm.recurring,
        assignedUserIds: workForm.assignedUserIds,
        billingType: workForm.billingType,
        amount: workForm.amount ? Number(workForm.amount) : null,
        notes: workForm.notes.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid,
      });
      setWorkForm({ name: "", description: "", category: "", status: "PLANNED", priority: "MEDIUM", startDate: "", dueDate: "", recurring: false, assignedUserIds: [], billingType: "PROJECT", amount: "", notes: "" });
      setShowWorkForm(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save work item.");
    } finally { setBusy(false); }
  };
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setLoading(false);
        setError("Founder login required.");
        return;
      }
      void load();
    });
    return () => unsub();
  }, [load]);
  useEffect(() => {
    let stopTasks: (() => void) | undefined;
    let disposed = false;
    const stopAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const profile = await getDoc(doc(db, "users", user.uid));
        if (!profile.exists() || profile.data().role !== "founder" || profile.data().active !== true || disposed) return;
        stopTasks?.();
        stopTasks = onSnapshot(collection(db, "tasks"), (snapshot) => {
          setTasks(snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }) as Task)
            .filter((task) => task.clientId === id || (!task.clientId && (task.clientName === client?.company || task.clientName === client?.name))));
        }, (listenerError) => console.error("Client task listener failed:", listenerError));
      } catch (listenerError) {
        console.error("Unable to authorize client task listener:", listenerError);
      }
    });
    return () => {
      disposed = true;
      stopAuth();
      stopTasks?.();
    };
  }, [id, client?.company, client?.name]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "Work") setTab("Work");
      const requestedWork = params.get("workId");
      if (requestedWork) setExpandedWorkId(requestedWork);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [id]);
  const monthPayments = useMemo(
    () =>
      payments.filter(
        (p) =>
          p.billingPeriod === month || (p.paymentDate || "").startsWith(month),
      ),
    [payments, month],
  );
  const summary = useMemo(() => {
    const due = monthPayments.reduce((n, p) => n + Number(p.amountDue || 0), 0),
      received = monthPayments.reduce(
        (n, p) => n + Number(p.amountReceived || 0),
        0,
      );
    return {
      due,
      received,
      outstanding: Math.max(0, due - received),
      overdue: monthPayments
        .filter((p) => statusOf(p) === "Overdue")
        .reduce((n, p) => n + Math.max(0, p.amountDue - p.amountReceived), 0),
    };
  }, [monthPayments]);
  const workSummary = useMemo(() => ({
    total: workItems.length,
    active: workItems.filter((work) => work.status === "IN PROGRESS").length,
    completed: workItems.filter((work) => work.status === "COMPLETED").length,
    pending: tasks.filter((task) => normalizedTaskStatus(task) !== "completed").length,
    completedTasks: tasks.filter((task) => normalizedTaskStatus(task) === "completed").length,
    overdue: tasks.filter(isClientTaskOverdue).length,
  }), [workItems, tasks]);
  const monthlyTasks = useMemo(() => tasks.filter((task) =>
    [task.startDate, task.deadlineDate, task.deadline, monthFromTimestamp(task.updatedAt), monthFromTimestamp(task.createdAt)]
      .some((value) => String(value || "").startsWith(month)),
  ), [tasks, month]);
  const monthlyWork = useMemo(() => {
    const monthStart = `${month}-01`;
    const [year, monthNumber] = month.split("-").map(Number);
    const monthEnd = new Date(year, monthNumber, 0).toISOString().slice(0, 10);
    return workItems.filter((work) => work.recurring || ((!work.startDate && !work.dueDate) || ((work.startDate || "0000-00-00") <= monthEnd && (work.dueDate || "9999-99-99") >= monthStart)));
  }, [workItems, month]);
  const beginAccount = (account?: Account) => {
    setEditingAccount(account || null);
    setAccountForm(
      account
        ? { ...emptyAccount, ...account, password: "" }
        : { ...emptyAccount },
    );
    setAccountModal(true);
    setError("");
  };
  const saveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountForm.platform.trim()) {
      setError("Choose a platform.");
      return;
    }
    setBusy(true);
    try {
      const body = { ...accountForm, clientId: id };
      if (editingAccount) {
        await api("/api/client-accounts/" + editingAccount.id, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else
        await api("/api/client-accounts", {
          method: "POST",
          body: JSON.stringify(body),
        });
      setAccountModal(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save account.");
    } finally {
      setBusy(false);
    }
  };
  const reveal = async (a: Account) => {
    if (shown === a.id) {
      setShown(null);
      return;
    }
    try {
      const value = await api("/api/client-accounts/" + a.id + "?reveal=true");
      setSecret({ ...secret, [a.id]: String(value.password || "") });
      setShown(a.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reveal credential.");
    }
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError("Clipboard access was denied.");
    }
  };
  const removeAccount = async () => {
    if (!deleteAccount) return;
    try {
      await api("/api/client-accounts/" + deleteAccount.id, {
        method: "DELETE",
      });
      setDeleteAccount(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete account.");
    }
  };
  const beginPayment = (p?: Payment) => {
    setEditingPayment(p || null);
    setPaymentForm(
      p
        ? {
            paymentDate: p.paymentDate || "",
            dueDate: p.dueDate || "",
            billingPeriod: p.billingPeriod || month,
            amountDue: String(p.amountDue ?? ""),
            amountReceived: String(p.amountReceived ?? ""),
            paymentMethod: p.paymentMethod || "Other",
            notes: p.notes || "",
          }
        : { ...emptyPayment, billingPeriod: month },
    );
    setPaymentModal(true);
  };
  const savePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const due = Number(paymentForm.amountDue),
      received = Number(paymentForm.amountReceived);
    if (
      !Number.isFinite(due) ||
      due < 0 ||
      !Number.isFinite(received) ||
      received < 0
    ) {
      setError("Payment amounts must be valid non-negative numbers.");
      return;
    }
    const payload = {
      clientId: id,
      paymentDate: paymentForm.paymentDate,
      billingPeriod: paymentForm.billingPeriod,
      dueDate: paymentForm.dueDate || null,
      amountDue: due,
      amountReceived: received,
      paymentStatus: statusOf({
        amountDue: due,
        amountReceived: received,
        dueDate: paymentForm.dueDate,
      } as Payment),
      paymentMethod: paymentForm.paymentMethod,
      notes: paymentForm.notes.trim(),
      updatedAt: serverTimestamp(),
    };
    setBusy(true);
    try {
      if (editingPayment)
        await updateDoc(doc(db, "clientPayments", editingPayment.id), payload);
      else
        await addDoc(collection(db, "clientPayments"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      await updateDoc(doc(db, "clients", id), {
        paymentStatus: payload.paymentStatus,
        updatedAt: serverTimestamp(),
      });
      setPaymentModal(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save payment.");
    } finally {
      setBusy(false);
    }
  };
  const removePayment = async () => {
    if (!deletePayment) return;
    try {
      await deleteDoc(doc(db, "clientPayments", deletePayment.id));
      const remaining = payments
        .filter((payment) => payment.id !== deletePayment.id)
        .sort((a, b) =>
          (b.paymentDate || "").localeCompare(a.paymentDate || ""),
        )[0];
      await updateDoc(doc(db, "clients", id), {
        paymentStatus: remaining ? statusOf(remaining) : "Pending",
        updatedAt: serverTimestamp(),
      });
      setDeletePayment(null);
      await load();
    } catch {
      setError("Unable to delete payment.");
    }
  };
  const report = useMemo(
    () => ({
      assigned: monthlyTasks.length,
      completed: monthlyTasks.filter((task) => normalizedTaskStatus(task) === "completed").length,
      pending: monthlyTasks.filter((task) => normalizedTaskStatus(task) !== "completed").length,
      overdue: monthlyTasks.filter(isClientTaskOverdue).length,
      totalWork: monthlyWork.length,
      completedWork: monthlyWork.filter((work) => work.status === "COMPLETED").length,
      inProgressWork: monthlyWork.filter((work) => work.status === "IN PROGRESS").length,
      accounts: accounts.length,
      payments: monthPayments.length,
      due: summary.due,
      received: summary.received,
      outstanding: summary.outstanding,
    }),
    [monthlyTasks, monthlyWork, accounts, monthPayments, summary],
  );
  const exportClient = () =>
    csvDownload("client-report-" + id + "-" + month + ".csv", [
      [
        "Client",
        "Joined",
        "Monthly Fee",
        "Accounts",
        "Tasks",
        "Payments",
        "Revenue Received",
        "Outstanding",
      ],
      [
        client?.company,
        client?.joiningDate,
        client?.monthlyFee,
        accounts.length,
        tasks.length,
        monthPayments.length,
        summary.received,
        summary.outstanding,
      ],
    ]);
  const tabs = [
    "Overview",
    "Accounts",
    "Payments",
    "Revenue",
    "Work",
    "Reports",
    "Notes",
  ];
  if (loading)
    return <main className="min-h-screen bg-white p-10">Loading client…</main>;
  if (!client)
    return (
      <main className="min-h-screen bg-white p-10">
        <p>{error || "Client not found."}</p>
        <button
          onClick={() => router.push("/founder/clients")}
          className="mt-4 underline"
        >
          Back to Clients
        </button>
      </main>
    );
  return (
    <main className="min-h-screen bg-white text-[var(--brand-black)]">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <button
            onClick={() => router.push("/founder/clients")}
            className="inline-flex items-center gap-2 text-sm"
          >
            <ArrowLeft size={17} />
            Clients
          </button>
          <div className="flex gap-2">
            <button
              onClick={exportClient}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
            >
              <Download size={15} />
              Export Client Report
            </button>
            <button
              onClick={() => router.push("/founder/client-revenue")}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-red)] px-3 py-2 text-sm text-white"
            >
              <WalletCards size={15} />
              Revenue
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8">
        {error && (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-red-50 text-xl font-bold text-[var(--brand-red)]">
              {client.logoUrl ? (
                <Image
                  src={client.logoUrl}
                  alt=""
                  width={64}
                  height={64}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                (client.company || "CL").slice(0, 2).toUpperCase()
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--brand-red)]">
                {client.industry || "Client"} ·{" "}
                {client.accountStatus || "Active"}
              </p>
              <h1 className="mt-1 text-3xl font-bold">{client.company}</h1>
              <p className="text-sm text-gray-500">
                {client.name || ""}{" "}
                {client.contactPerson ? "· " + client.contactPerson : ""} ·{" "}
                {client.email || ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border px-3 py-2">
            <CalendarDays size={16} />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="bg-transparent text-sm outline-none"
            />
          </div>
        </div>
        <nav className="mt-7 flex gap-2 overflow-x-auto border-b">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "whitespace-nowrap border-b-2 px-4 py-3 text-sm " +
                (tab === t
                  ? "border-[var(--brand-red)] font-semibold text-[var(--brand-red)]"
                  : "border-transparent text-gray-500")
              }
            >
              {t}
            </button>
          ))}
        </nav>
        {tab === "Overview" && (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
              {[
                ["Client since", dateText(client.joiningDate)],
                ["Duration", clientDuration(client.joiningDate)],
                ["Monthly fee", fmt(Number(client.monthlyFee || 0))],
                ["Revenue received", fmt(summary.received)],
                ["Pending", fmt(summary.outstanding)],
                ["Payment status", summary.outstanding === 0 ? "Paid" : summary.received ? "Partial" : "Pending"],
                ["Total payments", payments.length],
                [
                  "Total revenue",
                  fmt(
                    payments.reduce(
                      (n, p) => n + Number(p.amountReceived || 0),
                      0,
                    ),
                  ),
                ],
                ["Active accounts", accounts.length],
                ["Active work", workSummary.active],
                ["Completed work", workSummary.completed],
                ["Total tasks", tasks.length],
                ["Completed tasks", workSummary.completedTasks],
                ["Pending tasks", workSummary.pending],
                ["Overdue tasks", workSummary.overdue],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border p-4">
                  <p className="text-xs text-gray-500">{label}</p>
                  <b className="mt-2 block text-lg">{value}</b>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <section className="rounded-2xl border p-5">
                <h2 className="font-bold">Client profile</h2>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  {[
                    ["Contact", client.contactPerson],
                    ["Email", client.email],
                    ["Phone", client.phone],
                    ["Website", client.website],
                    ["Industry", client.industry],
                    ["Joined", dateText(client.joiningDate)],
                    ["Contract start", dateText(client.contractStartDate)],
                    ["Renewal", dateText(client.renewalDate)],
                    ["Payment frequency", client.paymentFrequency],
                    ["Next payment", dateText(client.nextPaymentDate)],
                    ["Category", client.clientType],
                    ["Assigned member", assignedMemberName || "Unassigned"],
                  ].map(([a, b]) => (
                    <p key={a}>
                      <span className="text-gray-500">{a}</span>
                      <b className="mt-1 block">{b || "—"}</b>
                    </p>
                  ))}
                </div>
                {client.website && (
                  <a
                    href={client.website}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--brand-red)]"
                  >
                    Open website <ExternalLink size={14} />
                  </a>
                )}
              </section>
              <section className="rounded-2xl border p-5">
                <div className="flex justify-between">
                  <h2 className="font-bold">Recent payments</h2>
                  <button
                    onClick={() => {
                      setTab("Payments");
                      beginPayment();
                    }}
                    className="text-sm text-[var(--brand-red)]"
                  >
                    <Plus className="mr-1 inline" size={15} />
                    Add
                  </button>
                </div>
                {payments
                  .slice()
                  .sort((a, b) =>
                    (b.paymentDate || "").localeCompare(a.paymentDate || ""),
                  )
                  .slice(0, 5)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="mt-3 flex justify-between border-b pb-3 text-sm"
                    >
                      <span>
                        {p.billingPeriod} · {dateText(p.paymentDate)}
                      </span>
                      <span>
                        {fmt(p.amountReceived)}{" "}
                        <StatusTag value={statusOf(p)} />
                      </span>
                    </div>
                  ))}
                {!payments.length && (
                  <p className="mt-4 text-sm text-gray-500">
                    No payment records yet.
                  </p>
                )}
                <div className="mt-5 flex justify-between text-sm">
                  <span>Upcoming payment</span>
                  <b>{dateText(client.nextPaymentDate)}</b>
                </div>
              </section>
            </div>
            <section className="mt-5 rounded-2xl border p-5">
              <div className="flex justify-between">
                <h2 className="font-bold">Social accounts</h2>
                <button
                  onClick={() => {
                    setTab("Accounts");
                    beginAccount();
                  }}
                  className="text-sm text-[var(--brand-red)]"
                >
                  <Plus className="mr-1 inline" size={15} />
                  Add account
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {accounts.slice(0, 6).map((a) => (
                  <div key={a.id} className="rounded-xl border p-4">
                    <p className="text-xs text-gray-500">{a.platform}</p>
                    <b>{a.accountName || a.username || "Account"}</b>
                    <p className="text-sm text-gray-500">{a.username || "—"}</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="mt-5 rounded-2xl border p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold">Recent work</h2>
                <button
                  onClick={() => setTab("Work")}
                  className="text-sm text-[var(--brand-red)]"
                >
                  View all
                </button>
              </div>
              {tasks
                .slice()
                .sort((a, b) =>
                  String(b.updatedAt || "").localeCompare(
                    String(a.updatedAt || ""),
                  ),
                )
                .slice(0, 5)
                .map((task) => (
                  <button
                    key={task.id}
                    onClick={() =>
                      router.push(
                        "/founder/tasks?taskId=" + encodeURIComponent(task.id),
                      )
                    }
                    className="flex w-full justify-between border-t py-3 text-left text-sm"
                  >
                    <span>{task.title || "Untitled task"}</span>
                    <span className="text-gray-500">
                      {task.status || "To do"}
                    </span>
                  </button>
                ))}
              {!tasks.length && (
                <p className="text-sm text-gray-500">No linked work yet.</p>
              )}
            </section>
          </>
        )}
        {tab === "Accounts" && (
          <section className="mt-5 rounded-2xl border p-5">
            <div className="flex justify-between">
              <div>
                <h2 className="font-bold">Social & Platform Accounts</h2>
                <p className="text-xs text-gray-500">
                  Credentials are encrypted at rest and only retrieved on
                  request.
                </p>
              </div>
              <button
                onClick={() => beginAccount()}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-red)] px-3 py-2 text-sm text-white"
              >
                <Plus size={15} />
                Add Account
              </button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {accounts.map((a) => (
                <article key={a.id} className="rounded-xl border p-4">
                  <div className="flex justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-red)]">
                        {a.platform}
                      </p>
                      <h3 className="mt-1 font-semibold">
                        {a.accountName || a.username || "Account"}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {a.username || "No username"}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => beginAccount(a)}
                        className="rounded border px-2 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteAccount(a)}
                        className="rounded border px-2 text-red-700"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <LockKeyhole size={15} />
                    <span className="font-mono text-sm">
                      {shown === a.id ? secret[a.id] || "" : "••••••••"}
                    </span>
                    <button
                      onClick={() => void reveal(a)}
                      aria-label={
                        shown === a.id ? "Hide password" : "Show password"
                      }
                      className="rounded p-1"
                    >
                      {shown === a.id ? (
                        <EyeOff size={15} />
                      ) : (
                        <Eye size={15} />
                      )}
                    </button>
                    <button
                      onClick={async () => {
                        let value = secret[a.id];
                        if (value === undefined) {
                          try {
                            const result = await api(
                              "/api/client-accounts/" + a.id + "?reveal=true",
                            );
                            value = String(result.password || "");
                            setSecret({ ...secret, [a.id]: value });
                          } catch (e) {
                            setError(
                              e instanceof Error
                                ? e.message
                                : "Unable to retrieve password.",
                            );
                            return;
                          }
                        }
                        await copy(value);
                      }}
                      className="rounded border px-2 py-1 text-xs"
                    >
                      <Copy className="mr-1 inline" size={12} />
                      Copy password
                    </button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => void copy(a.username || "")}
                      className="rounded border px-2 py-1 text-xs"
                    >
                      Copy username
                    </button>
                    {a.profileUrl && (
                      <a
                        href={a.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
                      >
                        Profile <Globe size={12} />
                      </a>
                    )}
                  </div>
                  {a.twoFactorEnabled && (
                    <p className="mt-3 text-xs text-gray-500">2FA enabled</p>
                  )}
                </article>
              ))}
            </div>
            {!accounts.length && (
              <p className="mt-6 text-center text-sm text-gray-500">
                No platform accounts have been added.
              </p>
            )}
          </section>
        )}
        {tab === "Payments" && (
          <section className="mt-5 overflow-hidden rounded-2xl border">
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="font-bold">Payments</h2>
                <p className="text-xs text-gray-500">
                  {payments.length} payment records
                </p>
              </div>
              <button
                onClick={() => beginPayment()}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-red)] px-3 py-2 text-sm text-white"
              >
                <Plus size={15} />
                Add Payment
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    {[
                      "Date",
                      "Billing period",
                      "Amount due",
                      "Received",
                      "Balance",
                      "Status",
                      "Method",
                      "",
                    ].map((x) => (
                      <th key={x} className="px-4 py-3">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments
                    .slice()
                    .sort((a, b) =>
                      (b.paymentDate || "").localeCompare(a.paymentDate || ""),
                    )
                    .map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="px-4 py-3">{dateText(p.paymentDate)}</td>
                        <td className="px-4 py-3">{p.billingPeriod}</td>
                        <td className="px-4 py-3">{fmt(p.amountDue)}</td>
                        <td className="px-4 py-3">{fmt(p.amountReceived)}</td>
                        <td className="px-4 py-3">
                          {fmt(Math.max(0, p.amountDue - p.amountReceived))}
                        </td>
                        <td className="px-4 py-3">
                          <StatusTag value={statusOf(p)} />
                        </td>
                        <td className="px-4 py-3">{p.paymentMethod}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => beginPayment(p)}
                            className="mr-2 text-xs underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeletePayment(p)}
                            className="text-xs text-red-700 underline"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!payments.length && (
              <p className="p-10 text-center text-sm text-gray-500">
                No payment records yet.
              </p>
            )}
          </section>
        )}
        {tab === "Revenue" && (
          <section className="mt-5">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["Monthly fee", fmt(Number(client.monthlyFee || 0))],
                ["Amount due", fmt(summary.due)],
                ["Received", fmt(summary.received)],
                ["Outstanding", fmt(summary.outstanding)],
              ].map(([a, b]) => (
                <div key={a} className="rounded-xl border p-4">
                  <p className="text-xs text-gray-500">{a}</p>
                  <b className="mt-2 block text-xl">{b}</b>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-xl border bg-gray-50 p-4 text-sm text-gray-600">
              Revenue is calculated from payment records for {monthTitle(month)}
              . No invoice is generated automatically.
            </p>
          </section>
        )}
        {tab === "Work" && (
          <section className="mt-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Total work", workSummary.total],
                ["Active work", workSummary.active],
                ["Completed work", workSummary.completed],
                ["Pending tasks", workSummary.pending],
                ["Completed tasks", workSummary.completedTasks],
                ["Overdue tasks", workSummary.overdue],
              ].map(([a, b]) => (
                <div key={String(a)} className="rounded-xl border p-4">
                  <p className="text-xs text-gray-500">{a}</p>
                  <b className="mt-2 block text-xl">{b}</b>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Work / Deliverables</h2>
                <p className="mt-1 text-sm text-gray-500">Organize client tasks under a deliverable.</p>
              </div>
              <button onClick={() => setShowWorkForm((open) => !open)} className="rounded-xl bg-[var(--brand-red)] px-4 py-2.5 text-sm font-medium text-white">{showWorkForm ? "Cancel" : "+ Add Work"}</button>
            </div>
            {showWorkForm && <form onSubmit={saveWork} className="mt-4 grid gap-3 rounded-2xl border bg-gray-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs font-medium">Work / Deliverable name *<input required value={workForm.name} onChange={(e) => setWorkForm({ ...workForm, name: e.target.value })} className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm" placeholder="Instagram Management" /></label>
              <label className="text-xs font-medium">Service category<input value={workForm.category} onChange={(e) => setWorkForm({ ...workForm, category: e.target.value })} className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm" placeholder="Social Media" /></label>
              <label className="text-xs font-medium">Status<select value={workForm.status} onChange={(e) => setWorkForm({ ...workForm, status: e.target.value })} className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm">{workStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
              <label className="text-xs font-medium">Start date<input type="date" value={workForm.startDate} onChange={(e) => setWorkForm({ ...workForm, startDate: e.target.value })} className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm" /></label>
              <label className="text-xs font-medium">Due date<input type="date" value={workForm.dueDate} onChange={(e) => setWorkForm({ ...workForm, dueDate: e.target.value })} className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm" /></label>
              <label className="text-xs font-medium">Priority<select value={workForm.priority} onChange={(e) => setWorkForm({ ...workForm, priority: e.target.value })} className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm">{["LOW", "MEDIUM", "HIGH", "URGENT"].map((priority) => <option key={priority}>{priority}</option>)}</select></label>
              <label className="text-xs font-medium">Billing type<select value={workForm.billingType} onChange={(e) => setWorkForm({ ...workForm, billingType: e.target.value })} className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm">{[["PROJECT", "Project-based"], ["MONTHLY", "Monthly"], ["QUARTERLY", "Quarterly"], ["YEARLY", "Yearly"], ["ONE_TIME", "One-time"], ["CUSTOM", "Custom"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-xs font-medium">Estimated value<input type="number" min="0" value={workForm.amount} onChange={(e) => setWorkForm({ ...workForm, amount: e.target.value })} className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm" placeholder="₹" /></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={workForm.recurring} onChange={(e) => setWorkForm({ ...workForm, recurring: e.target.checked })} />Recurring work</label>
              <label className="text-xs font-medium sm:col-span-2">Description<textarea value={workForm.description} onChange={(e) => setWorkForm({ ...workForm, description: e.target.value })} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" rows={2} /></label>
              <fieldset className="rounded-lg border bg-white p-3 sm:col-span-2 lg:col-span-3"><legend className="px-1 text-xs font-medium">Assigned team</legend>{teamMembers.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{teamMembers.map((member) => <label key={member.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={workForm.assignedUserIds.includes(member.id)} onChange={(event) => setWorkForm({ ...workForm, assignedUserIds: event.target.checked ? [...workForm.assignedUserIds, member.id] : workForm.assignedUserIds.filter((userId) => userId !== member.id) })} />{member.name || member.email} <span className="text-xs text-gray-500">{member.role}</span></label>)}</div> : <p className="text-xs text-gray-500">No active employees or interns are available.</p>}</fieldset>
              <label className="text-xs font-medium sm:col-span-2 lg:col-span-3">Notes<textarea value={workForm.notes} onChange={(e) => setWorkForm({ ...workForm, notes: e.target.value })} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" rows={2} /></label>
              <div className="sm:col-span-2 lg:col-span-3"><button disabled={busy} className="rounded-lg bg-[var(--brand-black)] px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "Saving…" : "Create Work"}</button></div>
            </form>}
            <div className="mt-4 grid gap-3">
              {workItems.map((work) => {
                const linked = tasks.filter((task) => task.workId === work.id);
                const done = linked.filter((task) => normalizedTaskStatus(task) === "completed").length;
                const inProgress = linked.filter((task) => normalizedTaskStatus(task) === "in progress").length;
                const overdueTasks = linked.filter(isClientTaskOverdue).length;
                const pendingTasks = linked.length - done - inProgress;
                const percent = linked.length ? Math.round(done / linked.length * 100) : 0;
                const expanded = expandedWorkId === work.id;
                return <article key={work.id} className="rounded-2xl border">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <button onClick={() => setExpandedWorkId(expanded ? null : work.id)} className="min-w-0 flex-1 text-left">
                      <span className="flex flex-wrap items-center gap-2"><b className="text-base">{work.name}</b><span className="rounded-full border px-2.5 py-1 text-[10px] font-semibold">{work.status || "PLANNED"}</span>{work.category && <span className="text-xs text-gray-500">{work.category}</span>}</span>
                      {work.description && <span className="mt-1 block text-sm text-gray-500">{work.description}</span>}
                      <span className="mt-2 block text-xs text-gray-500">{linked.length} tasks · {done} completed · {linked.length - done} pending{linked.length > 0 && done === linked.length ? " · All tasks completed" : ""}</span>
                      {linked.length > 0 && <span className="mt-2 block h-1.5 max-w-md overflow-hidden rounded-full bg-gray-100"><span className="block h-full bg-[var(--brand-red)]" style={{ width: `${percent}%` }} /></span>}
                      <span className="mt-2 block text-xs text-gray-500">Start {dateText(work.startDate)} · Due {dateText(work.dueDate)}</span>
                      <span className="mt-1 block text-xs text-gray-500">{work.recurring ? "Recurring" : "One-time"} · {String(work.billingType || "PROJECT").replaceAll("_", " ")} · {work.amount ? fmt(Number(work.amount)) : "Value not set"}{work.assignedUserIds?.length ? ` · Team: ${work.assignedUserIds.map((userId) => teamMembers.find((member) => member.id === userId)?.name || teamMembers.find((member) => member.id === userId)?.email || "Member").join(", ")}` : ""}</span>
                    </button>
                    <div className="flex items-center gap-2"><select aria-label="Work status" value={work.status || "PLANNED"} onChange={async (e) => { const status = e.target.value; try { await updateDoc(doc(db, "clientWork", work.id), { status, updatedAt: serverTimestamp() }); setWorkItems((items) => items.map((item) => item.id === work.id ? { ...item, status } : item)); } catch (e) { setError(e instanceof Error ? e.message : "Unable to update work status."); } }} className="rounded-lg border px-2 py-2 text-xs">{workStatuses.map((status) => <option key={status}>{status}</option>)}</select><button onClick={() => setExpandedWorkId(expanded ? null : work.id)} className="rounded-lg border px-3 py-2 text-sm">{expanded ? "Hide" : "View Work"}</button></div>
                  </div>
                  {expanded && <div className="border-t bg-gray-50 px-4 py-3"><div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">{[["Total", linked.length], ["Completed", done], ["In progress", inProgress], ["Pending", pendingTasks], ["Overdue", overdueTasks]].map(([label, count]) => <div key={String(label)} className="rounded-lg border bg-white p-3"><span className="block text-[10px] text-gray-500">{label}</span><b>{count}</b></div>)}</div>{linked.map((task) => <button key={task.id} onClick={() => router.push("/founder/tasks?taskId=" + encodeURIComponent(task.id))} className="flex w-full items-center justify-between gap-3 border-b py-3 text-left last:border-0"><span className="min-w-0"><b className="block truncate text-sm">{normalizedTaskStatus(task) === "completed" ? "✓ " : "○ "}{task.title || "Untitled task"}</b><span className="mt-1 block text-xs text-gray-500">{task.assignedToName || "Unassigned"} · {task.status || "TO DO"} · Due {task.deadlineDate || task.deadline || "Not set"}</span></span><ExternalLink size={14} /></button>)}{linked.length === 0 && <p className="py-4 text-sm text-gray-500">No tasks linked yet. Select this work item when creating a task.</p>}</div>}
                </article>;
              })}
              {!workItems.length && <p className="rounded-xl border p-8 text-center text-sm text-gray-500">No work deliverables yet. Add the first work item above.</p>}
            </div>
            {tasks.some((task) => !task.workId || !workItems.some((work) => work.id === task.workId)) && <section className="mt-6 rounded-2xl border"><h3 className="border-b p-4 font-semibold">General client tasks</h3>{tasks.filter((task) => !task.workId || !workItems.some((work) => work.id === task.workId)).map((task) => <button key={task.id} onClick={() => router.push("/founder/tasks?taskId=" + encodeURIComponent(task.id))} className="flex w-full items-center justify-between border-b p-4 text-left text-sm last:border-0"><span><b>{task.title || "Untitled task"}</b><small className="mt-1 block text-gray-500">{task.assignedToName || "Unassigned"} · {task.status || "TO DO"}</small></span><ExternalLink size={14} /></button>)}</section>}
          </section>
        )}
        {tab === "Reports" && (
          <section className="mt-5 rounded-2xl border p-5">
            <div className="mb-5 flex justify-between">
              <div>
                <h2 className="font-bold">Monthly Client Report</h2>
                <p className="text-sm text-gray-500">{monthTitle(month)}</p>
              </div>
              <button
                onClick={() =>
                  csvDownload("revenue-" + id + "-" + month + ".csv", [
                    [
                      "Client",
                      "Month",
                      "Amount Due",
                      "Amount Received",
                      "Outstanding",
                      "Payment Status",
                    ],
                    [
                      client.company,
                      month,
                      summary.due,
                      summary.received,
                      summary.outstanding,
                      summary.outstanding === 0
                        ? "Paid"
                        : summary.received
                          ? "Partial"
                          : "Pending",
                    ],
                  ])
                }
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <Download size={15} />
                Export Revenue Report
              </button>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-semibold">Client summary</h3>
                {[
                  ["Joining date", dateText(client.joiningDate)],
                  ["Monthly fee", fmt(Number(client.monthlyFee || 0))],
                  ["Revenue due", fmt(summary.due)],
                  ["Revenue received", fmt(summary.received)],
                  ["Outstanding", fmt(summary.outstanding)],
                  [
                    "Payment status",
                    summary.outstanding === 0
                      ? "Paid"
                      : summary.received
                        ? "Partial"
                        : "Pending",
                  ],
                ].map(([a, b]) => (
                  <p
                    key={a}
                    className="flex justify-between border-b py-2 text-sm"
                  >
                    <span>{a}</span>
                    <b>{b}</b>
                  </p>
                ))}
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold">Work summary</h3>
                {[
                  ["Work / deliverables", report.totalWork],
                  ["Completed work", report.completedWork],
                  ["In progress work", report.inProgressWork],
                  ["Tasks assigned", report.assigned],
                  ["Tasks completed", report.completed],
                  ["Tasks pending", report.pending],
                  ["Tasks overdue", report.overdue],
                ].map(([a, b]) => (
                  <p
                    key={String(a)}
                    className="flex justify-between border-b py-2 text-sm"
                  >
                    <span>{a}</span>
                    <b>{b}</b>
                  </p>
                ))}
                <div className="mt-4 space-y-2">
                  {monthlyWork.map((work) => {
                    const linked = monthlyTasks.filter((task) => task.workId === work.id);
                    const done = linked.filter((task) => normalizedTaskStatus(task) === "completed").length;
                    return <div key={work.id} className="rounded-lg border p-3 text-sm"><div className="flex items-center justify-between gap-3"><b>{work.name}</b><span className="text-xs text-gray-500">{work.status || "PLANNED"}</span></div><p className="mt-1 text-xs text-gray-500">{done}/{linked.length} tasks completed · {linked.length ? Math.round(done / linked.length * 100) : 0}%</p></div>;
                  })}
                </div>
                <h3 className="mb-2 mt-5 text-sm font-semibold">
                  Social media
                </h3>
                <p className="text-sm text-gray-600">
                  {platforms
                    .map((platform) => {
                      const count = accounts.filter(
                        (a) => a.platform === platform,
                      ).length;
                      return count ? platform + " × " + count : "";
                    })
                    .filter(Boolean)
                    .join(" · ") || "Not tracked"}
                </p>
                <p className="mt-3 text-xs text-gray-500">
                  Social analytics are not connected; post counts are not
                  tracked.
                </p>
              </div>
            </div>
          </section>
        )}
        {tab === "Notes" && (
          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border p-5">
              <h2 className="font-bold">Client notes</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                {client.notes || "No notes recorded."}
              </p>
            </article>
            <article className="rounded-2xl border p-5">
              <h2 className="font-bold">Additional notes</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                {client.additionalNotes || "No additional notes recorded."}
              </p>
            </article>
          </section>
        )}
      </div>
      {accountModal && (
        <Modal
          title={
            editingAccount ? "Edit platform account" : "Add platform account"
          }
          onClose={() => setAccountModal(false)}
        >
          <form onSubmit={saveAccount} className="grid gap-3 sm:grid-cols-2">
            {
              <label className="text-xs text-gray-600">
                Platform
                <select
                  required
                  value={accountForm.platform}
                  onChange={(e) =>
                    setAccountForm({ ...accountForm, platform: e.target.value })
                  }
                  className="mt-1 h-11 w-full rounded-lg border px-3 text-sm"
                >
                  {platforms.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
            }
            {[
              ["accountName", "Account / page name", "text"],
              ["username", "Username / handle", "text"],
              ["loginContact", "Login email / phone", "text"],
              ["password", "Password (stored encrypted)", "password"],
              ["profileUrl", "Profile URL", "url"],
              ["recoveryEmail", "Recovery email", "email"],
              ["recoveryPhone", "Recovery phone", "tel"],
              ["accountType", "Account type", "text"],
            ].map(([key, label, type]) => (
              <label key={key} className="text-xs text-gray-600">
                {label}
                <input
                  type={type}
                  autoComplete="new-password"
                  value={accountForm[key as keyof typeof accountForm] as string}
                  onChange={(e) =>
                    setAccountForm({ ...accountForm, [key]: e.target.value })
                  }
                  placeholder={
                    key === "password" && editingAccount
                      ? "Leave blank to keep existing password"
                      : ""
                  }
                  className="mt-1 h-11 w-full rounded-lg border px-3 text-sm"
                />
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={accountForm.twoFactorEnabled}
                onChange={(e) =>
                  setAccountForm({
                    ...accountForm,
                    twoFactorEnabled: e.target.checked,
                  })
                }
              />
              2FA enabled
            </label>
            <label className="text-xs text-gray-600 sm:col-span-2">
              Notes
              <textarea
                value={accountForm.notes}
                onChange={(e) =>
                  setAccountForm({ ...accountForm, notes: e.target.value })
                }
                className="mt-1 w-full rounded-lg border p-3 text-sm"
              />
            </label>
            <label className="text-xs text-gray-600 sm:col-span-2">
              2FA notes
              <textarea
                value={accountForm.twoFactorNotes}
                onChange={(e) =>
                  setAccountForm({
                    ...accountForm,
                    twoFactorNotes: e.target.value,
                  })
                }
                className="mt-1 w-full rounded-lg border p-3 text-sm"
              />
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button
                type="button"
                onClick={() => setAccountModal(false)}
                className="rounded-lg border px-4 py-2"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                className="rounded-lg bg-[var(--brand-red)] px-4 py-2 text-white"
              >
                {busy ? "Saving…" : "Save account"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {paymentModal && (
        <Modal
          title={editingPayment ? "Edit payment" : "Add payment"}
          onClose={() => setPaymentModal(false)}
        >
          <form onSubmit={savePayment} className="grid gap-3 sm:grid-cols-2">
            {[
              ["paymentDate", "Invoice / payment date", "date"],
              ["dueDate", "Due date", "date"],
              ["billingPeriod", "Billing period", "month"],
              ["amountDue", "Amount due ₹", "number"],
              ["amountReceived", "Amount received ₹", "number"],
            ].map(([key, label, type]) => (
              <label key={key} className="text-xs text-gray-600">
                {label}
                <input
                  required={key !== "dueDate"}
                  min={type === "number" ? "0" : undefined}
                  step={type === "number" ? "0.01" : undefined}
                  type={type}
                  value={paymentForm[key as keyof typeof paymentForm] as string}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, [key]: e.target.value })
                  }
                  className="mt-1 h-11 w-full rounded-lg border px-3 text-sm"
                />
              </label>
            ))}
            <label className="text-xs text-gray-600">
              Payment method
              <select
                value={paymentForm.paymentMethod}
                onChange={(e) =>
                  setPaymentForm({
                    ...paymentForm,
                    paymentMethod: e.target.value,
                  })
                }
                className="mt-1 h-11 w-full rounded-lg border px-3 text-sm"
              >
                {methods.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-600 sm:col-span-2">
              Notes
              <textarea
                value={paymentForm.notes}
                onChange={(e) =>
                  setPaymentForm({ ...paymentForm, notes: e.target.value })
                }
                className="mt-1 w-full rounded-lg border p-3 text-sm"
              />
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button
                type="button"
                onClick={() => setPaymentModal(false)}
                className="rounded-lg border px-4 py-2"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                className="rounded-lg bg-[var(--brand-red)] px-4 py-2 text-white"
              >
                {busy ? "Saving…" : "Save payment"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deletePayment && (
        <Confirm
          title="Delete payment record?"
          text="Historical financial records are useful for reports. Confirm only if this record is incorrect."
          onCancel={() => setDeletePayment(null)}
          onDelete={() => void removePayment()}
        />
      )}
      {deleteAccount && (
        <Confirm
          title="Delete platform account?"
          text={
            (deleteAccount.platform || "Account") +
            " credentials will be permanently removed."
          }
          onCancel={() => setDeleteAccount(null)}
          onDelete={() => void removeAccount()}
        />
      )}
    </main>
  );
}
function StatusTag({ value }: { value: string }) {
  return (
    <span className="ml-2 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase">
      {value}
    </span>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-white p-6">
        <div className="mb-5 flex justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Confirm({
  title,
  text,
  onCancel,
  onDelete,
}: {
  title: string;
  text: string;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="max-w-md rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-2 text-sm text-gray-600">{text}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border px-4 py-2">
            Cancel
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg bg-red-700 px-4 py-2 text-white"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
