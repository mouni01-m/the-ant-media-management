"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  ArrowLeft,
  Building2,
  CircleAlert,
  Edit3,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
  WalletCards,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";

type Client = {
  id: string;
  name: string;
  company: string;
  contactPerson: string;
  email: string;
  phone: string;
  website: string;
  industry: string;
  logoUrl: string;
  notes: string;
  additionalNotes?: string;
  active: boolean;
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
  deletedAt?: unknown;
  [key: string]: unknown;
};
type Team = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  active?: boolean;
};
type Account = {
  id: string;
  clientId: string;
  platform: string;
  accountName?: string;
  username?: string;
};
type Payment = {
  id: string;
  clientId: string;
  billingPeriod?: string;
  amountDue?: number;
  amountReceived?: number;
  paymentStatus?: string;
  paymentDate?: string;
  dueDate?: string;
};
type Form = {
  name: string;
  company: string;
  contactPerson: string;
  email: string;
  phone: string;
  website: string;
  industry: string;
  logoUrl: string;
  notes: string;
  additionalNotes: string;
  joiningDate: string;
  contractStartDate: string;
  monthlyFee: string;
  expectedMonthlyRevenue: string;
  paymentFrequency: string;
  paymentStatus: string;
  nextPaymentDate: string;
  renewalDate: string;
  assignedTeamMember: string;
  clientType: string;
  accountStatus: string;
};
const blank: Form = {
  name: "",
  company: "",
  contactPerson: "",
  email: "",
  phone: "",
  website: "",
  industry: "",
  logoUrl: "",
  notes: "",
  additionalNotes: "",
  joiningDate: "",
  contractStartDate: "",
  monthlyFee: "",
  expectedMonthlyRevenue: "",
  paymentFrequency: "Monthly",
  paymentStatus: "Pending",
  nextPaymentDate: "",
  renewalDate: "",
  assignedTeamMember: "",
  clientType: "",
  accountStatus: "Active",
};
const currency = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v || 0);
const dateLabel = (v?: string) =>
  v
    ? new Date(v + "T00:00:00").toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const normalizeUrl = (v: string) =>
  v && !/^https?:\/\//i.test(v) ? "https://" + v : v;
const validDate = (v: string) => {
  if (!v) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [year, month, day] = v.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};
