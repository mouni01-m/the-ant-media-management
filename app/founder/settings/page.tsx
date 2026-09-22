"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Loader2,
  Mail,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

type FounderProfile = {
  name?: string;
  email?: string;
  role?: string;
  department?: string;
  active?: boolean;
};

export default function FounderSettingsPage() {
  const [profile, setProfile] = useState<FounderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, "users", user.uid));
        const data = snapshot.exists()
          ? (snapshot.data() as FounderProfile)
          : null;

        if (data?.role === "founder" && data.active === true) {
          setProfile({ ...data, email: data.email || user.email || "" });
          setAuthorized(true);
        }
      } catch (error) {
        console.error("Founder settings access error:", error);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-[var(--brand-dark-gray)]">
        <div className="flex items-center gap-3 text-sm text-[var(--brand-medium-gray)]">
          <Loader2 size={18} className="animate-spin text-[var(--brand-red)]" />
          Loading workspace settings...
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="w-full max-w-md rounded-2xl border border-[var(--brand-border)] bg-white p-8 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <ShieldCheck className="mx-auto text-[var(--brand-red)]" size={28} />
          <h1 className="mt-4 text-2xl font-bold">Founder access required</h1>
          <p className="mt-2 text-sm text-[var(--brand-medium-gray)]">
            Sign in with an active Founder account to view workspace settings.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-xl bg-[var(--brand-red)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--brand-red-dark)]"
          >
            Back to login
          </Link>
        </div>
      </main>
    );
  }

  const settings = [
    { label: "Founder", value: profile?.name || "Founder", icon: UserRound },
    { label: "Email", value: profile?.email || "Not available", icon: Mail },
    {
      label: "Department",
      value: profile?.department || "Management",
      icon: Building2,
    },
    { label: "Access", value: "Active Founder", icon: ShieldCheck },
  ];

  return (
    <main className="min-h-screen bg-white text-[var(--brand-dark-gray)]">
      <header className="sticky top-0 z-20 border-b border-[var(--brand-border)] bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-5 sm:px-8">
          <Link
            href="/founder"
            aria-label="Back to Founder overview"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--brand-border)] text-[var(--brand-dark-gray)] hover:bg-[var(--brand-red-light)]"
          >
            <ArrowLeft size={19} />
          </Link>
          <div>
            <p className="text-xs font-semibold text-[var(--brand-red)]">
              Founder Workspace
            </p>
            <h1 className="mt-1 text-2xl font-bold">Settings</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <section className="rounded-2xl border border-[var(--brand-border)] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)] sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-red-light)] text-[var(--brand-red)]">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Workspace profile</h2>
              <p className="mt-1 text-sm text-[var(--brand-medium-gray)]">
                Current account and access information for THE ANT MEDIA.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {settings.map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--brand-border)] bg-[var(--surface-secondary)] p-5"
              >
                <div className="flex items-center gap-2 text-[var(--brand-red)]">
                  <Icon size={16} />
                  <span className="text-xs font-semibold">{label}</span>
                </div>
                <p className="mt-3 font-semibold text-[var(--brand-black)]">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-xs leading-5 text-[var(--brand-medium-gray)]">
            Account permissions and workspace configuration remain managed by
            the existing authentication and Firestore data model.
          </p>
        </section>
      </div>
    </main>
  );
}
