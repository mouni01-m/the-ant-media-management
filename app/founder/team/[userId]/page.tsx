"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { ArrowLeft, Eye, EyeOff, FileText, Loader2, Pencil, Save, ShieldCheck, X } from "lucide-react";
import { auth, db } from "@/lib/firebase";

type EmployeeUser = {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  position?: string;
  department: string;
  active: boolean;
  joiningDate: string;
};
type EmployeeProfile = {
  photoUrl: string;
  mobileNumber: string;
  residentialAddress: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
  aadhaarNumber?: string;
  aadhaarMasked: string;
  bankDetails: {
    accountHolderName: string;
    bankName: string;
    accountNumber?: string;
    accountNumberMasked: string;
    ifscCode: string;
  };
  resumeUrl: string;
};
type ProfileResponse = { user: EmployeeUser; profile: EmployeeProfile };
type ProfileForm = Omit<EmployeeUser, "userId" | "joiningDate"> & Omit<EmployeeProfile, "aadhaarMasked" | "bankDetails"> & {
  aadhaarNumber: string;
  bankDetails: { accountHolderName: string; bankName: string; accountNumber: string; ifscCode: string };
};

const emptyForm: ProfileForm = {
  fullName: "", email: "", role: "employee", department: "development", active: true,
  photoUrl: "", mobileNumber: "", residentialAddress: "", emergencyContactName: "",
  emergencyContactNumber: "", aadhaarNumber: "", resumeUrl: "",
  bankDetails: { accountHolderName: "", bankName: "", accountNumber: "", ifscCode: "" },
};

