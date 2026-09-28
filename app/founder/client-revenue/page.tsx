"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Download,
  WalletCards,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
type Client = {
  id: string;
  company?: string;
  name?: string;
  joiningDate?: string;
  monthlyFee?: number;
  expectedMonthlyRevenue?: number;
  paymentFrequency?: string;
  paymentStatus?: string;
  nextPaymentDate?: string;
  active?: boolean;
  accountStatus?: string;
  deletedAt?: unknown;
};
type Payment = {
  id: string;
  clientId: string;
  paymentDate?: string;
  dueDate?: string;
  billingPeriod?: string;
  amountDue?: number;
  amountReceived?: number;
  paymentStatus?: string;
};
const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v || 0);
const first = (month: string) => month + "-01",
  last = (month: string) =>
    month +
    "-" +
    String(
      new Date(
        Number(month.slice(0, 4)),
        Number(month.slice(5, 7)),
        0,
      ).getDate(),
    ).padStart(2, "0");
const today = () => new Date().toISOString().slice(0, 10);
const monthNow = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
};
const title = (m: string) =>
  new Date(
    Number(m.slice(0, 4)),
    Number(m.slice(5, 7)) - 1,
    1,
  ).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
function paymentStatus(due: number, received: number, dueDate?: string) {
  return received >= due
    ? "PAID"
    : received > 0
      ? "PARTIAL"
      : dueDate && dueDate < today()
        ? "OVERDUE"
        : "PENDING";
}
export default function ClientRevenuePage() {
  const router = useRouter();
  const [month, setMonth] = useState(monthNow()),
    [clients, setClients] = useState<Client[]>([]),
    [payments, setPayments] = useState<Payment[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [queryText, setQueryText] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const u = auth.currentUser;
      if (!u) throw Error("Founder sign in required.");
      const profile = await getDoc(doc(db, "users", u.uid));
      if (
        !profile.exists() ||
        profile.data().role !== "founder" ||
        profile.data().active !== true
      )
        throw Error("Founder access required.");
      const [cs, ps] = await Promise.all([
        getDocs(collection(db, "clients")),
        getDocs(collection(db, "clientPayments")),
      ]);
      setClients(
        cs.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Client)
          .filter((c) => !c.deletedAt),
      );
      setPayments(ps.docs.map((d) => ({ id: d.id, ...d.data() }) as Payment));
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load client revenue.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        setLoading(false);
        setError("Founder sign in required.");
        return;
      }
      void load();
    });
    return () => unsub();
  }, [load]);
  const rows = useMemo(() => {
    const start = first(month),
      end = last(month);
    const active = clients.filter(
      (c) =>
        (
          c.accountStatus || (c.active === false ? "Archived" : "Active")
        ).toUpperCase() === "ACTIVE" &&
        (!c.joiningDate || c.joiningDate <= end),
    );
    return active.map((client) => {
      const relevant = payments.filter(
        (p) =>
          p.clientId === client.id &&
          (p.billingPeriod === month ||
            (p.paymentDate || "").startsWith(month)),
      );
      const due = relevant.reduce((n, p) => n + Number(p.amountDue || 0), 0),
        received = relevant.reduce(
          (n, p) => n + Number(p.amountReceived || 0),
          0,
        ),
        outstanding = Math.max(0, due - received),
        overdue = relevant
          .filter(
            (p) =>
              paymentStatus(
                Number(p.amountDue || 0),
                Number(p.amountReceived || 0),
                p.dueDate,
              ) === "OVERDUE",
          )
          .reduce(
            (n, p) =>
              n +
              Math.max(
                0,
                Number(p.amountDue || 0) - Number(p.amountReceived || 0),
              ),
            0,
          );
      return {
        client,
        due,
        received,
        outstanding,
        overdue,
        status: relevant.length
          ? paymentStatus(
              due,
              received,
              relevant.map((p) => p.dueDate).sort()[0],
            )
          : client.paymentStatus || "PENDING",
        newClient: Boolean(
          client.joiningDate &&
          client.joiningDate >= start &&
          client.joiningDate <= end,
        ),
      };
    });
  }, [clients, payments, month]);
  const totals = useMemo(
    () => ({
      active: rows.length,
      newClients: rows.filter((r) => r.newClient).length,
      due: rows.reduce((n, r) => n + r.due, 0),
      received: rows.reduce((n, r) => n + r.received, 0),
      outstanding: rows.reduce((n, r) => n + r.outstanding, 0),
      overdue: rows.reduce((n, r) => n + r.overdue, 0),
      expected: rows.reduce(
        (n, r) =>
          n +
          Number(r.client.expectedMonthlyRevenue ?? r.client.monthlyFee ?? 0),
        0,
      ),
    }),
    [rows],
  );
  const visible = rows.filter((r) =>
    (r.client.company || r.client.name || "")
      .toLowerCase()
      .includes(queryText.toLowerCase().trim()),
  );
  const exportCsv = () => {
    const data = [
      [
        "Client",
        "Month",
        "Amount Due",
        "Amount Received",
        "Outstanding",
        "Payment Status",
      ],
      ...visible.map((r) => [
        r.client.company || r.client.name,
        month,
        r.due,
        r.received,
        r.outstanding,
        r.status,
      ]),
    ];
    const csv = data
        .map((row) =>
          row
            .map((v) => '"' + String(v ?? "").replace(/"/g, '""') + '"')
            .join(","),
        )
        .join("\n"),
      url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "client-revenue-" + month + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const step = (n: number) => {
    const d = new Date(
      Number(month.slice(0, 4)),
      Number(month.slice(5, 7)) - 1 + n,
      1,
    );
    setMonth(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
  };
  if (loading)
    return <main className="min-h-screen bg-white p-8">Loading revenue…</main>;
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
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-red)] px-4 py-2 text-sm text-white"
          >
            <Download size={15} />
            Export Revenue Report
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm text-[var(--brand-red)]">
              <WalletCards size={17} />
              Founder reporting
            </p>
            <h1 className="mt-2 text-4xl font-bold">Client Revenue</h1>
            <p className="mt-1 text-sm text-gray-500">
              Revenue values are calculated from recorded client payments.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border p-2">
            <button
              onClick={() => step(-1)}
              aria-label="Previous month"
              className="rounded p-2"
            >
              <ArrowLeft size={16} />
            </button>
            <CalendarDays size={16} />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border-0 bg-transparent px-1 py-2 text-sm outline-none"
            />
            <button
              onClick={() => step(1)}
              aria-label="Next month"
              className="rounded p-2"
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
        <div className="my-5 flex justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm">
          <button onClick={() => step(-1)}>← Previous Month</button>
          <b>{title(month)}</b>
          <button onClick={() => step(1)}>Next Month →</button>
        </div>
        {error && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Active clients", totals.active],
            ["New clients", totals.newClients],
            ["Revenue due", fmt(totals.due)],
            ["Revenue received", fmt(totals.received)],
            ["Outstanding", fmt(totals.outstanding)],
            ["Overdue", fmt(totals.overdue)],
            ["Expected monthly revenue", fmt(totals.expected)],
            [
              "Average received / client",
              fmt(totals.active ? totals.received / totals.active : 0),
            ],
          ].map(([a, b]) => (
            <div key={String(a)} className="rounded-xl border p-4">
              <p className="text-xs text-gray-500">{a}</p>
              <b className="mt-2 block text-xl">{b}</b>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <input
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Search clients…"
            className="h-11 w-full rounded-xl border px-4 text-sm sm:max-w-sm"
          />
        </div>
        <section className="mt-4 overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                {[
                  "Client",
                  "Monthly fee",
                  "Due",
                  "Received",
                  "Outstanding",
                  "Overdue",
                  "Status",
                ].map((x) => (
                  <th key={x} className="px-4 py-3">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.client.id}
                  className="border-t hover:bg-[var(--brand-red-light)]"
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() =>
                        router.push("/founder/clients/" + r.client.id)
                      }
                      className="text-left font-semibold hover:text-[var(--brand-red)]"
                    >
                      {r.client.company || r.client.name}
                    </button>
                    <small className="block text-gray-500">
                      Joined {r.client.joiningDate || "—"}
                    </small>
                  </td>
                  <td className="px-4 py-3">
                    {fmt(Number(r.client.monthlyFee || 0))}
                  </td>
                  <td className="px-4 py-3">{fmt(r.due)}</td>
                  <td className="px-4 py-3">{fmt(r.received)}</td>
                  <td className="px-4 py-3">{fmt(r.outstanding)}</td>
                  <td className="px-4 py-3">{fmt(r.overdue)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border px-2 py-1 text-[10px] font-semibold uppercase">
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && (
            <p className="p-10 text-center text-sm text-gray-500">
              No active client revenue records for this month.
            </p>
          )}
        </section>
        <p className="mt-4 text-xs text-gray-500">
          Due, received, outstanding and overdue amounts are based on actual
          payment records. Expected revenue is a forecast from client profile
          values, not a collected payment.
        </p>
      </div>
    </main>
  );
}
