"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Crown,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Target,
  AlertTriangle,
  Activity,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  UserCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type CatalogItem = { id: string; name: string; description?: string; isActive: boolean };

type Member = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  position?: string;
  department?: string;
  active?: boolean;
};

type TeamTask = {
  id: string;
  title?: string;
  assignedTo?: string;
  assignedToName?: string;
  teamMemberIds?: string[];
  status?: string;
  priority?: string;
  deadline?: string;
  deadlineTime?: string;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function FounderTeamPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{ uid: string } | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<CatalogItem[]>([]);
  const [departments, setDepartments] = useState<CatalogItem[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [catalogKind, setCatalogKind] = useState<"role" | "department" | null>(null);
  const [editingCatalogItem, setEditingCatalogItem] = useState<CatalogItem | null>(null);
  const [catalogForm, setCatalogForm] = useState({ name: "", description: "" });
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [createType, setCreateType] = useState<"employee" | "founder">(
    "employee",
  );
  const [showRole, setShowRole] = useState<Member | null>(null);
  const [showFounderTransfer, setShowFounderTransfer] = useState(false);
  const [selectedFounder, setSelectedFounder] = useState<Member | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "employee",
    position: "Employee",
    department: "development",
  });

  const loadCatalog = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("Founder login required.");
    const response = await fetch("/api/team-catalog", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Unable to load roles and departments.");
    setRoles(result.roles || []);
    setDepartments(result.departments || []);
    setCatalogLoaded(true);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthorized(false);
        setLoading(false);
        setCheckingAuth(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (
          !snap.exists() ||
          snap.data().role !== "founder" ||
          snap.data().active !== true
        ) {
          setAuthorized(false);
          setLoading(false);
          setCheckingAuth(false);
          return;
        }

        setCurrentUser({ uid: user.uid, ...snap.data() });
        setAuthorized(true);
        void loadCatalog().catch((catalogError) => {
          console.error("Founder role and department catalog load failed:", catalogError);
          setError(catalogError instanceof Error ? catalogError.message : "Unable to load roles and departments.");
        });
      } catch (err) {
        console.error("Founder team authentication error:", err);
        setAuthorized(false);
      } finally {
        setLoading(false);
        setCheckingAuth(false);
      }
    });

    return () => unsubscribe();
  }, [loadCatalog]);

  useEffect(() => {
    if (!authorized) return;

    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<Member, "id">),
        }));
        data.sort((a, b) => {
          if (a.role === "founder") return -1;
          if (b.role === "founder") return 1;
          return String(a.name || a.email || "").localeCompare(
            String(b.name || b.email || ""),
          );
        });
        setMembers(data);
        setLoading(false);
      },
      (err) => {
        console.error("Team listener error:", err);
        setError("Unable to load the team. Check Firestore permissions.");
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [authorized]);

  useEffect(() => {
    if (!authorized) return;

    const unsubscribe = onSnapshot(
      collection(db, "tasks"),
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<TeamTask, "id">),
        })) as TeamTask[];

        setTasks(data);
      },
      (err) => {
        console.error("Team task listener error:", err);
      },
    );

    return () => unsubscribe();
  }, [authorized]);

  const founders = useMemo(
    () => members.filter((m) => m.role === "founder" && m.active !== false),
    [members],
  );
  const employees = useMemo(
    () => members.filter((m) => m.role === "employee" && m.active !== false),
    [members],
  );
  const interns = useMemo(
    () => members.filter((m) => m.role === "intern" && m.active !== false),
    [members],
  );

  const activeTeam = useMemo(
    () =>
      members.filter(
        (member) =>
          member.active !== false &&
          (member.role === "employee" || member.role === "intern"),
      ),
    [members],
  );

  const activeTaskStatuses = new Set([
    "todo",
    "to do",
    "in_progress",
    "in progress",
    "changes_requested",
  ]);

  function taskStatusKey(status?: string) {
    return String(status || "")
      .trim()
      .toLowerCase()
      .replace(/-/g, "_");
  }

  function getMemberWorkload(member: Member) {
    const memberTasks = tasks.filter((task) => {
      const assigned = task.assignedTo === member.id;
      const teamAssigned = (task.teamMemberIds || []).includes(member.id);
      return assigned || teamAssigned;
    });

    const active = memberTasks.filter(
      (task) =>
        activeTaskStatuses.has(taskStatusKey(task.status)) ||
        activeTaskStatuses.has(String(task.status || "").toLowerCase()),
    ).length;

    const overdue = memberTasks.filter((task) => {
      if (!task.deadline) return false;
      if (["completed", "approved"].includes(taskStatusKey(task.status))) {
        return false;
      }

      const due = new Date(
        `${task.deadline}T${task.deadlineTime || "23:59"}:00`,
      );
      return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
    }).length;

    return { total: memberTasks.length, active, overdue };
  }

  const workloadRows = useMemo(
    () =>
      activeTeam.map((member) => ({
        member,
        ...getMemberWorkload(member),
      })),
    [activeTeam, tasks],
  );

  const maxActive = Math.max(1, ...workloadRows.map((row) => row.active));

  const workloadRecommendations = useMemo(() => {
    const rows = workloadRows
      .filter((row) => row.active > 0 || row.overdue > 0)
      .sort((a, b) => {
        if (b.overdue !== a.overdue) return b.overdue - a.overdue;
        return b.active - a.active;
      });

    if (rows.length === 0) {
      return [
        {
          tone: "good",
          title: "Team capacity looks clear",
          detail:
            "No active or overdue workload signal needs attention right now.",
        },
      ];
    }

    const recommendations = [];

    const overloaded = rows.filter((row) => row.active >= 4);
    if (overloaded.length) {
      const names = overloaded
        .slice(0, 3)
        .map((row) => row.member.name || "Unnamed member")
        .join(", ");
      recommendations.push({
        tone: "warning",
        title: "High active workload",
        detail: `${names} ${overloaded.length === 1 ? "has" : "have"} 4 or more active tasks. Review the next assignment before adding more work.`,
      });
    }

    const overdue = rows.filter((row) => row.overdue > 0);
    if (overdue.length) {
      const names = overdue
        .slice(0, 3)
        .map((row) => row.member.name || "Unnamed member")
        .join(", ");
      recommendations.push({
        tone: "danger",
        title: "Overdue work needs attention",
        detail: `${names} ${overdue.length === 1 ? "has" : "have"} overdue task${overdue.length === 1 ? "" : "s"}.`,
      });
    }

    const available = rows
      .filter((row) => row.active === 0 && row.overdue === 0)
      .slice(0, 2);
    if (available.length) {
      recommendations.push({
        tone: "info",
        title: "Available capacity",
        detail: `${available.map((row) => row.member.name || "Unnamed member").join(", ")} currently ${available.length === 1 ? "has" : "have"} no active task${available.length === 1 ? "" : "s"}.`,
      });
    }

    return recommendations;
  }, [workloadRows]);

  function resetCreateForm() {
    setForm({
      name: "",
      email: "",
      password: "",
      role: createType === "founder" ? "founder" : "employee",
      position: createType === "founder" ? "Founder" : "Employee",
      department: createType === "founder" ? "management" : "development",
    });
    setMessage("");
    setError("");
  }

  function openCreate(type: "employee" | "founder") {
    setCreateType(type);
    setPasswordVisible(false);
    setForm({
      name: "",
      email: "",
      password: "",
      role: type === "founder" ? "founder" : "employee",
      position: type === "founder" ? "Founder" : roles.find((item) => item.isActive && item.name.toLowerCase() === "employee")?.name || roles.find((item) => item.isActive)?.name || "Employee",
      department: type === "founder" ? "management" : departments.find((item) => item.isActive)?.name || "",
    });
    setMessage("");
    setError("");
    setShowCreate(true);
  }

  async function createAccount() {
    setError("");
    setMessage("");

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const password = form.password;

    const roleAvailable = roles.some((item) => item.isActive && item.name === form.position);
    const departmentAvailable = departments.some((item) => item.isActive && item.name === form.department);
    if (!name || !email || password.length < 6 || (createType === "employee" && (!roleAvailable || !departmentAvailable))) {
      setError(
        !name || !email || password.length < 6
          ? "Name, email and a password of at least 6 characters are required."
          : "Select an active role and department before creating the account.",
      );
      return;
    }

    try {
      setActionLoading("create");

      const secondaryAuth = getAuth();
      const credential = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        password,
      );

      await setDoc(doc(db, "users", credential.user.uid), {
        name,
        email,
        role: createType === "founder" ? "founder" : form.role,
        position: createType === "founder" ? "Founder" : form.position,
        department: createType === "founder" ? "management" : form.department,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await signOut(secondaryAuth);
      setMessage(
        `${createType === "founder" ? "Founder" : "Employee/intern"} account created successfully.`,
      );
      setForm({
        name: "",
        email: "",
        password: "",
        role: createType === "founder" ? "founder" : "employee",
        position: createType === "founder" ? "Founder" : "Employee",
        department: "",
      });
      setTimeout(() => setShowCreate(false), 900);
    } catch (err: unknown) {
      console.error("Create account error:", err);
      const code = typeof err === "object" && err !== null && "code" in err
        ? String(err.code || "")
        : "";
      if (code.includes("auth/email-already-in-use"))
        setError("That email already has a Firebase Auth account.");
      else if (code.includes("auth/invalid-email"))
        setError("Please enter a valid email address.");
      else if (code.includes("auth/weak-password"))
        setError("Use a stronger password.");
      else
        setError(
          "Unable to create the account. Check Firebase Auth and Firestore permissions.",
        );
    } finally {
      setActionLoading(null);
    }
  }

  async function changeRole(member: Member, newRole: string) {
    if (member.role === "founder") {
      setError("Use Change Founder to transfer founder ownership.");
      return;
    }

    try {
      setActionLoading(member.id);
      const legacyAccessRole = ["employee", "intern"].includes(newRole.toLowerCase()) ? newRole.toLowerCase() : member.role || "employee";
      const position = newRole;
      await updateDoc(doc(db, "users", member.id), {
        role: legacyAccessRole,
        position,
        updatedAt: serverTimestamp(),
      });
      setMembers((current) => current.map((item) => item.id === member.id ? { ...item, role: legacyAccessRole, position } : item));
      setShowRole(null);
      setMessage(
        `${member.name || member.email || "Member"} is now ${newRole}.`,
      );
    } catch (err) {
      console.error("Change role error:", err);
      setError("Unable to change the role.");
    } finally {
      setActionLoading(null);
    }
  }

  async function saveCatalogItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!catalogKind) return;
    setError("");
    const normalizedName = catalogForm.name.trim().toLocaleLowerCase();
    const existing = (catalogKind === "role" ? roles : departments).some(
      (item) => item.id !== editingCatalogItem?.id && item.name.trim().toLocaleLowerCase() === normalizedName,
    );
    if (existing) {
      setError(`${catalogKind === "role" ? "Role" : "Department"} already exists.`);
      return;
    }
    try {
      setActionLoading("catalog");
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Founder login required.");
      const response = await fetch("/api/team-catalog", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ kind: catalogKind, action: editingCatalogItem ? "update" : "create", id: editingCatalogItem?.id, ...catalogForm }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to save catalog item.");
      await loadCatalog();
      setCatalogForm({ name: "", description: "" });
      setEditingCatalogItem(null);
      setMessage(`${catalogKind === "role" ? "Role" : "Department"} ${editingCatalogItem ? "updated" : "created"}.`);
    } catch (catalogError) {
      setError(catalogError instanceof Error ? catalogError.message : "Unable to save catalog item.");
    } finally { setActionLoading(null); }
  }

  async function setCatalogActive(kind: "role" | "department", item: CatalogItem) {
    try {
      setActionLoading(item.id);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Founder login required.");
      const response = await fetch("/api/team-catalog", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ kind, action: item.isActive ? "deactivate" : "activate", id: item.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to update catalog item.");
      await loadCatalog();
    } catch (catalogError) {
      setError(catalogError instanceof Error ? catalogError.message : "Unable to update catalog item.");
    } finally { setActionLoading(null); }
  }

  async function changeDepartment(member: Member, department: string) {
    try {
      setActionLoading(member.id);
      await updateDoc(doc(db, "users", member.id), {
        department,
        updatedAt: serverTimestamp(),
      });
      setShowRole(null);
      setMessage(
        `${member.name || member.email || "Member"}'s department was updated.`,
      );
    } catch (err) {
      console.error("Change department error:", err);
      setError("Unable to change the department.");
    } finally {
      setActionLoading(null);
    }
  }

  async function transferFounder(target: Member) {
    if (!currentUser || target.role === "founder") return;

    const confirmed = window.confirm(
      `Transfer Founder access to ${target.name || target.email}? You will become an employee after the transfer.`,
    );
    if (!confirmed) return;

    try {
      setActionLoading(target.id);

      await runTransaction(db, async (transaction) => {
        const currentRef = doc(db, "users", currentUser.uid);
        const targetRef = doc(db, "users", target.id);
        const [currentSnap, targetSnap] = await Promise.all([
          transaction.get(currentRef),
          transaction.get(targetRef),
        ]);

        if (!currentSnap.exists() || !targetSnap.exists()) {
          throw new Error("User profile not found.");
        }

        transaction.update(currentRef, {
          role: "employee",
          department:
            currentSnap.data().department === "Management"
              ? "Development"
              : currentSnap.data().department || "Development",
          updatedAt: serverTimestamp(),
        });
        transaction.update(targetRef, {
          role: "founder",
          department: "Management",
          active: true,
          updatedAt: serverTimestamp(),
        });
      });

      alert(
        "Founder changed successfully. Your current account is now an employee and will be redirected to the employee workspace.",
      );
      await signOut(auth);
      router.push("/");
    } catch (err) {
      console.error("Transfer founder error:", err);
      setError("Unable to change the Founder. Please try again.");
      setActionLoading(null);
    }
  }

  async function deleteMember(member: Member) {
    if (member.id === currentUser?.uid) {
      alert(
        "You cannot delete the currently signed-in Founder from this screen.",
      );
      return;
    }

    if (member.role === "founder" && founders.length <= 1) {
      alert("You must keep at least one active Founder account.");
      return;
    }

    const confirmed = window.confirm(
      `Delete ${member.name || member.email || "this member"}? Their Firestore workspace profile will be removed and they will lose workspace access.`,
    );
    if (!confirmed) return;

    try {
      setActionLoading(member.id);
      const token = await auth.currentUser?.getIdToken();
      const privateProfileResponse = await fetch(`/api/employee-profiles/${encodeURIComponent(member.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token || ""}` },
        cache: "no-store",
      });
      if (!privateProfileResponse.ok) throw new Error("Private profile cleanup failed.");
      await deleteDoc(doc(db, "users", member.id));
      setMessage(
        `${member.name || member.email || "Member"} was removed from the workspace.`,
      );
    } catch (err) {
      console.error("Delete member error:", err);
      setError(
        "Unable to delete the workspace profile. Check Firestore permissions.",
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function handleLogout() {
    await signOut(auth);
    window.location.href = "/";
  }

  if (checkingAuth) {
    return (
      <main className="min-h-screen bg-white text-[var(--brand-black)] flex items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--brand-black)]">
          <Loader2 size={20} className="animate-spin" /> Checking founder
          workspace...
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen bg-white text-[var(--brand-black)] flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-3xl border border-[var(--brand-border)] bg-white p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-700">
            <AlertCircle size={26} />
          </div>
          <h1 className="text-2xl font-semibold">Founder access required</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--brand-medium-gray)]">
            Only an active Founder can manage the Ant Media team.
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
  }

  return (
    <main className="min-h-screen bg-white text-[var(--brand-black)] overflow-x-hidden">
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
                Team Management
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="hidden md:flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 text-sm text-[var(--brand-black)] hover:bg-[var(--brand-red-light)]"
            >
              <RefreshCw size={16} /> Refresh
            </button>
            <button
              onClick={handleLogout}
              className="rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 text-sm text-[var(--brand-black)] hover:bg-[var(--brand-red-light)]"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-[1600px] px-6 py-10 lg:px-10">
        <section className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="mb-4 flex items-center gap-3 text-[var(--brand-red)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-red)]/10">
                <Users size={19} />
              </div>
              <span className="text-sm">People, roles & access control</span>
            </div>
            <h2 className="max-w-4xl text-5xl font-semibold tracking-[-0.05em] sm:text-6xl">
              Build the team that
              <br />
              <span className="text-[var(--brand-red)]">
                keeps the work moving.
              </span>
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[var(--brand-medium-gray)]">
              Create team accounts, transfer Founder ownership, change employee
              roles and remove workspace access from one secure management
              panel.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => openCreate("employee")}
              disabled={!catalogLoaded}
              className="flex items-center gap-2 rounded-xl bg-[var(--brand-red)] px-5 py-3.5 text-sm font-semibold shadow-[0_2px_8px_rgba(0,0,0,0.04)] shadow-black/20 disabled:opacity-60"
            >
              <UserPlus size={17} /> {catalogLoaded ? "Create Employee" : "Loading…"}
            </button>
            <button
              onClick={() => { setCatalogKind("role"); setEditingCatalogItem(null); setCatalogForm({ name: "", description: "" }); setError(""); }}
              className="flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3.5 text-sm font-semibold text-[var(--brand-black)] hover:bg-[var(--brand-red-light)]"
            >
              <BriefcaseBusiness size={16} /> Create Role
            </button>
            <button
              onClick={() => { setCatalogKind("department"); setEditingCatalogItem(null); setCatalogForm({ name: "", description: "" }); setError(""); }}
              className="flex items-center gap-2 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3.5 text-sm font-semibold text-[var(--brand-black)] hover:bg-[var(--brand-red-light)]"
            >
              <Building2 size={16} /> Create Department
            </button>
            <button
              onClick={() => openCreate("founder")}
              className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-5 py-3.5 text-sm font-semibold text-amber-700"
            >
              <Crown size={17} /> Create New Founder
            </button>
          </div>
        </section>

        {message && (
          <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-5 py-4 text-sm text-emerald-700">
            {message}
          </div>
        )}
        {error && (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/[0.06] px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            label="Founders"
            value={founders.length}
            icon={<Crown size={19} />}
          />
          <Stat
            label="Employees"
            value={employees.length}
            icon={<ShieldCheck size={19} />}
          />
          <Stat
            label="Interns"
            value={interns.length}
            icon={<Users size={19} />}
          />
          <Stat
            label="Total active"
            value={founders.length + employees.length + interns.length}
            icon={<UserPlus size={19} />}
          />
        </section>

        <section className="mt-8 overflow-hidden rounded-3xl border border-[var(--brand-border)] bg-white ">
          <div className="flex flex-col gap-4 border-b border-[var(--brand-border)] px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Workspace members</h3>
              <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                Founder controls are intentionally separated from employee
                access.
              </p>
            </div>
            <button
              onClick={() => {
                setShowFounderTransfer(true);
                setSelectedFounder(null);
              }}
              className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-2.5 text-xs font-semibold text-amber-700 hover:bg-amber-500/[0.09]"
            >
              <Crown size={15} /> Change Founder
            </button>
          </div>

          {loading ? (
            <div className="flex min-h-[300px] items-center justify-center text-[var(--brand-black)]">
              <Loader2 className="animate-spin" size={20} />
            </div>
          ) : (
            <div className="divide-y divide-[var(--brand-border)]">
              {members.map((member) => (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    {member.role !== "founder" ? <Link href={`/founder/team/${encodeURIComponent(member.id)}`} aria-label={`View ${member.name || "employee"} profile`} className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${member.role === "founder" ? "bg-amber-500/10 text-amber-700" : "bg-[var(--brand-red)]/10 text-[var(--brand-red)]"}`}>
                      {getInitials(member.name || member.email || "U")}
                    </Link> : <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${member.role === "founder" ? "bg-amber-500/10 text-amber-700" : "bg-[var(--brand-red)]/10 text-[var(--brand-red)]"}`}
                    >
                      {getInitials(member.name || member.email || "U")}
                    </div>}
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {member.role !== "founder" ? <Link href={`/founder/team/${encodeURIComponent(member.id)}`} className="hover:text-[var(--brand-red)]">{member.name || "Unnamed member"}</Link> : (member.name || "Unnamed member")}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-[var(--brand-medium-gray)]">
                        <Mail size={12} /> {member.email || "No email"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:w-[620px] lg:justify-end">
                    <span
                      className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                        member.active !== false
                          ? "border-emerald-500/15 bg-emerald-500/[0.05] text-emerald-700"
                          : "border-red-500/15 bg-red-500/[0.05] text-red-700"
                      }`}
                    >
                      {member.active !== false ? "Active" : "Inactive"}
                    </span>
                    <span className="rounded-full border border-[var(--brand-border)] bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-black)]">
                      {member.position || member.role}
                    </span>
                    <span className="rounded-full border border-[var(--brand-border)] bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-black)]">
                      {member.department || "unassigned"}
                    </span>
                    {member.role !== "founder" && (
                      <div className="rounded-xl border border-[var(--brand-red-secondary)]/15 bg-[var(--brand-red)]/[0.05] px-3 py-2 text-xs text-[var(--brand-red)]">
                        <span className="font-semibold">
                          {getMemberWorkload(member).active}
                        </span>
                        <span className="ml-1 text-[var(--brand-black)]">
                          active
                        </span>
                      </div>
                    )}
                    {member.role !== "founder" && (
                      <button
                        onClick={() => setShowRole(member)}
                        className="rounded-xl border border-[var(--brand-border)] bg-white p-2.5 text-[var(--brand-black)] hover:text-[var(--brand-black)]"
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    {member.role !== "founder" && <Link href={`/founder/team/${encodeURIComponent(member.id)}`} className="rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-xs font-medium hover:border-[var(--brand-red)]">View Profile</Link>}
                    {member.role === "founder" ? (
                      <button
                        onClick={() => {
                          setSelectedFounder(member);
                          setShowFounderTransfer(true);
                        }}
                        className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-xs font-semibold text-amber-700"
                      >
                        Manage Founder
                      </button>
                    ) : null}
                    <button
                      onClick={() => deleteMember(member)}
                      disabled={actionLoading === member.id}
                      className="rounded-xl border border-red-500/15 bg-red-500/[0.04] p-2.5 text-red-700/70 hover:text-red-700 disabled:opacity-50"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="rounded-3xl border border-[var(--brand-border)] bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--brand-red)]">
                  Live workload
                </p>
                <h3 className="mt-2 text-xl font-semibold">
                  Workload visibility
                </h3>
                <p className="mt-1 text-sm text-[var(--brand-medium-gray)]">
                  Active and overdue tasks by working employee or intern.
                </p>
              </div>
              <Activity size={20} className="text-[var(--brand-red)]" />
            </div>

            <div className="mt-6 space-y-4">
              {workloadRows.length === 0 ? (
                <p className="rounded-2xl border border-[var(--brand-border)] p-5 text-sm text-[var(--brand-medium-gray)]">
                  No active employee or intern accounts found.
                </p>
              ) : (
                workloadRows.map((row) => (
                  <div
                    key={row.member.id}
                    className="rounded-2xl border border-[var(--brand-border)] bg-white p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {row.member.name || "Unnamed member"}
                        </p>
                        <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                          {row.member.role} ·{" "}
                          {row.member.department || "unassigned"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {row.active} active
                        </p>
                        <p
                          className={`mt-1 text-[11px] ${row.overdue ? "text-red-700" : "text-[var(--brand-black)]"}`}
                        >
                          {row.overdue} overdue
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full bg-[var(--brand-red)]"
                        style={{
                          width: `${Math.min(100, (row.active / maxActive) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--brand-border)] bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--brand-red)]">
                  Founder intelligence
                </p>
                <h3 className="mt-2 text-xl font-semibold">Recommendations</h3>
                <p className="mt-1 text-sm text-[var(--brand-medium-gray)]">
                  Simple signals to help review the next assignment.
                </p>
              </div>
              <ArrowUpRight size={20} className="text-[var(--brand-red)]" />
            </div>

            <div className="mt-6 space-y-3">
              {workloadRecommendations.map((item, index) => (
                <div
                  key={`${item.title}-${index}`}
                  className={`rounded-2xl border p-4 ${
                    item.tone === "danger"
                      ? "border-red-500/15 bg-red-500/[0.05]"
                      : item.tone === "warning"
                        ? "border-amber-500/15 bg-amber-500/[0.05]"
                        : item.tone === "info"
                          ? "border-[var(--brand-red-secondary)]/15 bg-[var(--brand-red)]/[0.05]"
                          : "border-emerald-500/15 bg-emerald-500/[0.05]"
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="mt-0.5 shrink-0">
                      {item.tone === "danger" ? (
                        <AlertTriangle size={17} className="text-red-700" />
                      ) : item.tone === "warning" ? (
                        <AlertTriangle size={17} className="text-amber-700" />
                      ) : item.tone === "info" ? (
                        <ArrowUpRight
                          size={17}
                          className="text-[var(--brand-red)]"
                        />
                      ) : (
                        <UserCheck size={17} className="text-emerald-700" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--brand-medium-gray)]">
                        {item.detail}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Info
            title="Founder"
            text="Full  access, including users, tasks, attendance, clients and calendar operations."
          />
          <Info
            title="Employee"
            text="Work-focused access. Employees can receive, work on and submit assigned tasks."
          />
          <Info
            title="Intern"
            text="Restricted work access for development interns without management controls."
          />
        </div>
      </div>

      {showCreate && (
        <Modal
          title={
            createType === "founder"
              ? "Create New Founder"
              : "Create Employee / Intern"
          }
          onClose={() => setShowCreate(false)}
        >
          <div className="space-y-4">
            <Field label="Full name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Arun Kumar"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@antmedia.in"
              />
            </Field>
            <Field label="Temporary password">
              <div className="relative">
                <input
                  type={passwordVisible ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Minimum 6 characters"
                  autoComplete="new-password"
                  style={{ width: "100%", paddingRight: "2.75rem" }}
                />
                <button
                  type="button"
                  aria-label={passwordVisible ? "Hide temporary password" : "Show temporary password"}
                  aria-pressed={passwordVisible}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 border-0 bg-transparent p-1 text-[var(--brand-medium-gray)] hover:text-[var(--brand-black)]"
                >
                  {passwordVisible ? <Eye size={17} /> : <EyeOff size={17} />}
                </button>
              </div>
            </Field>
            {createType === "employee" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Role">
                  <select
                    value={form.position}
                    onChange={(e) => setForm({ ...form, position: e.target.value, role: e.target.value.toLowerCase() === "intern" ? "intern" : "employee" })}
                  >
                    {roles.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                  </select>
                </Field>
                <Field label="Department">
                  <select
                    value={form.department}
                    onChange={(e) =>
                      setForm({ ...form, department: e.target.value })
                    }
                  >
                    {departments.filter((item) => item.isActive).map((item) => (
                      <option key={item.id} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            {createType === "founder" && (
              <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-4 text-xs leading-5 text-amber-700/70">
                This creates a separate Firebase Auth account and a Founder
                profile in Firestore. Keep Founder accounts limited to trusted
                management users.
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-3 text-xs text-red-700">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 text-xs text-emerald-700">
                {message}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 rounded-xl border border-[var(--brand-border)] bg-white px-4 py-3 text-sm text-[var(--brand-black)]"
              >
                Cancel
              </button>
              <button
                onClick={createAccount}
                disabled={actionLoading === "create"}
                className="flex-1 rounded-xl bg-[var(--brand-red)] px-4 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {actionLoading === "create" ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" /> Creating...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Check size={16} /> Create account
                  </span>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {catalogKind && (
        <Modal
          title={catalogKind === "role" ? "Manage Roles" : "Manage Departments"}
          onClose={() => { setCatalogKind(null); setEditingCatalogItem(null); setCatalogForm({ name: "", description: "" }); }}
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--brand-medium-gray)]">Create, rename, or deactivate {catalogKind === "role" ? "team roles" : "departments"}. Inactive entries remain assigned to current team members.</p>
            <div className="max-h-56 divide-y overflow-y-auto rounded-xl border border-[var(--brand-border)]">
              {(catalogKind === "role" ? roles : departments).map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-[10px] text-[var(--brand-medium-gray)]">{item.isActive ? "Active" : "Inactive"}{item.description ? ` · ${item.description}` : ""}</p>
                  </div>
                  <button onClick={() => { setEditingCatalogItem(item); setCatalogForm({ name: item.name, description: item.description || "" }); }} className="rounded-lg border border-[var(--brand-border)] px-2.5 py-1.5 text-xs hover:border-[var(--brand-red)]">Edit</button>
                  <button onClick={() => void setCatalogActive(catalogKind, item)} disabled={actionLoading === item.id} className="rounded-lg border border-[var(--brand-border)] px-2.5 py-1.5 text-xs disabled:opacity-50">{actionLoading === item.id ? "Saving…" : item.isActive ? "Deactivate" : "Activate"}</button>
                </div>
              ))}
            </div>
            <form onSubmit={saveCatalogItem} className="space-y-3 rounded-xl border border-[var(--brand-border)] p-4">
              <h3 className="text-sm font-semibold">{editingCatalogItem ? `Edit ${catalogKind}` : `Create ${catalogKind}`}</h3>
              <Field label={`${catalogKind === "role" ? "Role" : "Department"} name *`}>
                <input required maxLength={80} value={catalogForm.name} onChange={(event) => setCatalogForm({ ...catalogForm, name: event.target.value })} placeholder={catalogKind === "role" ? "e.g. Manager" : "e.g. Marketing"} />
              </Field>
              <Field label="Description">
                <input value={catalogForm.description} onChange={(event) => setCatalogForm({ ...catalogForm, description: event.target.value })} placeholder="Optional description" />
              </Field>
              {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
              <div className="flex gap-2">
                {editingCatalogItem && <button type="button" onClick={() => { setEditingCatalogItem(null); setCatalogForm({ name: "", description: "" }); }} className="rounded-xl border border-[var(--brand-border)] px-4 py-2.5 text-sm">Cancel edit</button>}
                <button type="submit" disabled={actionLoading === "catalog"} className="rounded-xl bg-[var(--brand-red)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{actionLoading === "catalog" ? "Saving…" : editingCatalogItem ? "Save changes" : `Create ${catalogKind}`}</button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {showRole && (
        <Modal
          title={`Edit ${showRole.name || "member"}`}
          onClose={() => setShowRole(null)}
        >
          <div className="space-y-4">
            <Field label="Role">
              <select
                value={showRole.position || roles.find((item) => item.name.toLowerCase() === (showRole.role || "employee").toLowerCase())?.name || showRole.role || "employee"}
                onChange={(e) => changeRole(showRole, e.target.value)}
              >
                {roles.filter((item) => item.isActive || item.name.toLowerCase() === (showRole.position || showRole.role || "").toLowerCase()).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="Department">
              <select
                value={showRole.department || "development"}
                onChange={(e) => changeDepartment(showRole, e.target.value)}
              >
                {departments.filter((item) => item.isActive || item.name === showRole.department).map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-xs text-[var(--brand-medium-gray)]">
              Changing an employee&apos;s role updates the Firestore profile
              immediately. Management controls remain Founder-only.
            </p>
          </div>
        </Modal>
      )}

      {showFounderTransfer && (
        <Modal
          title="Change Founder"
          onClose={() => setShowFounderTransfer(false)}
        >
          <p className="text-sm leading-6 text-[var(--brand-medium-gray)]">
            Select an active employee or intern to receive Founder access. The
            current Founder will become an employee and will be signed out.
          </p>
          <div className="mt-5 space-y-2">
            {members
              .filter((m) => m.role !== "founder" && m.active !== false)
              .map((member) => (
                <button
                  key={member.id}
                  onClick={() => transferFounder(member)}
                  disabled={actionLoading === member.id}
                  className="w-full rounded-2xl border border-[var(--brand-border)] bg-white p-4 text-left hover:bg-[var(--brand-red-light)] disabled:opacity-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">
                        {member.name || "Unnamed"}
                      </p>
                      <p className="mt-1 text-xs text-[var(--brand-medium-gray)]">
                        {member.email} · {member.role} · {member.department}
                      </p>
                    </div>
                    {actionLoading === member.id ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : (
                      <Crown size={17} className="text-amber-700" />
                    )}
                  </div>
                </button>
              ))}
            {members.filter((m) => m.role !== "founder" && m.active !== false)
              .length === 0 && (
              <p className="rounded-2xl border border-[var(--brand-border)] p-5 text-sm text-[var(--brand-medium-gray)]">
                No active employee or intern is available for transfer.
              </p>
            )}
          </div>
        </Modal>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-red)]/10 text-[var(--brand-red)]">
        {icon}
      </div>
      <p className="mt-4 text-xs text-[var(--brand-medium-gray)]">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}
function Info({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-5">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 text-xs leading-6 text-[var(--brand-medium-gray)]">
        {text}
      </p>
    </div>
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 ">
      <div className="w-full max-w-xl rounded-3xl border border-[var(--brand-border)] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-xl bg-white p-2 text-[var(--brand-black)] hover:text-[var(--brand-black)]"
          >
            <X size={17} />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-black)]">
        {label}
      </span>
      {children}
    </label>
  );
}
