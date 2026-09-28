import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireFounder } from "@/lib/client-api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { encryptCredential } from "@/lib/client-credentials";

const noStore = { "Cache-Control": "no-store, private" };

export async function GET(request: NextRequest) {
  const auth = await requireFounder(request);
  if ("error" in auth) return auth.error;
  const clientId = request.nextUrl.searchParams.get("clientId");
  try {
    if (clientId) {
      const client = await adminDb.collection("clients").doc(clientId).get();
      if (!client.exists || client.data()?.deletedAt)
        return Response.json(
          { error: "Client not found" },
          { status: 404, headers: noStore },
        );
    }
    const accounts = adminDb.collection("clientAccounts");
    const snapshot = clientId
      ? await accounts.where("clientId", "==", clientId).get()
      : await accounts.get();
    const result = snapshot.docs.map((item) => {
      const data = item.data();
      if (!clientId) {
        return {
          id: item.id,
          clientId: data.clientId,
          platform: data.platform,
          accountName: data.accountName,
          username: data.username,
        };
      }
      delete data.passwordCiphertext;
      delete data.passwordIv;
      delete data.passwordTag;
      return { id: item.id, ...data };
    });
    return Response.json(result, { headers: noStore });
  } catch {
    return Response.json(
      { error: "Unable to load client accounts" },
      { status: 500, headers: noStore },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFounder(request);
  if ("error" in auth) return auth.error;
  try {
    const body = await request.json();
    if (
      typeof body.clientId !== "string" ||
      !body.clientId ||
      typeof body.platform !== "string" ||
      !body.platform.trim()
    )
      return Response.json(
        { error: "Client and platform are required" },
        { status: 400 },
      );
    const client = await adminDb.collection("clients").doc(body.clientId).get();
    if (!client.exists || client.data()?.deletedAt)
      return Response.json({ error: "Client not found" }, { status: 404 });
    const password = typeof body.password === "string" ? body.password : "";
    const encrypted = password ? encryptCredential(password) : {};
    const ref = adminDb.collection("clientAccounts").doc();
    await ref.set({
      clientId: body.clientId,
      platform: body.platform.trim(),
      accountName: String(body.accountName || "").trim(),
      username: String(body.username || "").trim(),
      loginContact: String(body.loginContact || "").trim(),
      profileUrl: String(body.profileUrl || "").trim(),
      notes: String(body.notes || "").trim(),
      accountType: String(body.accountType || "").trim(),
      recoveryEmail: String(body.recoveryEmail || "").trim(),
      recoveryPhone: String(body.recoveryPhone || "").trim(),
      twoFactorEnabled: body.twoFactorEnabled === true,
      twoFactorNotes: String(body.twoFactorNotes || "").trim(),
      ...encrypted,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: auth.uid,
    });
    return Response.json({ id: ref.id }, { status: 201, headers: noStore });
  } catch (error) {
    const message =
      error instanceof Error &&
      error.message.includes("CLIENT_CREDENTIALS_ENCRYPTION_KEY")
        ? "Credential encryption is not configured on the server"
        : "Unable to save client account";
    return Response.json({ error: message }, { status: 503, headers: noStore });
  }
}