export default function EmployeeProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const api = useCallback(async (method: "GET" | "POST" | "PUT", body?: unknown) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("Founder login required.");
    const response = await fetch(`/api/employee-profiles/${encodeURIComponent(userId)}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Unable to access employee profile.");
    return result as ProfileResponse;
  }, [userId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProfile(await api("GET"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load employee profile.");
    } finally { setLoading(false); }
  }, [api]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { setAuthorized(false); setCheckingAuth(false); setLoading(false); return; }
      try {
        const founder = await getDoc(doc(db, "users", user.uid));
        const allowed = founder.exists() && founder.data().role === "founder" && founder.data().active === true;
        setAuthorized(allowed);
        if (allowed) await load();
      } catch {
        setAuthorized(false);
        setLoading(false);
      } finally { setCheckingAuth(false); }
    });
    return () => unsubscribe();
  }, [load]);

  const revealPrivateFields = async () => {
    setError("");
    try {
      const response = await api("POST", { action: "reveal" });
      setProfile(response);
      setRevealed(true);
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : "Unable to reveal private fields.");
    }
  };

  const beginEdit = async () => {
    setError("");
    try {
      const response = await api("POST", { action: "reveal" });
      setProfile(response);
      setRevealed(true);
      setForm({
        fullName: response.user.fullName,
        email: response.user.email,
        role: response.user.role,
        department: response.user.department,
        active: response.user.active,
        photoUrl: response.profile.photoUrl,
        mobileNumber: response.profile.mobileNumber,
        residentialAddress: response.profile.residentialAddress,
        emergencyContactName: response.profile.emergencyContactName,
        emergencyContactNumber: response.profile.emergencyContactNumber,
        aadhaarNumber: response.profile.aadhaarNumber || "",
        bankDetails: {
          accountHolderName: response.profile.bankDetails.accountHolderName,
          bankName: response.profile.bankDetails.bankName,
          accountNumber: response.profile.bankDetails.accountNumber || "",
          ifscCode: response.profile.bankDetails.ifscCode,
        },
        resumeUrl: response.profile.resumeUrl,
      });
      setEditing(true);
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Unable to open profile editor.");
    }
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api("PUT", form);
      await load();
      setEditing(false);
      setRevealed(false);
      setForm(emptyForm);
      setMessage("Employee profile updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save employee profile.");
    } finally { setSaving(false); }
  };

  if (checkingAuth || loading) return <main className="flex min-h-screen items-center justify-center gap-3 bg-white text-sm"><Loader2 size={18} className="animate-spin" />Loading employee profile…</main>;
  if (!authorized) return <main className="flex min-h-screen items-center justify-center bg-white p-6"><div className="rounded-2xl border p-7 text-center"><ShieldCheck className="mx-auto text-[var(--brand-red)]" /><h1 className="mt-3 font-semibold">Founder access required</h1><button onClick={() => router.push("/founder/team")} className="mt-4 text-sm underline">Back to Team</button></div></main>;
  if (!profile) return <main className="min-h-screen bg-white p-8"><p>{error || "Employee profile not found."}</p><button onClick={() => router.push("/founder/team")} className="mt-4 underline">Back to Team</button></main>;

  const { user, profile: details } = profile;
  const field = (label: string, value?: string) => <div key={label} className="min-w-0 border-b py-3 last:border-0"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p><p className="mt-1 break-words text-sm font-medium">{value || "Not provided"}</p></div>;
  const textInput = (label: string, key: keyof ProfileForm, type = "text") => <label className="text-xs font-medium">{label}<input type={type} value={String(form[key] || "")} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="mt-1 h-11 w-full rounded-lg border px-3 text-sm" /></label>;

  return <main className="min-h-screen bg-white text-[var(--brand-black)]">
    <header className="border-b"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><button onClick={() => router.push("/founder/team")} className="inline-flex items-center gap-2 text-sm"><ArrowLeft size={16} /> Team</button>{!editing && <button onClick={() => void beginEdit()} className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-red)] px-4 py-2.5 text-sm font-medium text-white"><Pencil size={15} /> Edit Profile</button>}</div></header>
    <div className="mx-auto max-w-6xl px-5 py-7">
      {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}{message && <p className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</p>}
      <section className="flex flex-wrap items-center gap-4 rounded-2xl border p-5">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-red-50 text-xl font-bold text-[var(--brand-red)]">{details.photoUrl ? <Image src={details.photoUrl} alt={`${user.fullName} profile`} fill unoptimized className="object-cover" /> : user.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>
        <div className="min-w-0 flex-1"><h1 className="text-2xl font-semibold">{user.fullName || "Employee profile"}</h1><p className="mt-1 break-all text-sm text-gray-500">{user.email}</p><div className="mt-2 flex flex-wrap gap-2 text-xs"><span className="rounded-full border px-3 py-1">{user.position || user.role}</span><span className="rounded-full border px-3 py-1">{user.department}</span><span className={`rounded-full border px-3 py-1 ${user.active ? "text-green-700" : "text-red-700"}`}>{user.active ? "Active" : "Inactive"}</span></div></div>
      </section>

      {editing ? <form onSubmit={save} className="mt-5 space-y-5">
        <section className="rounded-2xl border p-5"><h2 className="mb-4 font-semibold">Personal details</h2><div className="grid gap-4 sm:grid-cols-2">{textInput("Full name", "fullName")}{textInput("Email address (sign-in email)", "email", "email")}{textInput("Photo link", "photoUrl", "url")}{textInput("Mobile number", "mobileNumber", "tel")}<label className="text-xs font-medium sm:col-span-2">Residential address<textarea value={form.residentialAddress} onChange={(e) => setForm({ ...form, residentialAddress: e.target.value })} rows={3} className="mt-1 w-full rounded-lg border p-3 text-sm" /></label><label className="text-xs font-medium">Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="mt-1 h-11 w-full rounded-lg border px-3 text-sm"><option value="employee">Employee</option><option value="intern">Intern</option></select></label><label className="text-xs font-medium">Department<input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="mt-1 h-11 w-full rounded-lg border px-3 text-sm" /></label><label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active account</label></div><p className="mt-3 text-xs text-gray-500">Changing this address updates Firebase Authentication and the workspace profile, resets email verification, and may require the employee to sign in again.</p></section>
        <section className="rounded-2xl border p-5"><h2 className="mb-4 font-semibold">Emergency contact & identity</h2><div className="grid gap-4 sm:grid-cols-2">{textInput("Emergency contact name", "emergencyContactName")}{textInput("Emergency contact number", "emergencyContactNumber", "tel")}{textInput("Aadhaar number (12 digits)", "aadhaarNumber")}</div></section>
        <section className="rounded-2xl border p-5"><h2 className="mb-4 font-semibold">Bank details</h2><div className="grid gap-4 sm:grid-cols-2">{[{ label: "Account holder name", key: "accountHolderName" }, { label: "Bank name", key: "bankName" }, { label: "Account number", key: "accountNumber" }, { label: "IFSC code", key: "ifscCode" }].map(({ label, key }) => <label key={key} className="text-xs font-medium">{label}<input value={form.bankDetails[key as keyof ProfileForm["bankDetails"]]} onChange={(e) => setForm({ ...form, bankDetails: { ...form.bankDetails, [key]: e.target.value } })} className="mt-1 h-11 w-full rounded-lg border px-3 text-sm" /></label>)}</div></section>
        <section className="rounded-2xl border p-5"><h2 className="mb-4 font-semibold">Professional details</h2>{textInput("Resume link", "resumeUrl", "url")}</section>
        <div className="flex justify-end gap-3"><button type="button" onClick={() => { setEditing(false); setRevealed(false); setForm(emptyForm); void load(); }} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm"><X size={15} /> Cancel</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-black)] px-4 py-2.5 text-sm text-white disabled:opacity-50"><Save size={15} />{saving ? "Saving…" : "Save Profile"}</button></div>
      </form> : <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border p-5"><h2 className="font-semibold">Personal details</h2>{field("Full name", user.fullName)}{field("Email address", user.email)}{field("Mobile number", details.mobileNumber)}{field("Residential address", details.residentialAddress)}</section>
        <section className="rounded-2xl border p-5"><h2 className="font-semibold">Emergency contact</h2>{field("Contact name", details.emergencyContactName)}{field("Contact number", details.emergencyContactNumber)}</section>
        <section className="rounded-2xl border p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Identity</h2><button onClick={() => revealed ? (setRevealed(false), void load()) : void revealPrivateFields()} className="inline-flex items-center gap-2 text-xs text-[var(--brand-red)]">{revealed ? <EyeOff size={14} /> : <Eye size={14} />}{revealed ? "Hide" : "Reveal"}</button></div>{field("Aadhaar number", revealed ? details.aadhaarNumber || "Not provided" : details.aadhaarMasked)}</section>
        <section className="rounded-2xl border p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Bank details</h2><button onClick={() => revealed ? (setRevealed(false), void load()) : void revealPrivateFields()} className="inline-flex items-center gap-2 text-xs text-[var(--brand-red)]">{revealed ? <EyeOff size={14} /> : <Eye size={14} />}{revealed ? "Hide" : "Reveal"}</button></div>{field("Account holder", details.bankDetails.accountHolderName)}{field("Bank", details.bankDetails.bankName)}{field("Account number", revealed ? details.bankDetails.accountNumber || "Not provided" : details.bankDetails.accountNumberMasked)}{field("IFSC", details.bankDetails.ifscCode)}</section>
        <section className="rounded-2xl border p-5 md:col-span-2"><h2 className="font-semibold">Professional details</h2>{field("Role", user.position || user.role)}{field("Department", user.department)}{field("Joining date", user.joiningDate)}{details.resumeUrl ? <a href={details.resumeUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><FileText size={15} /> Open resume</a> : <p className="mt-3 text-sm text-gray-500">No resume link provided.</p>}</section>
      </div>}
    </div>
  </main>;
}
