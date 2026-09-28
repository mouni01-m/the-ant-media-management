import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireFounder } from "@/lib/client-api-auth";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, private" };
type Kind = "role" | "department";
const collectionFor = (kind: Kind) => kind === "role" ? "teamRoles" : "teamDepartments";
const keyId = (kind: Kind, name: string) => `${kind}_${encodeURIComponent(name.trim().toLocaleLowerCase())}`;
const clean = (value: unknown) => String(value ?? "").trim();
function kindOf(value: unknown): Kind | null { return value === "role" || value === "department" ? value : null; }

async function ensureEntry(kind: Kind, name: string) {
  const normalized = name.toLocaleLowerCase();
  const lockRef = adminDb.collection("teamCatalogKeys").doc(keyId(kind, name));
  const catalogRef = adminDb.collection(collectionFor(kind)).doc();
  await adminDb.runTransaction(async (transaction) => {
    const lock = await transaction.get(lockRef);
    if (lock.exists) return;
    transaction.create(catalogRef, {
      name, nameKey: normalized, description: "", isActive: true,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(lockRef, { itemId: catalogRef.id, kind });
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireFounder(request);
  if ("error" in auth) return auth.error;
  try {
    const users = await adminDb.collection("users").get();
    const roles = new Set(["Employee", "Intern"]);
    const departments = new Set<string>();
    users.docs.forEach((user) => {
      const data = user.data();
      if (data.role && data.role !== "founder") roles.add(clean(data.position || data.role));
      if (clean(data.department)) departments.add(clean(data.department));
    });
    await Promise.all([
      ...Array.from(roles, (name) => ensureEntry("role", name)),
      ...Array.from(departments, (name) => ensureEntry("department", name)),
    ]);
    const [roleSnapshot, departmentSnapshot] = await Promise.all([
      adminDb.collection("teamRoles").get(), adminDb.collection("teamDepartments").get(),
    ]);
    const map = (snapshot: FirebaseFirestore.QuerySnapshot) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return Response.json({ roles: map(roleSnapshot), departments: map(departmentSnapshot) }, { headers: noStore });
  } catch (error) {
    console.error("Unable to load Founder team catalog:", (error as { code?: string })?.code || "unknown");
    return Response.json({ error: "Unable to load roles and departments." }, { status: 503, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFounder(request);
  if ("error" in auth) return auth.error;
  let operationKind: Kind | null = null;
  try {
    const body = await request.json();
    const kind = kindOf(body.kind);
    operationKind = kind;
    const action = String(body.action || "");
    const name = clean(body.name);
    const description = clean(body.description);
    if (!kind || !["create", "update", "deactivate", "activate"].includes(action)) return Response.json({ error: "Invalid catalog operation." }, { status: 400, headers: noStore });
    const targetCollection = adminDb.collection(collectionFor(kind));
    const itemId = clean(body.id);
    if (action === "create") {
      if (!name || name.length > 80) return Response.json({ error: "Enter a name up to 80 characters." }, { status: 400, headers: noStore });
      const keyRef = adminDb.collection("teamCatalogKeys").doc(keyId(kind, name));
      const itemRef = targetCollection.doc();
      await adminDb.runTransaction(async (transaction) => {
        if ((await transaction.get(keyRef)).exists) throw new Error("DUPLICATE_NAME");
        transaction.create(itemRef, { name, nameKey: name.toLocaleLowerCase(), description, isActive: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        transaction.create(keyRef, { itemId: itemRef.id, kind });
      });
      return Response.json({ id: itemRef.id, name, description, isActive: true }, { status: 201, headers: noStore });
    }
    if (!itemId) return Response.json({ error: "Catalog item ID is required." }, { status: 400, headers: noStore });
    const itemRef = targetCollection.doc(itemId);
    const item = await itemRef.get();
    if (!item.exists) return Response.json({ error: "Catalog item not found." }, { status: 404, headers: noStore });
    const previousName = clean(item.data()?.name);
    if (action === "activate" || action === "deactivate") {
      await itemRef.update({ isActive: action === "activate", updatedAt: FieldValue.serverTimestamp() });
      return Response.json({ success: true }, { headers: noStore });
    }
    if (!name || name.length > 80) return Response.json({ error: "Enter a name up to 80 characters." }, { status: 400, headers: noStore });
    const previousKey = adminDb.collection("teamCatalogKeys").doc(keyId(kind, previousName));
    const nextKey = adminDb.collection("teamCatalogKeys").doc(keyId(kind, name));
    await adminDb.runTransaction(async (transaction) => {
      if (previousName.toLocaleLowerCase() !== name.toLocaleLowerCase()) {
        if ((await transaction.get(nextKey)).exists) throw new Error("DUPLICATE_NAME");
        transaction.create(nextKey, { itemId, kind });
        transaction.delete(previousKey);
      }
      transaction.update(itemRef, { name, nameKey: name.toLocaleLowerCase(), description, updatedAt: FieldValue.serverTimestamp() });
    });
    if (previousName !== name) {
      const field = kind === "role" ? "position" : "department";
      const matches = await adminDb.collection("users").where(field, "==", previousName).get();
      const batch = adminDb.batch();
      matches.docs.forEach((user) => batch.update(user.ref, { [field]: name, updatedAt: FieldValue.serverTimestamp() }));
      if (kind === "role" && ["employee", "intern"].includes(previousName.toLowerCase())) {
        const legacy = await adminDb.collection("users").where("role", "==", previousName.toLowerCase()).get();
        legacy.docs.filter((user) => !matches.docs.some((match) => match.id === user.id)).forEach((user) => batch.update(user.ref, { position: name, updatedAt: FieldValue.serverTimestamp() }));
        if (!matches.empty || !legacy.empty) await batch.commit();
      } else if (!matches.empty) await batch.commit();
    }
    return Response.json({ success: true }, { headers: noStore });
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_NAME") return Response.json({ error: `${operationKind === "role" ? "Role" : "Department"} already exists.` }, { status: 409, headers: noStore });
    console.error("Unable to update Founder team catalog:", (error as { code?: string })?.code || "unknown error");
    return Response.json({ error: "Unable to save the role or department." }, { status: 503, headers: noStore });
  }
}
