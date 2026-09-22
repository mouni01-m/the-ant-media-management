"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  Building2,
  CalendarDays,
  Check,
  CircleAlert,
  Edit3,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
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
  active: boolean;
  createdAt?: any;
  updatedAt?: any;
};

type ClientForm = {
  name: string;
  company: string;
  contactPerson: string;
  email: string;
  phone: string;
  website: string;
  industry: string;
  logoUrl: string;
  notes: string;
  active: boolean;
};

const emptyForm: ClientForm = {
  name: "",
  company: "",
  contactPerson: "",
  email: "",
  phone: "",
  website: "",
  industry: "",
  logoUrl: "",
  notes: "",
  active: true,
};

export default function FounderClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "ARCHIVED">("ALL");

  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [menuClient, setMenuClient] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthorized(false);
        setLoading(false);
        window.location.href = "/";
        return;
      }

      try {
        const currentUserRef = doc(db, "users", user.uid);
        const currentUserSnapshot = await getDoc(currentUserRef);

        if (
          !currentUserSnapshot.exists() ||
          currentUserSnapshot.data().role !== "founder"
        ) {
          setAuthorized(false);
          setError("Founder access required to manage clients.");
          setLoading(false);
          return;
        }

        setAuthorized(true);
        await loadClients();
      } catch (err) {
        console.error(err);
        setError("Unable to verify founder access.");
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  async function loadClients() {
    try {
      setLoading(true);
      setError("");

      const clientsQuery = query(collection(db, "clients"), orderBy("company"));

      const snapshot = await getDocs(clientsQuery);

      const data: Client[] = snapshot.docs.map((item) => ({
        ...(item.data() as Omit<Client, "id">),
        id: item.id,
      }));

      setClients(data);
    } catch (err) {
      console.error(err);

      try {
        const fallback = await getDocs(collection(db, "clients"));

        const data: Client[] = fallback.docs
          .map((item) => ({
            ...(item.data() as Omit<Client, "id">),
            id: item.id,
          }))
          .sort((a, b) => (a.company || "").localeCompare(b.company || ""));

        setClients(data);
        setError("");
      } catch (fallbackError) {
        console.error(fallbackError);
        setError("Unable to load clients from Firebase.");
      }
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    setEditingClient(null);
    setForm({ ...emptyForm });
    setShowModal(true);
    setMenuClient(null);
    setError("");
  }

  function openEditModal(client: Client) {
    setEditingClient(client);

    setForm({
      name: client.name || "",
      company: client.company || "",
      contactPerson: client.contactPerson || "",
      email: client.email || "",
      phone: client.phone || "",
      website: client.website || "",
      industry: client.industry || "",
      logoUrl: client.logoUrl || "",
      notes: client.notes || "",
      active: client.active !== false,
    });

    setShowModal(true);
    setMenuClient(null);
    setError("");
  }

  function closeModal() {
    if (saving) return;

    setShowModal(false);
    setEditingClient(null);
    setForm({ ...emptyForm });
  }

  function updateForm<K extends keyof ClientForm>(
    field: K,
    value: ClientForm[K],
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  async function saveClient() {
    if (!form.company.trim()) {
      setError("Company name is required.");
      return;
    }

    if (!form.contactPerson.trim()) {
      setError("Contact person is required.");
      return;
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
        website: form.website.trim(),
        industry: form.industry.trim(),
        logoUrl: form.logoUrl.trim(),
        notes: form.notes.trim(),
        active: form.active,
        updatedAt: serverTimestamp(),
      };

      if (editingClient) {
        await updateDoc(doc(db, "clients", editingClient.id), payload);
      } else {
        await addDoc(collection(db, "clients"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      await loadClients();
      closeModal();
    } catch (err) {
      console.error(err);
      setError("Unable to save client. Check your Firebase rules.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleClientStatus(client: Client) {
    setMenuClient(null);

    try {
      await updateDoc(doc(db, "clients", client.id), {
        active: !client.active,
        updatedAt: serverTimestamp(),
      });

      await loadClients();
    } catch (err) {
      console.error(err);
      setError("Unable to update client status.");
    }
  }

  async function archiveClient(client: Client) {
    setMenuClient(null);

    const confirmed = window.confirm(
      `Archive ${client.company}? The client will remain in Firebase but become inactive.`,
    );

    if (!confirmed) return;

    try {
      await updateDoc(doc(db, "clients", client.id), {
        active: false,
        updatedAt: serverTimestamp(),
      });

      await loadClients();
    } catch (err) {
      console.error(err);
      setError("Unable to archive client.");
    }
  }

  async function permanentlyDeleteClient(client: Client) {
    setMenuClient(null);

    const confirmed = window.confirm(
      `Permanently delete ${client.company}? This cannot be undone.`,
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "clients", client.id));

      if (selectedClient?.id === client.id) {
        setSelectedClient(null);
      }

      await loadClients();
    } catch (err) {
      console.error(err);
      setError("Unable to delete client.");
    }
  }

  const filteredClients = useMemo(() => {
    const keyword = search.toLowerCase().trim();

    return clients.filter((client) => {
      const matchesSearch =
        !keyword ||
        client.company?.toLowerCase().includes(keyword) ||
        client.name?.toLowerCase().includes(keyword) ||
        client.contactPerson?.toLowerCase().includes(keyword) ||
        client.email?.toLowerCase().includes(keyword) ||
        client.industry?.toLowerCase().includes(keyword);

      const matchesFilter =
        filter === "ALL" ||
        (filter === "ACTIVE" && client.active !== false) ||
        (filter === "ARCHIVED" && client.active === false);

      return matchesSearch && matchesFilter;
    });
  }, [clients, search, filter]);

  const activeClients = clients.filter(
    (client) => client.active !== false,
  ).length;

  const archivedClients = clients.filter(
    (client) => client.active === false,
  ).length;

  const totalContacts = clients.filter((client) => client.contactPerson).length;

  if (loading) {
    return (
      <main className="min-h-screen bg-white text-[var(--brand-black)]">
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-2 border-[var(--brand-red-secondary)] border-t-transparent" />
            <p className="text-sm text-[var(--brand-medium-gray)]">
              Loading client workspace...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen bg-white text-[var(--brand-black)]">
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="w-full max-w-lg rounded-3xl border border-red-500/20 bg-red-500/[0.04] p-8 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-700">
              <ShieldCheck size={28} />
            </div>

            <h1 className="text-2xl font-semibold">Founder access required</h1>

            <p className="mt-3 text-sm leading-6 text-[var(--brand-medium-gray)]">
              {error || "You do not have permission to manage clients."}
            </p>

            <button
              onClick={() => (window.location.href = "/")}
              className="mt-7 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-[var(--brand-red-light)]"
            >
              Return to login
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen bg-white text-[var(--brand-black)]"
      onClick={() => setMenuClient(null)}
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden"></div>

      <header className="sticky top-0 z-30 border-b border-[var(--brand-border)] bg-white ">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-5 lg:px-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => (window.location.href = "/founder")}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
            >
              ←
            </button>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-red)]">
                Founder / Management
              </p>

              <h1 className="mt-1 text-xl font-semibold tracking-tight">
                Clients
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-2 text-xs font-medium text-emerald-700 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm" />
              Workspace Active
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-red)] font-semibold shadow-sm">
              A
            </div>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1500px] px-5 py-8 lg:px-8 lg:py-10">
        <section className="mb-9 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="mb-4 flex items-center gap-2 text-sm text-[var(--brand-red)]">
              <Building2 size={17} />
              <span>Client relationships</span>
            </div>

            <h2 className="max-w-3xl text-4xl font-bold tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              Your clients.
              <br />
              <span className="text-[var(--brand-red)]">One workspace.</span>
            </h2>

            <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--brand-medium-gray)]">
              Manage client relationships, contact details, active accounts and
              the work connected to every client.
            </p>
          </div>

          <button
            onClick={openAddModal}
            className="group flex w-fit items-center gap-2 rounded-xl bg-[var(--brand-red)] px-5 py-3.5 text-sm font-semibold shadow-[0_12px_40px_rgba(10,10,10,0.25)] transition hover:scale-[1.02] hover:shadow-[0_15px_50px_rgba(10,10,10,0.35)]"
          >
            <Plus size={18} />
            Add Client
          </button>
        </section>

        {error && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-red-500/20 bg-red-500/[0.06] px-5 py-4 text-sm text-red-700">
            <div className="flex items-center gap-3">
              <CircleAlert size={18} />
              {error}
            </div>

            <button
              onClick={() => setError("")}
              className="text-[var(--brand-black)] transition hover:text-[var(--brand-black)]"
            >
              <X size={17} />
            </button>
          </div>
        )}

        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<Building2 size={20} />}
            label="Total clients"
            value={clients.length}
            description="All client accounts"
          />

          <StatCard
            icon={<Check size={20} />}
            label="Active"
            value={activeClients}
            description="Currently active accounts"
          />

          <StatCard
            icon={<Users size={20} />}
            label="Contacts"
            value={totalContacts}
            description="Client relationships"
          />

          <StatCard
            icon={<CalendarDays size={20} />}
            label="Archived"
            value={archivedClients}
            description="Inactive accounts"
          />
        </section>

        <section className="mb-6 rounded-2xl border border-[var(--brand-border)] bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] ">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--brand-black)]"
              />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search company, contact, email or industry..."
                className="h-12 w-full rounded-xl border border-[var(--brand-border)] bg-white pl-11 pr-4 text-sm text-[var(--brand-black)] outline-none placeholder:text-[var(--brand-black)] transition focus:border-[var(--brand-red-secondary)]/50 focus:bg-white"
              />
            </div>

            <div className="flex rounded-xl border border-[var(--brand-border)] bg-white p-1">
              {(["ALL", "ACTIVE", "ARCHIVED"] as const).map((item) => (
                <button
                  key={item}
                  onClick={() => setFilter(item)}
                  className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                    filter === item
                      ? "bg-[var(--brand-red)]/15 text-[var(--brand-red)] shadow-sm"
                      : "text-[var(--brand-black)] hover:text-[var(--brand-black)]"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-visible rounded-3xl border border-[var(--brand-border)] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between border-b border-[var(--brand-border)] px-6 py-5">
            <div>
              <h3 className="text-lg font-semibold">Client directory</h3>

              <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                {filteredClients.length} client
                {filteredClients.length === 1 ? "" : "s"} shown
              </p>
            </div>

            <button
              onClick={loadClients}
              className="rounded-xl border border-[var(--brand-border)] px-4 py-2 text-xs font-medium text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
            >
              Refresh
            </button>
          </div>

          {filteredClients.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--brand-border)] bg-white text-[var(--brand-black)]">
                <Building2 size={28} />
              </div>

              <h4 className="text-lg font-semibold">
                {clients.length === 0
                  ? "No clients yet"
                  : "No matching clients"}
              </h4>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--brand-medium-gray)]">
                {clients.length === 0
                  ? "Create your first client account to start connecting work, tasks and relationships."
                  : "Try a different search term or change the client filter."}
              </p>

              {clients.length === 0 && (
                <button
                  onClick={openAddModal}
                  className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-[var(--brand-red-light)]"
                >
                  Create first client
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[var(--brand-border)]">
              {filteredClients.map((client) => (
                <div
                  key={client.id}
                  className="group relative flex flex-col gap-5 px-6 py-6 transition hover:bg-[var(--brand-red-light)] lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <ClientAvatar client={client} />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h4 className="truncate text-base font-semibold">
                          {client.company}
                        </h4>

                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                            client.active !== false
                              ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-700"
                              : "border-[var(--brand-border)] bg-white text-[var(--brand-black)]"
                          }`}
                        >
                          {client.active !== false ? "Active" : "Archived"}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--brand-black)]">
                        {client.contactPerson && (
                          <span>{client.contactPerson}</span>
                        )}

                        {client.industry && <span>{client.industry}</span>}

                        {client.email && <span>{client.email}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {client.website && (
                      <a
                        href={normalizeWebsite(client.website)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
                        title="Open website"
                      >
                        <Globe size={17} />
                      </a>
                    )}

                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedClient(client);
                      }}
                      className="rounded-xl border border-[var(--brand-border)] bg-white px-4 py-2.5 text-xs font-semibold text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
                    >
                      View
                    </button>

                    <div className="relative">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();

                          setMenuClient(
                            menuClient === client.id ? null : client.id,
                          );
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--brand-border)] bg-white text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
                      >
                        <MoreHorizontal size={18} />
                      </button>

                      {menuClient === client.id && (
                        <div
                          onClick={(event) => event.stopPropagation()}
                          className="absolute right-0 top-12 z-20 w-52 overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-white p-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
                        >
                          <button
                            onClick={() => openEditModal(client)}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
                          >
                            <Edit3 size={16} />
                            Edit client
                          </button>

                          <button
                            onClick={() => toggleClientStatus(client)}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
                          >
                            <Check size={16} />

                            {client.active !== false
                              ? "Deactivate"
                              : "Activate"}
                          </button>

                          <button
                            onClick={() => archiveClient(client)}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-amber-700/80 transition hover:bg-amber-400/[0.07] hover:text-amber-700"
                          >
                            <CalendarDays size={16} />
                            Archive
                          </button>

                          <div className="my-1 border-t border-[var(--brand-border)]" />

                          <button
                            onClick={() => permanentlyDeleteClient(client)}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-red-700 transition hover:bg-red-400/[0.07]"
                          >
                            <Trash2 size={16} />
                            Delete permanently
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <InfoCard
            number="01"
            title="Client relationships"
            text="Keep every company, contact and communication reference organized in one place."
          />

          <InfoCard
            number="02"
            title="Connected work"
            text="Clients are stored separately so tasks and future content work can be linked to them."
          />

          <InfoCard
            number="03"
            title="Founder control"
            text="Only the founder workspace can create, edit, archive or delete client records."
          />
        </section>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 ">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[var(--brand-border)] bg-white shadow-[0_30px_100px_rgba(0,0,0,0.7)]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--brand-border)] bg-white px-6 py-5 ">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--brand-red)]">
                  Client management
                </p>

                <h3 className="mt-1 text-xl font-semibold">
                  {editingClient ? "Edit client" : "Add new client"}
                </h3>
              </div>

              <button
                onClick={closeModal}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--brand-border)] text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InputField
                  label="Company name *"
                  value={form.company}
                  onChange={(value) => updateForm("company", value)}
                  placeholder="e.g. Acme Technologies"
                />

                <InputField
                  label="Client / Brand name"
                  value={form.name}
                  onChange={(value) => updateForm("name", value)}
                  placeholder="e.g. Acme"
                />

                <InputField
                  label="Contact person *"
                  value={form.contactPerson}
                  onChange={(value) => updateForm("contactPerson", value)}
                  placeholder="e.g. Priya Sharma"
                />

                <InputField
                  label="Industry"
                  value={form.industry}
                  onChange={(value) => updateForm("industry", value)}
                  placeholder="e.g. Technology"
                />

                <InputField
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(value) => updateForm("email", value)}
                  placeholder="client@company.com"
                />

                <InputField
                  label="Phone"
                  value={form.phone}
                  onChange={(value) => updateForm("phone", value)}
                  placeholder="+91 98765 43210"
                />

                <InputField
                  label="Website"
                  value={form.website}
                  onChange={(value) => updateForm("website", value)}
                  placeholder="https://company.com"
                />

                <InputField
                  label="Logo URL"
                  value={form.logoUrl}
                  onChange={(value) => updateForm("logoUrl", value)}
                  placeholder="https://example.com/logo.png"
                />

                <div className="sm:col-span-2">
                  <label className="mb-2 block text-xs font-medium text-[var(--brand-black)]">
                    Account status
                  </label>

                  <button
                    type="button"
                    onClick={() => updateForm("active", !form.active)}
                    className={`flex h-12 w-full items-center justify-between rounded-xl border px-4 text-sm transition ${
                      form.active
                        ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-700"
                        : "border-[var(--brand-border)] bg-white text-[var(--brand-black)]"
                    }`}
                  >
                    <span>
                      {form.active ? "Active client" : "Archived client"}
                    </span>

                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        form.active ? "bg-emerald-400 shadow-sm" : "bg-white"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-[var(--brand-black)]">
                  Notes
                </label>

                <textarea
                  value={form.notes}
                  onChange={(event) => updateForm("notes", event.target.value)}
                  rows={4}
                  placeholder="Add useful client notes, preferences or relationship context..."
                  className="w-full resize-none rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 text-sm text-[var(--brand-black)] outline-none placeholder:text-[var(--brand-black)] transition focus:border-[var(--brand-red-secondary)]/50"
                />
              </div>

              {form.logoUrl && (
                <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-dark-gray)]">
                    Logo preview
                  </p>

                  <div className="flex items-center gap-4">
                    <img
                      src={form.logoUrl}
                      alt="Client logo preview"
                      className="h-16 w-16 rounded-2xl object-cover ring-1 ring-[var(--brand-border)]"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />

                    <div className="text-sm text-[var(--brand-black)]">
                      Client logo preview
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-[var(--brand-border)] pt-5">
                <button
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-xl border border-[var(--brand-border)] px-5 py-3 text-sm font-medium text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)] disabled:opacity-40"
                >
                  Cancel
                </button>

                <button
                  onClick={saveClient}
                  disabled={saving}
                  className="flex min-w-32 items-center justify-center gap-2 rounded-xl bg-[var(--brand-red)] px-5 py-3 text-sm font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--brand-border)] border-t-white" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={17} />
                      {editingClient ? "Save changes" : "Create client"}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 ">
          <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-[var(--brand-border)] bg-white shadow-[0_30px_100px_rgba(0,0,0,0.7)]">
            <div className="relative overflow-hidden border-b border-[var(--brand-border)] p-7">
              <button
                onClick={() => setSelectedClient(null)}
                className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--brand-border)] text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-4">
                <ClientAvatar client={selectedClient} large />

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-2xl font-semibold">
                      {selectedClient.company}
                    </h3>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${
                        selectedClient.active !== false
                          ? "bg-emerald-400/10 text-emerald-700"
                          : "bg-white text-[var(--brand-black)]"
                      }`}
                    >
                      {selectedClient.active !== false ? "Active" : "Archived"}
                    </span>
                  </div>

                  {selectedClient.name && (
                    <p className="mt-1 text-sm text-[var(--brand-medium-gray)]">
                      {selectedClient.name}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 p-6">
              <DetailRow
                icon={<Users size={17} />}
                label="Contact"
                value={selectedClient.contactPerson || "Not provided"}
              />

              <DetailRow
                icon={<Mail size={17} />}
                label="Email"
                value={selectedClient.email || "Not provided"}
              />

              <DetailRow
                icon={<Phone size={17} />}
                label="Phone"
                value={selectedClient.phone || "Not provided"}
              />

              <DetailRow
                icon={<Building2 size={17} />}
                label="Industry"
                value={selectedClient.industry || "Not specified"}
              />

              <DetailRow
                icon={<Globe size={17} />}
                label="Website"
                value={selectedClient.website || "Not provided"}
              />

              {selectedClient.logoUrl && (
                <div className="flex items-center gap-4 rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <img
                    src={selectedClient.logoUrl}
                    alt={`${selectedClient.company} logo`}
                    className="h-14 w-14 rounded-xl object-cover ring-1 ring-[var(--brand-border)]"
                  />

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-dark-gray)]">
                      Brand identity
                    </p>

                    <p className="mt-1 text-sm text-[var(--brand-medium-gray)]">
                      Client logo
                    </p>
                  </div>
                </div>
              )}

              {selectedClient.notes && (
                <div className="mt-5 rounded-2xl border border-[var(--brand-border)] bg-white p-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-dark-gray)]">
                    Notes
                  </p>

                  <p className="text-sm leading-6 text-[var(--brand-medium-gray)]">
                    {selectedClient.notes}
                  </p>
                </div>
              )}

              {selectedClient.website && (
                <a
                  href={normalizeWebsite(selectedClient.website)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--brand-black)] transition hover:bg-[var(--brand-red-light)] hover:text-[var(--brand-black)]"
                >
                  Visit client website
                  <ExternalLink size={15} />
                </a>
              )}

              <button
                onClick={() => setSelectedClient(null)}
                className="mt-2 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-[var(--brand-red-light)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* -------------------------------------------------------
   Client Avatar
------------------------------------------------------- */

function ClientAvatar({
  client,
  large = false,
}: {
  client: Client;
  large?: boolean;
}) {
  const size = large ? "h-16 w-16 text-xl" : "h-14 w-14 text-lg";

  if (client.logoUrl) {
    return (
      <div
        className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-[var(--brand-border)]`}
      >
        <img
          src={client.logoUrl}
          alt={`${client.company} logo`}
          className="h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`${size} flex shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-red)]/15 font-bold text-[var(--brand-red)] ring-1 ring-[var(--brand-border)]`}
    >
      {getInitials(client.company)}
    </div>
  );
}

/* -------------------------------------------------------
   Reusable UI
------------------------------------------------------- */

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
    <div className="group rounded-2xl border border-[var(--brand-border)] bg-white p-5 transition duration-300 hover:-translate-y-0.5 hover:border-[var(--brand-red-secondary)]/20 hover:bg-[var(--brand-red-light)]">
      <div className="mb-7 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-red)]/10 text-[var(--brand-red)] ring-1 ring-[var(--brand-red)]/10">
        {icon}
      </div>

      <p className="text-xs font-medium text-[var(--brand-dark-gray)]">
        {label}
      </p>

      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>

      <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
        {description}
      </p>
    </div>
  );
}

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
    <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-6">
      <p className="text-xs font-semibold text-[var(--brand-red)]">{number}</p>

      <h4 className="mt-5 text-base font-semibold">{title}</h4>

      <p className="mt-2 text-sm leading-6 text-[var(--brand-medium-gray)]">
        {text}
      </p>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-[var(--brand-black)]">
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 text-sm text-[var(--brand-black)] outline-none placeholder:text-[var(--brand-black)] transition focus:border-[var(--brand-red-secondary)]/50 focus:bg-white"
      />
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[var(--brand-border)] bg-white px-4 py-3.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-red)]/10 text-[var(--brand-red)]">
        {icon}
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-dark-gray)]">
          {label}
        </p>

        <p className="mt-0.5 truncate text-sm text-[var(--brand-medium-gray)]">
          {value}
        </p>
      </div>
    </div>
  );
}

function getInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "CL";

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function normalizeWebsite(value: string) {
  if (!value) return "#";

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  return `https://${value}`;
}
