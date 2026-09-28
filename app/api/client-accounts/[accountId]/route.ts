import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireFounder } from "@/lib/client-api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { decryptCredential, encryptCredential } from "@/lib/client-credentials";

const noStore = { "Cache-Control": "no-store, private" };
type Context = { params: Promise<{ accountId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const auth = await requireFounder(request);
  if ("error" in auth) return auth.error;
  const { accountId } = await context.params;
  try {
    const snapshot = await adminDb
      .collection("clientAccounts")
      .doc(accountId)
      .get();
    if (!snapshot.exists)
      return Response.json(
        { error: "Account not found" },
        { status: 404, headers: noStore },
      );
    const data = snapshot.data()!;
    const response: Record<string, unknown> = { id: snapshot.id, ...data };
    delete response.passwordCiphertext;
    delete response.passwordIv;
    delete response.passwordTag;
    if (request.nextUrl.searchParams.get("reveal") === "true") {
      response.password = data.passwordCiphertext
        ? decryptCredential(
            data.passwordCiphertext,
            data.passwordIv,
            data.passwordTag,
          )
        : "";
    }
    return Response.json(response, { headers: noStore });
  } catch {
    return Response.json(
      { error: "Unable to load client account" },
      { status: 503, headers: noStore },
    );
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await requireFounder(request);
  if ("error" in auth) return auth.error;
  const { accountId } = await context.params;
  try {
    const ref = adminDb.collection("clientAccounts").doc(accountId);
    const existing = await ref.get();
    if (!existing.exists)
      return Response.json({ error: "Account not found" }, { status: 404 });
    const body = await request.json();
    const patch: Record<string, unknown> = {};
    for (const key of [
      "platform",
      "accountName",
      "username",
      "loginContact",
      "profileUrl",
      "notes",
      "accountType",
      "recoveryEmail",
      "recoveryPhone",
      "twoFactorNotes",
    ])
      if (key in body) patch[key] = String(body[key] || "").trim();
    if ("twoFactorEnabled" in body)
      patch.twoFactorEnabled = body.twoFactorEnabled === true;
    if (typeof body.password === "string" && body.password)
      Object.assign(patch, encryptCredential(body.password));
    patch.updatedAt = FieldValue.serverTimestamp();
    await ref.update(patch);
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    const message =
      error instanceof Error &&
      error.message.includes("CLIENT_CREDENTIALS_ENCRYPTION_KEY")
        ? "Credential encryption is not configured on the server"
        : "Unable to update client account";
    return Response.json({ error: message }, { status: 503, headers: noStore });
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await requireFounder(request);
  if ("error" in auth) return auth.error;
  const { accountId } = await context.params;
  try {
    await adminDb.collection("clientAccounts").doc(accountId).delete();
    return Response.json({ ok: true }, { headers: noStore });
  } catch {
    return Response.json(
      { error: "Unable to delete client account" },
      { status: 503, headers: noStore },
    );
  }
}
