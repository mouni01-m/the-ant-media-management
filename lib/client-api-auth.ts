import type { NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function requireFounder(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!token)
    return {
      error: Response.json(
        { error: "Your session has expired. Please sign in again." },
        { status: 401 },
      ),
    };
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch (error) {
    const code = (error as { code?: string })?.code || "";
    if (
      code === "auth/argument-error" ||
      code === "auth/invalid-id-token" ||
      code === "auth/id-token-expired" ||
      code === "auth/id-token-revoked" ||
      code === "auth/user-disabled" ||
      code === "auth/user-not-found"
    ) {
      return {
        error: Response.json(
          { error: "Your session has expired. Please sign in again." },
          { status: 401 },
        ),
      };
    }
    console.error("[Firebase Admin] Founder token verification failed", {
      code: code || "unknown error",
      error: error instanceof Error ? error.message : String(error),
    });
    if (code.startsWith("FIREBASE_ADMIN_CONFIG_")) {
      const message = code === "FIREBASE_ADMIN_CONFIG_MISSING"
        ? "Server Firebase configuration is incomplete."
        : "Server Firebase configuration is invalid.";
      return {
        error: Response.json(
          { error: code, message },
          { status: 503 },
        ),
      };
    }
    return {
      error: Response.json(
        { error: "Founder authentication is temporarily unavailable. Please try again.", code: "FIREBASE_AUTH_UNAVAILABLE" },
        { status: 503 },
      ),
    };
  }

  let profile;
  try {
    profile = await adminDb.collection("users").doc(decoded.uid).get();
  } catch (error) {
    console.error("[Firebase Admin] Founder profile lookup failed", {
      code: (error as { code?: string })?.code || "unknown error",
      error: error instanceof Error ? error.message : String(error),
    });
    const code = (error as { code?: string })?.code || "";
    if (code.startsWith("FIREBASE_ADMIN_CONFIG_")) {
      return {
        error: Response.json(
          {
            error: code,
            message: code === "FIREBASE_ADMIN_CONFIG_MISSING"
              ? "Server Firebase configuration is incomplete."
              : "Server Firebase configuration is invalid.",
          },
          { status: 503 },
        ),
      };
    }
    return {
      error: Response.json(
        { error: "Founder access could not be verified because the server could not read the Founder profile.", code: "FIRESTORE_PROFILE_UNAVAILABLE" },
        { status: 503 },
      ),
    };
  }
  if (
    !profile.exists ||
    profile.data()?.role !== "founder" ||
    profile.data()?.active !== true
  ) {
    return {
      error: Response.json(
        { error: "Founder access required" },
        { status: 403 },
      ),
    };
  }
  return { uid: decoded.uid };
}