function Status({ value }: { value: string }) {
  return (
    <span className="rounded-full border border-[var(--brand-border)] px-2.5 py-1 text-[10px] font-semibold uppercase">
      {value || "Pending"}
    </span>
  );
}
export default function FounderClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]),
    [team, setTeam] = useState<Team[]>([]),
    [accounts, setAccounts] = useState<Account[]>([]),
    [payments, setPayments] = useState<Payment[]>([]),
    [loading, setLoading] = useState(true),
    [authorized, setAuthorized] = useState(false),
    [error, setError] = useState(""),
    [secureError, setSecureError] = useState("");
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [payFilter, setPayFilter] = useState("ALL"),
    [typeFilter, setTypeFilter] = useState("ALL");
  const [modal, setModal] = useState(false),
    [editing, setEditing] = useState<Client | null>(null),
    [form, setForm] = useState<Form>(blank),
    [saving, setSaving] = useState(false),
    [menu, setMenu] = useState<string | null>(null),
    [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 }),
    [deleting, setDeleting] = useState<Client | null>(null),
    [deleteCounts, setDeleteCounts] = useState({
      accounts: 0,
      payments: 0,
      tasks: 0,
    });

  const menuButtons = useRef(new Map<string, HTMLButtonElement>());
  const menuElement = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const positionMenu = () => {
      const button = menuButtons.current.get(menu);
      if (!button) {
        setMenu(null);
        return;
      }
      const rect = button.getBoundingClientRect();
      const width = Math.min(160, window.innerWidth - 24);
      const height = Math.min(
        menuElement.current?.offsetHeight || 176,
        window.innerHeight - 24,
      );
      const left = Math.max(
        12,
        Math.min(rect.right - width, window.innerWidth - width - 12),
      );
      const below = rect.bottom + 6;
      const top =
        below + height <= window.innerHeight - 12
          ? below
          : Math.max(12, rect.top - height - 6);
      setMenuPosition({ top, left });
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        menuElement.current?.contains(target) ||
        menuButtons.current.get(menu)?.contains(target)
      )
        return;
      setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setSecureError("");
    try {
      if (!auth.currentUser) throw Error("Founder login required.");
      const profile = await getDoc(doc(db, "users", auth.currentUser.uid));
      if (
        !profile.exists() ||
        profile.data().role !== "founder" ||
        profile.data().active !== true
      )
        throw Error("Founder access required.");
      setAuthorized(true);
      const [cs, ts, ps] = await Promise.all([
        getDocs(collection(db, "clients")),
        getDocs(query(collection(db, "users"), where("active", "==", true))),
        getDocs(collection(db, "clientPayments")),
      ]);
      setClients(
        cs.docs
          .map((x) => ({ id: x.id, ...x.data() }) as Client)
          .filter((c) => !c.deletedAt),
      );
      setTeam(
        ts.docs
          .map((x) => ({ id: x.id, ...x.data() }) as Team)
          .filter((x) => ["employee", "intern"].includes(x.role || "")),
      );
      setPayments(ps.docs.map((x) => ({ id: x.id, ...x.data() }) as Payment));
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/api/client-accounts", {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      if (response.ok) setAccounts((await response.json()) as Account[]);
      else {
        setAccounts([]);
        setSecureError(
          "Social account service needs server credentials configured.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load clients.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const un = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setAuthorized(false);
        setLoading(false);
        return;
      }
      void load();
    });
    return () => un();
  }, [load]);
  useEffect(() => {
    if (loading) return;
    const requestedClient = new URLSearchParams(window.location.search).get(
      "clientId",
    );
    if (requestedClient)
      router.push("/founder/clients/" + encodeURIComponent(requestedClient));
  }, [loading, router]);
  const openNew = () => {
    setEditing(null);
    setForm({ ...blank, joiningDate: new Date().toISOString().slice(0, 10) });
    setError("");
    setModal(true);
  };
  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({
      ...blank,
      ...Object.fromEntries(
        Object.keys(blank).map((k) => [k, String(c[k] ?? "")]),
      ),
      accountStatus:
        c.accountStatus || (c.active === false ? "Archived" : "Active"),
      monthlyFee: c.monthlyFee == null ? "" : String(c.monthlyFee),
      expectedMonthlyRevenue:
        c.expectedMonthlyRevenue == null
          ? ""
          : String(c.expectedMonthlyRevenue),
    } as Form);
    setError("");
    setModal(true);
    setMenu(null);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company.trim() || !form.contactPerson.trim()) {
      setError("Company name and contact person are required.");
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Enter a valid email address.");
      return;
    }
    for (const [label, value] of [
      ["Website", form.website],
      ["Logo URL", form.logoUrl],
    ] as const) {
      if (value) {
        try {
          const u = new URL(normalizeUrl(value));
          if (!["http:", "https:"].includes(u.protocol)) throw Error();
        } catch {
          setError(label + " must be a valid URL.");
          return;
        }
      }
    }
    if (
      !validDate(form.joiningDate) ||
      !validDate(form.contractStartDate) ||
      !validDate(form.nextPaymentDate) ||
      !validDate(form.renewalDate)
    ) {
      setError("Enter valid dates.");
      return;
    }
    for (const [label, value] of [
      ["Monthly fee", form.monthlyFee],
      ["Expected monthly revenue", form.expectedMonthlyRevenue],
    ] as const) {
      if (value && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
        setError(label + " must be a non-negative amount.");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name.trim(),
        company: form.company.trim(),
        contactPerson: form.contactPerson.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        website: normalizeUrl(form.website.trim()),
        industry: form.industry.trim(),
        logoUrl: normalizeUrl(form.logoUrl.trim()),
        notes: form.notes.trim(),
        additionalNotes: form.additionalNotes.trim(),
        joiningDate: form.joiningDate || null,
        contractStartDate: form.contractStartDate || null,
        monthlyFee: form.monthlyFee === "" ? null : Number(form.monthlyFee),
        expectedMonthlyRevenue:
          form.expectedMonthlyRevenue === ""
            ? null
            : Number(form.expectedMonthlyRevenue),
        paymentFrequency: form.paymentFrequency,
        paymentStatus: form.paymentStatus,
        nextPaymentDate: form.nextPaymentDate || null,
        renewalDate: form.renewalDate || null,
        assignedTeamMember: form.assignedTeamMember,
        clientType: form.clientType,
        accountStatus: form.accountStatus,
        active: form.accountStatus !== "Archived",
        updatedAt: serverTimestamp(),
      };
      if (editing) await updateDoc(doc(db, "clients", editing.id), payload);
      else
        await addDoc(collection(db, "clients"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      setModal(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save client.");
    } finally {
      setSaving(false);
    }
  };
  const openDelete = async (c: Client) => {
    setMenu(null);
    try {
      const [a, p, t] = await Promise.all([
        fetch("/api/client-accounts?clientId=" + encodeURIComponent(c.id), {
          headers: {
            Authorization: "Bearer " + (await auth.currentUser?.getIdToken()),
          },
          cache: "no-store",
        }),
        getDocs(
          query(
            collection(db, "clientPayments"),
            where("clientId", "==", c.id),
          ),
        ),
        getDocs(collection(db, "tasks")),
      ]);
      const accountsData = a.ok ? ((await a.json()) as Account[]) : [];
      const linked = t.docs.filter((x) => {
        const d = x.data();
        return (
          d.clientId === c.id ||
          (!d.clientId &&
            (d.clientName === c.company || d.client === c.company))
        );
      }).length;
      setDeleteCounts({
        accounts: accountsData.length,
        payments: p.size,
        tasks: linked,
      });
      setDeleting(c);
    } catch {
      setError("Unable to check linked records before deletion.");
    }
  };
  const softDelete = async () => {
    if (!deleting) return;
    try {
      await updateDoc(doc(db, "clients", deleting.id), {
        deletedAt: serverTimestamp(),
        active: false,
        accountStatus: "Archived",
        updatedAt: serverTimestamp(),
      });
      setDeleting(null);
      await load();
    } catch {
      setError("Unable to delete client.");
    }
  };
  const rows = useMemo(
    () =>
      clients.filter((c) => {
        const q = search.toLowerCase().trim();
        const acc = accounts
          .filter((a) => a.clientId === c.id)
          .map((a) => [a.username, a.platform, a.accountName].join(" "))
          .join(" ");
        const assignee = team.find((t) => t.id === c.assignedTeamMember);
        const hay = [
          c.company,
          c.name,
          c.contactPerson,
          c.email,
          c.phone,
          c.industry,
          acc,
          assignee?.name,
          assignee?.email,
        ]
          .join(" ")
          .toLowerCase();
        const status =
          c.accountStatus || (c.active === false ? "Archived" : "Active");
        return (
          (!q || hay.includes(q)) &&
          (filter === "ALL" || status.toUpperCase() === filter) &&
          (payFilter === "ALL" ||
            (c.paymentStatus || "Pending").toUpperCase() === payFilter) &&
          (typeFilter === "ALL" ||
            (c.paymentFrequency || "").toUpperCase() === typeFilter)
        );
      }),
    [clients, accounts, team, search, filter, payFilter, typeFilter],
  );
  if (loading)
    return (
      <main className="min-h-screen bg-white p-10 text-center">
        Loading client workspace…
      </main>
    );
  if (!authorized)
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-8">
        <div className="rounded-3xl border p-8 text-center">
          <ShieldCheck className="mx-auto mb-3 text-red-700" />
          <h1 className="text-xl font-semibold">Founder access required</h1>
          <p className="mt-2 text-sm text-gray-500">
            {error || "Sign in with a Founder account to manage clients."}
          </p>
        </div>
      </main>
    );
  return (
    <main
      className="min-h-screen bg-white text-[var(--brand-black)]"
      onClick={() => setMenu(null)}
    >
      <header className="sticky top-0 z-30 border-b border-[var(--brand-border)] bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-5 lg:px-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/founder")}
              className="rounded-xl border p-3"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.22em] text-[var(--brand-red)]">
                Founder / Management
              </p>
              <h1 className="text-xl font-semibold">Clients</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/founder/client-revenue")}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm"
            >
              <WalletCards size={16} />
              Client Revenue
            </button>
            <button
              onClick={openNew}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-red)] px-4 py-2 text-sm font-semibold text-white"
            >
              <Plus size={17} />
              Add Client
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1500px] px-5 py-8 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="flex items-center gap-2 text-sm text-[var(--brand-red)]">
              <Building2 size={17} />
              Client relationships
            </p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight">
              Your clients.{" "}
              <span className="text-[var(--brand-red)]">One workspace.</span>
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Profiles, social accounts, payments and connected work.
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="rounded-xl border px-4 py-3 text-sm"
          >
            Refresh
          </button>
        </div>
        {error && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <CircleAlert className="mr-2 inline" size={16} />
            {error}
          </p>
        )}
        {secureError && (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {secureError} Configure Firebase Admin credentials and the
            credential encryption key on the server.
          </p>
        )}
        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [clients.length, "Total clients"],
            [
              clients.filter(
                (c) =>
                  (c.accountStatus || "Active") === "Active" &&
                  c.active !== false,
              ).length,
              "Active",
            ],
            [
              clients.filter(
                (c) => c.active === false || c.accountStatus === "Archived",
              ).length,
              "Archived",
            ],
            [
              clients.reduce((n, c) => n + Number(c.monthlyFee || 0), 0),
              "Monthly fee",
            ],
          ].map(([v, l]) => (
            <div key={String(l)} className="rounded-2xl border p-5">
              <p className="text-xs text-gray-500">{l}</p>
              <b className="mt-2 block text-2xl">
                {l === "Monthly fee" ? currency(Number(v)) : v}
              </b>
            </div>
          ))}
        </section>
        <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_repeat(3,170px)]">
          <label className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={17}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company, contact, platform, username, team…"
              className="h-12 w-full rounded-xl border pl-10 pr-3 text-sm"
            />
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-xl border px-3 text-sm"
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <select
            value={payFilter}
            onChange={(e) => setPayFilter(e.target.value)}
            className="rounded-xl border px-3 text-sm"
          >
            <option value="ALL">All payments</option>
            {["PAID", "PENDING", "PARTIAL", "OVERDUE"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-xl border px-3 text-sm"
          >
            <option value="ALL">All frequencies</option>
            {["MONTHLY", "QUARTERLY", "HALF-YEARLY", "YEARLY", "ONE-TIME"].map(
              (v) => (
                <option key={v}>{v}</option>
              ),
            )}
          </select>
        </div>
        <section className="overflow-hidden rounded-3xl border">
          <div className="border-b px-5 py-4">
            <b>Client directory</b>
            <p className="text-xs text-gray-500">{rows.length} clients shown</p>
          </div>
          {rows.length === 0 ? (
            <div className="p-16 text-center text-sm text-gray-500">
              No clients match this search or filter.
            </div>
          ) : (
            rows.map((c) => {
              const member = team.find((t) => t.id === c.assignedTeamMember);
              const clientPayments = payments.filter(
                (p) => p.clientId === c.id,
              );
              const accountCount = accounts.filter(
                (a) => a.clientId === c.id,
              ).length;
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-4 border-b p-5 last:border-0 hover:bg-[var(--brand-red-light)]"
                >
                  <button
                    onClick={() =>
                      router.push(
                        "/founder/clients/" + encodeURIComponent(c.id),
                      )
                    }
                    className="flex min-w-64 flex-1 items-center gap-4 text-left"
                  >
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-red-50 font-bold text-[var(--brand-red)]">
                      {c.logoUrl ? (
                        <Image
                          src={normalizeUrl(c.logoUrl)}
                          alt=""
                          width={48}
                          height={48}
                          unoptimized
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        (c.company || c.name || "CL").slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <span className="min-w-0">
                      <b className="block truncate">{c.company}</b>
                      <span className="block truncate text-xs text-gray-500">
                        {c.name || c.industry || "Client"} · {c.contactPerson} ·{" "}
                        {c.email}
                      </span>
                      <span className="mt-1 block text-xs text-gray-400">
                        Joined {dateLabel(c.joiningDate)}
                        {member ? " · " + (member.name || member.email) : ""}
                      </span>
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <span>
                      {currency(Number(c.monthlyFee || 0))} /{" "}
                      {c.paymentFrequency || "month"}
                    </span>
                    <span>{accountCount} accounts</span>
                    <Status value={c.paymentStatus || "Pending"} />
                    <Status
                      value={
                        c.accountStatus ||
                        (c.active === false ? "Archived" : "Active")
                      }
                    />
                    <span className="text-gray-400">
                      {clientPayments.length} payments
                    </span>
                  </div>
                  <div className="relative">
                    <button
                      ref={(element) => {
                        if (element) menuButtons.current.set(c.id, element);
                        else menuButtons.current.delete(c.id);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const width = Math.min(160, window.innerWidth - 24);
                        const left = Math.max(
                          12,
                          Math.min(
                            rect.right - width,
                            window.innerWidth - width - 12,
                          ),
                        );
                        const below = rect.bottom + 6;
                        const top =
                          below + 176 <= window.innerHeight - 12
                            ? below
                            : Math.max(12, rect.top - 176 - 6);
                        setMenuPosition({ top, left });
                        setMenu(menu === c.id ? null : c.id);
                      }}
                      className="rounded-lg border p-2"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>
      {menu &&
        typeof document !== "undefined" &&
        (() => {
          const client = clients.find((item) => item.id === menu);
          if (!client) return null;
          return createPortal(
            <div
              ref={menuElement}
              role="menu"
              onClick={(event) => event.stopPropagation()}
              style={{
                position: "fixed",
                top: menuPosition.top,
                left: menuPosition.left,
                width: "min(10rem, calc(100vw - 1.5rem))",
                maxHeight: "calc(100vh - 1.5rem)",
                overflowY: "auto",
                zIndex: 1000,
              }}
              className="rounded-xl border bg-white p-1 shadow-lg"
            >
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  router.push("/founder/clients/" + client.id);
                }}
                className="block w-full rounded-lg p-2 text-left text-sm hover:bg-gray-50"
              >
                View
              </button>
              <button
                role="menuitem"
                onClick={() => openEdit(client)}
                className="flex w-full items-center gap-2 rounded-lg p-2 text-sm hover:bg-gray-50"
              >
                <Edit3 size={15} />
                Edit
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  if (
                    !window.confirm(
                      `Archive ${client.company}? The client will remain in archived clients.`,
                    )
                  )
                    return;
                  void updateDoc(doc(db, "clients", client.id), {
                    accountStatus: "Archived",
                    active: false,
                    updatedAt: serverTimestamp(),
                  }).then(() => load());
                }}
                className="block w-full rounded-lg p-2 text-left text-sm hover:bg-gray-50"
              >
                Archive
              </button>
              <button
                role="menuitem"
                onClick={() => void openDelete(client)}
                className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm text-red-700 hover:bg-red-50"
              >
                <Trash2 size={15} />
                Delete
              </button>
            </div>,
            document.body,
          );
        })()}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={save}
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border bg-white p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--brand-red)]">
                  Client profile
                </p>
                <h2 className="mt-1 text-xl font-bold">
                  {editing ? "Edit client" : "Add new client"}
                </h2>
              </div>
              <button type="button" onClick={() => setModal(false)}>
                <X />
              </button>
            </div>
            {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["company", "Company name *", "text"],
                  ["name", "Client / Brand name", "text"],
                  ["contactPerson", "Contact person *", "text"],
                  ["industry", "Industry", "text"],
                  ["email", "Email", "email"],
                  ["phone", "Phone", "tel"],
                  ["website", "Website", "url"],
                  ["logoUrl", "Logo URL", "url"],
                  ["joiningDate", "Joining date", "date"],
                  ["contractStartDate", "Contract / start date", "date"],
                  ["monthlyFee", "Agreed monthly fee ₹", "number"],
                  [
                    "expectedMonthlyRevenue",
                    "Expected monthly revenue ₹",
                    "number",
                  ],
                  ["nextPaymentDate", "Next payment date", "date"],
                  ["renewalDate", "Renewal date", "date"],
                  ["clientType", "Client category / type", "text"],
                ] as const
              ).map(([key, label, type]) => (
                <label key={key} className="text-xs font-medium text-gray-600">
                  {label}
                  <input
                    required={key === "company" || key === "contactPerson"}
                    type={type}
                    min={type === "number" ? "0" : undefined}
                    step={type === "number" ? "0.01" : undefined}
                    value={form[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                    className="mt-1 h-11 w-full rounded-lg border px-3 text-sm text-gray-900"
                  />
                </label>
              ))}
              <label className="text-xs text-gray-600">
                Payment frequency
                <select
                  value={form.paymentFrequency}
                  onChange={(e) =>
                    setForm({ ...form, paymentFrequency: e.target.value })
                  }
                  className="mt-1 h-11 w-full rounded-lg border px-3 text-sm text-gray-900"
                >
                  {[
                    "Monthly",
                    "Quarterly",
                    "Half-yearly",
                    "Yearly",
                    "One-time",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-600">
                Payment status
                <select
                  value={form.paymentStatus}
                  onChange={(e) =>
                    setForm({ ...form, paymentStatus: e.target.value })
                  }
                  className="mt-1 h-11 w-full rounded-lg border px-3 text-sm text-gray-900"
                >
                  {["Paid", "Pending", "Partial", "Overdue"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-600">
                Account status
                <select
                  value={form.accountStatus}
                  onChange={(e) =>
                    setForm({ ...form, accountStatus: e.target.value })
                  }
                  className="mt-1 h-11 w-full rounded-lg border px-3 text-sm text-gray-900"
                >
                  {["Active", "Paused", "Archived"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-600">
                Assigned team member
                <select
                  value={form.assignedTeamMember}
                  onChange={(e) =>
                    setForm({ ...form, assignedTeamMember: e.target.value })
                  }
                  className="mt-1 h-11 w-full rounded-lg border px-3 text-sm text-gray-900"
                >
                  <option value="">Unassigned</option>
                  {team.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name || x.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-600 sm:col-span-2">
                Notes
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1 w-full rounded-lg border p-3 text-sm text-gray-900"
                />
              </label>
              <label className="text-xs text-gray-600 sm:col-span-2">
                Additional notes
                <textarea
                  rows={3}
                  value={form.additionalNotes}
                  onChange={(e) =>
                    setForm({ ...form, additionalNotes: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border p-3 text-sm text-gray-900"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t pt-5">
              <button
                type="button"
                onClick={() => setModal(false)}
                className="rounded-xl border px-4 py-2.5 text-sm"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                className="rounded-xl bg-[var(--brand-red)] px-5 py-2.5 text-sm font-semibold text-white"
              >
                {saving
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : "Create client"}
              </button>
            </div>
          </form>
        </div>
      )}
      {deleting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold">Delete client?</h2>
            <p className="mt-2 text-sm text-gray-600">
              This hides the client while preserving payment, account and task
              history.
            </p>
            <b className="mt-4 block">{deleting.company}</b>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              <li>{deleteCounts.accounts} social accounts</li>
              <li>{deleteCounts.payments} payments</li>
              <li>{deleteCounts.tasks} linked tasks retained</li>
            </ul>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleting(null)}
                className="rounded-lg border px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={() => void softDelete()}
                className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white"
              >
                Delete client
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
