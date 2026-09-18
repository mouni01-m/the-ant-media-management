"use client";

import { FormEvent, useState } from "react";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  User,
  ShieldCheck,
  Zap,
} from "lucide-react";

import { auth, db } from "@/lib/firebase";

export default function Home() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success" | "">("");

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !password) {
      setMessageType("error");
      setMessage("Please enter your name, email and password.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      setMessageType("");

      // ----------------------------------------------------
      // 1. AUTHENTICATE USER
      // ----------------------------------------------------
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const user = userCredential.user;

      // ----------------------------------------------------
      // 2. FIND PROFILE USING AUTH UID
      // ----------------------------------------------------
      const userRef = doc(db, "users", user.uid);

      // Force a fresh server read
      const userSnap = await getDocFromServer(userRef);

      // ----------------------------------------------------
      // 3. DEBUG INFORMATION
      // ----------------------------------------------------
      console.log("====================================");
      console.log("AUTH UID:", user.uid);
      console.log("AUTH EMAIL:", user.email);
      console.log("FIRESTORE PATH:", `users/${user.uid}`);
      console.log("PROFILE EXISTS:", userSnap.exists());
      console.log("FIREBASE PROJECT:", db.app.options.projectId);

      if (userSnap.exists()) {
        console.log("PROFILE DATA:", userSnap.data());
      }

      // ----------------------------------------------------
      // 4. EXTRA EMAIL SEARCH
      // This checks whether a profile exists under a
      // different Firestore document ID.
      // ----------------------------------------------------
      try {
        const usersQuery = query(
          collection(db, "users"),
          where("email", "==", user.email)
        );

        const usersSnap = await getDocs(usersQuery);

        console.log("USERS WITH THIS EMAIL:", usersSnap.size);

        usersSnap.forEach((userDoc) => {
          console.log("FOUND FIRESTORE DOC ID:", userDoc.id);
          console.log("FOUND FIRESTORE DATA:", userDoc.data());
        });
      } catch (emailSearchError) {
        console.error(
          "EMAIL PROFILE SEARCH ERROR:",
          emailSearchError
        );
      }

      console.log("====================================");

      // ----------------------------------------------------
      // 5. PROFILE DOES NOT EXIST
      // ----------------------------------------------------
      if (!userSnap.exists()) {
        setMessageType("error");
        setMessage(
          "Your account exists, but your workspace profile has not been created."
        );

        await signOut(auth);
        return;
      }

      // ----------------------------------------------------
      // 6. GET PROFILE DATA
      // ----------------------------------------------------
      const userData = userSnap.data();

      console.log("USER PROFILE:", userData);

      // ----------------------------------------------------
      // 7. VERIFY LOGIN NAME
      // The name entered at login must match the workspace
      // profile created for this Firebase account.
      // ----------------------------------------------------
      const storedName =
        typeof userData.name === "string" ? userData.name.trim() : "";

      if (
        !storedName ||
        storedName.toLowerCase() !== name.trim().toLowerCase()
      ) {
        setMessageType("error");
        setMessage(
          "The name does not match your workspace profile. Please enter your registered name."
        );

        await signOut(auth);
        return;
      }

      // ----------------------------------------------------
      // 8. CHECK ACTIVE STATUS
      // ----------------------------------------------------
      if (userData.active !== true) {
        setMessageType("error");
        setMessage(
          "Your account is currently inactive. Please contact the founder."
        );

        await signOut(auth);
        return;
      }

      // ----------------------------------------------------
      // 9. CHECK ROLE
      // ----------------------------------------------------
      const role = userData.role;

      if (role === "founder") {
        setMessageType("success");
        setMessage("Welcome back, Founder.");

        window.location.href = "/founder";
        return;
      }

      if (role === "employee") {
        setMessageType("success");
        setMessage("Welcome back.");

        window.location.href = "/employee";
        return;
      }

      if (role === "intern") {
        setMessageType("success");
        setMessage("Welcome back.");

        window.location.href = "/intern";
        return;
      }

      // ----------------------------------------------------
      // 10. INVALID ROLE
      // ----------------------------------------------------
      setMessageType("error");
      setMessage(
        "Your account has an invalid role. Please contact the founder."
      );

      await signOut(auth);
    } catch (error: unknown) {
      console.error("LOGIN ERROR:", error);

      setMessageType("error");

      const firebaseError = error as {
        code?: string;
        message?: string;
      };

      switch (firebaseError.code) {
        case "auth/invalid-credential":
          setMessage("Invalid email or password.");
          break;

        case "auth/wrong-password":
          setMessage("Incorrect password.");
          break;

        case "auth/user-not-found":
          setMessage("No account exists with this email.");
          break;

        case "auth/invalid-email":
          setMessage("Please enter a valid email address.");
          break;

        case "auth/too-many-requests":
          setMessage(
            "Too many failed attempts. Please try again later."
          );
          break;

        case "permission-denied":
          setMessage(
            "Firestore permission denied. Please check your Firestore Rules."
          );
          break;

        default:
          setMessage(
            firebaseError.message ||
              "Something went wrong. Please try again."
          );
      }
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------------
  // PASSWORD RESET
  // --------------------------------------------------------
  const handleForgotPassword = async () => {
    if (!email) {
      setMessageType("error");
      setMessage("Enter your email address first.");
      return;
    }

    try {
      setResetLoading(true);
      setMessage("");

      await sendPasswordResetEmail(auth, email.trim());

      setMessageType("success");
      setMessage(
        "Password reset email sent. Check your inbox."
      );
    } catch (error: unknown) {
      console.error("PASSWORD RESET ERROR:", error);

      setMessageType("error");

      const firebaseError = error as {
        code?: string;
        message?: string;
      };

      switch (firebaseError.code) {
        case "auth/user-not-found":
          setMessage("No account exists with this email.");
          break;

        case "auth/invalid-email":
          setMessage("Please enter a valid email address.");
          break;

        default:
          setMessage(
            firebaseError.message ||
              "Unable to send password reset email."
          );
      }
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#050509] text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-600/20 blur-[120px]" />

        <div className="absolute right-[-100px] top-[15%] h-[450px] w-[450px] rounded-full bg-blue-600/15 blur-[130px]" />

        <div className="absolute bottom-[-150px] left-[30%] h-[400px] w-[400px] rounded-full bg-purple-600/10 blur-[120px]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:28px_28px] opacity-30" />
      </div>

      {/* Main */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-[480px]">
          {/* Brand */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8 text-center"
          >
            {/* Ant Logo */}
            <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-[20px] border border-white/10 bg-gradient-to-br from-violet-500 to-blue-600 shadow-2xl shadow-violet-500/20">
              <span className="text-4xl">🐜</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              THE ANT MEDIA
            </h1>

            <p className="mt-2 text-sm text-white/45">
              Small Team. Big Impact.
            </p>
          </motion.div>

          {/* Login Card */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: 0.7,
              delay: 0.1,
            }}
            className="relative overflow-hidden rounded-[28px] border border-white/[0.09] bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl sm:p-8"
          >
            {/* Card glow */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />

            <div className="relative">
              {/* Heading */}
              <div className="mb-8">
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50" />

                  <span className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-400/80">
                    Workspace Secure
                  </span>
                </div>

                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Welcome back
                </h2>

                <p className="mt-2 text-sm text-white/45">
                  Sign in to your workspace
                </p>
              </div>

              {/* Login Form */}
              <form onSubmit={handleLogin} className="space-y-5">
                {/* Name */}
                <div>
                  <label
                    htmlFor="name"
                    className="mb-2 block text-sm font-medium text-white/75"
                  >
                    Name
                  </label>

                  <div className="group relative">
                    <User
                      size={18}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35 transition group-focus-within:text-violet-400"
                    />

                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter your registered name"
                      autoComplete="name"
                      className="h-14 w-full rounded-2xl border border-white/10 bg-black/20 pl-12 pr-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-violet-500/50 focus:bg-black/30 focus:ring-4 focus:ring-violet-500/10"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-medium text-white/75"
                  >
                    Email
                  </label>

                  <div className="group relative">
                    <Mail
                      size={18}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35 transition group-focus-within:text-violet-400"
                    />

                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@antmedia.com"
                      autoComplete="email"
                      className="h-14 w-full rounded-2xl border border-white/10 bg-black/20 pl-12 pr-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-violet-500/50 focus:bg-black/30 focus:ring-4 focus:ring-violet-500/10"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor="password"
                    className="mb-2 block text-sm font-medium text-white/75"
                  >
                    Password
                  </label>

                  <div className="group relative">
                    <LockKeyhole
                      size={18}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35 transition group-focus-within:text-violet-400"
                    />

                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) =>
                        setPassword(e.target.value)
                      }
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="h-14 w-full rounded-2xl border border-white/10 bg-black/20 pl-12 pr-12 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-violet-500/50 focus:bg-black/30 focus:ring-4 focus:ring-violet-500/10"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword(!showPassword)
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35 transition hover:text-white"
                      aria-label={
                        showPassword
                          ? "Hide password"
                          : "Show password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Forgot password */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={resetLoading}
                    className="text-sm font-medium text-violet-400 transition hover:text-violet-300 disabled:opacity-50"
                  >
                    {resetLoading
                      ? "Sending..."
                      : "Forgot password?"}
                  </button>
                </div>

                {/* Message */}
                {message && (
                  <motion.div
                    initial={{
                      opacity: 0,
                      height: 0,
                      y: -5,
                    }}
                    animate={{
                      opacity: 1,
                      height: "auto",
                      y: 0,
                    }}
                    className={`rounded-2xl border px-4 py-3 text-sm ${
                      messageType === "success"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                        : "border-red-500/20 bg-red-500/10 text-red-300"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {messageType === "success" ? (
                        <CheckCircle2
                          size={17}
                          className="mt-0.5 shrink-0"
                        />
                      ) : (
                        <ShieldCheck
                          size={17}
                          className="mt-0.5 shrink-0"
                        />
                      )}

                      <span>{message}</span>
                    </div>
                  </motion.div>
                )}

                {/* Sign In */}
                <motion.button
                  whileHover={{ scale: loading ? 1 : 1.01 }}
                  whileTap={{ scale: loading ? 1 : 0.98 }}
                  type="submit"
                  disabled={loading}
                  className="group relative flex h-14 w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 font-semibold shadow-xl shadow-violet-600/20 transition hover:shadow-violet-600/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="absolute inset-0 bg-white/10 opacity-0 transition group-hover:opacity-100" />

                  {loading ? (
                    <div className="relative flex items-center gap-3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      <span>Signing in...</span>
                    </div>
                  ) : (
                    <span className="relative flex items-center gap-2">
                      Sign in
                      <ArrowRight
                        size={18}
                        className="transition-transform group-hover:translate-x-1"
                      />
                    </span>
                  )}
                </motion.button>
              </form>

              {/* Divider */}
              <div className="my-7 flex items-center gap-4">
                <div className="h-px flex-1 bg-white/[0.08]" />
                <span className="text-[11px] uppercase tracking-widest text-white/25">
                  The Ant Media
                </span>
                <div className="h-px flex-1 bg-white/[0.08]" />
              </div>

              {/* Security indicators */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10">
                    <ShieldCheck
                      size={16}
                      className="text-emerald-400"
                    />
                  </div>

                  <p className="text-xs font-medium text-white/70">
                    Secure Access
                  </p>

                  <p className="mt-0.5 text-[10px] text-white/30">
                    Firebase Authentication
                  </p>
                </div>

                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/10">
                    <Zap
                      size={16}
                      className="text-violet-400"
                    />
                  </div>

                  <p className="text-xs font-medium text-white/70">
                    Workspace Ready
                  </p>

                  <p className="mt-0.5 text-[10px] text-white/30">
                    Fast &amp; reliable
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: 0.6,
              delay: 0.5,
            }}
            className="mt-6 text-center"
          >
            <p className="text-xs text-white/25">
              © 2026 The Ant Media. Internal Management System.
            </p>
          </motion.div>
        </div>
      </div>
    </main>
  );
}