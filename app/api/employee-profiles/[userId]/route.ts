import type { NextRequest } from "next/server";
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { requireFounder } from "@/lib/client-api-auth";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { decryptSecret, encryptSecret } from "@/lib/client-credentials";

const noStore = { "Cache-Control": "no-store, private" };
type Context = { params: Promise<{ userId: string }> };
type Cipher = { ciphertext: string; iv: string; tag: string };
type PrivateFields = Record<string, Cipher>;

function decryptFields(fields: PrivateFields = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      decryptSecret(value.ciphertext, value.iv, value.tag),
    ]),
  ) as Record<string, string>;
}

function mask(value: string, prefix: string) {
  return value ? `${prefix} ${value.slice(-4)}` : "Not set";
}

function secureUrl(value: string) {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function dateString(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    try { return value.toDate().toISOString().slice(0, 10); } catch { return ""; }
  }
  return "";
}

function responseProfile(user: DocumentData, fields: Record<string, string>, reveal: boolean) {
  const account = fields.bankAccountNumber || "";
  const aadhaar = fields.aadhaarNumber || "";
  return {
    user: {
      userId: String(user.userId || ""),
      fullName: String(user.name || ""),
      email: String(user.email || ""),
      role: String(user.role || "employee"),
      position: String(user.position || user.role || "employee"),
      department: String(user.department || ""),
      active: user.active === true,
      joiningDate: dateString(user.joiningDate) || dateString(user.createdAt),
    },
    profile: {
      photoUrl: secureUrl(fields.photoUrl || ""),
      mobileNumber: fields.mobileNumber || "",
      residentialAddress: fields.residentialAddress || "",
      emergencyContactName: fields.emergencyContactName || "",
      emergencyContactNumber: fields.emergencyContactNumber || "",
      aadhaarNumber: reveal ? aadhaar : undefined,
      aadhaarMasked: mask(aadhaar, "XXXX XXXX"),
      bankDetails: {
        accountHolderName: fields.bankAccountHolderName || "",
        bankName: fields.bankName || "",
        accountNumber: reveal ? account : undefined,
        accountNumberMasked: mask(account, "XXXX XXXX"),
        ifscCode: fields.bankIfscCode || "",
      },
      resumeUrl: secureUrl(fields.resumeUrl || ""),
    },
  };
}

async function getMember(userId: string) {
  const userRef = adminDb.collection("users").doc(userId);
  const snapshot = await userRef.get();
  if (!snapshot.exists || !["employee", "intern"].includes(String(snapshot.data()?.role))) return null;
  return { userRef, data: snapshot.data()! };
}

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireFounder(request);
  if ("error" in auth) return auth.error;
  try {
    const { userId } = await context.params;
    const member = await getMember(userId);
    if (!member) return Response.json({ error: "Employee not found" }, { status: 404, headers: noStore });
    const profile = await adminDb.collection("employeeProfiles").doc(userId).get();
    const fields = profile.exists ? decryptFields(profile.data()?.encryptedFields) : {};
    return Response.json(responseProfile({ ...member.data, userId }, fields, false), { headers: noStore });
  } catch {
    return Response.json({ error: "Unable to load employee profile" }, { status: 503, headers: noStore });
  }
}

export async function POST(request: NextRequest, context: Context) {
  const auth = await requireFounder(request);
  if ("error" in auth) return auth.error;
  try {
    const { userId } = await context.params;
    const member = await getMember(userId);
    if (!member) return Response.json({ error: "Employee not found" }, { status: 404, headers: noStore });
    const body = await request.json();
    if (body.action !== "reveal") return Response.json({ error: "Unsupported action" }, { status: 400, headers: noStore });
    const profile = await adminDb.collection("employeeProfiles").doc(userId).get();
    const fields = profile.exists ? decryptFields(profile.data()?.encryptedFields) : {};
    return Response.json(responseProfile({ ...member.data, userId }, fields, true), { headers: noStore });
  } catch {
    return Response.json({ error: "Unable to reveal employee profile fields" }, { status: 503, headers: noStore });
  }
}

export async function PUT(request: NextRequest, context: Context) {
  const auth = await requireFounder(request);
  if ("error" in auth) return auth.error;
  try {
    const { userId } = await context.params;
    const member = await getMember(userId);
    if (!member) return Response.json({ error: "Employee not found" }, { status: 404, headers: noStore });
    const body = await request.json();
    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "");
    const department = String(body.department || "").trim();
    if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["employee", "intern"].includes(role) || !department || typeof body.active !== "boolean") {
      return Response.json({ error: "Name, valid email, role, department and status are required" }, { status: 400, headers: noStore });
    }
    const bank = body.bankDetails && typeof body.bankDetails === "object" ? body.bankDetails : {};
    const aadhaarNumber = String(body.aadhaarNumber || "").replace(/\D/g, "");
    if (aadhaarNumber && aadhaarNumber.length !== 12) return Response.json({ error: "Aadhaar number must contain 12 digits" }, { status: 400, headers: noStore });
    const photoUrlInput = String(body.photoUrl || "").trim();
    const resumeUrlInput = String(body.resumeUrl || "").trim();
    if ((photoUrlInput && !secureUrl(photoUrlInput)) || (resumeUrlInput && !secureUrl(resumeUrlInput))) return Response.json({ error: "Photo and resume links must use HTTPS" }, { status: 400, headers: noStore });
    const values: Record<string, string> = {
      photoUrl: secureUrl(photoUrlInput),
      mobileNumber: String(body.mobileNumber || "").trim(),
      residentialAddress: String(body.residentialAddress || "").trim(),
      emergencyContactName: String(body.emergencyContactName || "").trim(),
      emergencyContactNumber: String(body.emergencyContactNumber || "").trim(),
      aadhaarNumber,
      bankAccountHolderName: String(bank.accountHolderName || "").trim(),
      bankName: String(bank.bankName || "").trim(),
      bankAccountNumber: String(bank.accountNumber || "").replace(/\s+/g, ""),
      bankIfscCode: String(bank.ifscCode || "").trim().toUpperCase(),
      resumeUrl: secureUrl(resumeUrlInput),
    };
    const encryptedFields = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, encryptSecret(value)]));
    const authUser = await adminAuth.getUser(userId);
    const oldEmail = String(authUser.email || member.data.email || "").toLowerCase();
    const emailChanged = oldEmail !== email;
    if (emailChanged) await adminAuth.updateUser(userId, { email, emailVerified: false });
    try {
      const batch = adminDb.batch();
      batch.update(member.userRef, { name: fullName, email, role, department, active: body.active, updatedAt: FieldValue.serverTimestamp() });
      batch.set(adminDb.collection("employeeProfiles").doc(userId), {
        userId,
        encryptedFields,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      });
      await batch.commit();
    } catch (error) {
      if (emailChanged && oldEmail) await adminAuth.updateUser(userId, { email: oldEmail, emailVerified: authUser.emailVerified }).catch(() => undefined);
      throw error;
    }
    return Response.json({ success: true }, { headers: noStore });
  } catch {
    return Response.json({ error: "Unable to update employee profile. Check the email and server encryption configuration." }, { status: 503, headers: noStore });
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requireFounder(request);
  if ("error" in auth) return auth.error;
  try {
    const { userId } = await context.params;
    await adminDb.collection("employeeProfiles").doc(userId).delete();
    return Response.json({ success: true }, { headers: noStore });
  } catch {
    return Response.json({ error: "Unable to remove employee private profile" }, { status: 503, headers: noStore });
  }
}
