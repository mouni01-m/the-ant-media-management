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
    console.error("Firebase ID token verification is unavailable:", code || "unknown error");
    return {
      error: Response.json(
        { error: "Authentication is temporarily unavailable. Please try again." },
        { status: 503 },
      ),
    };
  }

  let profile;
  try {
    profile = await adminDb.collection("users").doc(decoded.uid).get();
  } catch (error) {
    console.error(
      "Unable to verify Founder profile in Firestore:",
      (error as { code?: string })?.code || "unknown error",
    );
    return {
      error: Response.json(
        { error: "Founder access could not be verified. Check Firebase Admin configuration." },
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
