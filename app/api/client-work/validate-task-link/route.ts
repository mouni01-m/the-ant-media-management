import type { NextRequest } from "next/server";
import { requireFounder } from "@/lib/client-api-auth";
import { adminDb } from "@/lib/firebase-admin";

const noStore = { "Cache-Control": "no-store, private" };

export async function POST(request: NextRequest) {
  const auth = await requireFounder(request);
  if ("error" in auth) return auth.error;
  try {
    const body = await request.json();
    const clientId = typeof body.clientId === "string" ? body.clientId : "";
    const workId = typeof body.workId === "string" ? body.workId : "";
    if (!clientId) return Response.json({ error: "Select a client first" }, { status: 400, headers: noStore });
    const client = await adminDb.collection("clients").doc(clientId).get();
    if (!client.exists || client.data()?.deletedAt || client.data()?.active === false || client.data()?.accountStatus === "Archived") {
      return Response.json({ error: "Client is unavailable" }, { status: 404, headers: noStore });
    }
    if (workId) {
      const work = await adminDb.collection("clientWork").doc(workId).get();
      if (!work.exists || work.data()?.clientId !== clientId) {
        return Response.json({ error: "Selected work does not belong to this client" }, { status: 400, headers: noStore });
      }
    }
    return Response.json({ valid: true }, { headers: noStore });
  } catch {
    return Response.json({ error: "Unable to validate task client/work link" }, { status: 503, headers: noStore });
  }
}
