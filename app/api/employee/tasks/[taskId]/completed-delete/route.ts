import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const noStore = { "Cache-Control": "no-store, private" };
type Context = { params: Promise<{ taskId: string }> };

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: noStore });
}

export async function POST(request: NextRequest, context: Context) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return errorResponse("Employee sign-in is required.", 401);

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token, true);
    uid = decoded.uid;
  } catch {
    return errorResponse("Your session has expired. Please sign in again.", 401);
  }

  try {
    const profileSnapshot = await adminDb.collection("users").doc(uid).get();
    const profile = profileSnapshot.data();
    if (!profileSnapshot.exists || profile?.active !== true || !["employee", "intern"].includes(String(profile.role || ""))) {
      return errorResponse("Employee access is required.", 403);
    }

    const { taskId } = await context.params;
    if (!taskId || taskId.includes("/")) return errorResponse("A valid task ID is required.", 400);

    const taskRef = adminDb.collection("tasks").doc(taskId);
    const recycleRef = adminDb.collection("recycleBinTasks").doc();
    const outcome = await adminDb.runTransaction(async (transaction) => {
      const taskSnapshot = await transaction.get(taskRef);
      if (!taskSnapshot.exists) return "not_found" as const;
      const task = taskSnapshot.data()!;
      const status = String(task.status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
      if (status !== "completed") return "not_completed" as const;

      const isAssigned = task.assignedTo === uid || task.assignedToId === uid;
      const isTeamMember = Array.isArray(task.teamMemberIds) && task.teamMemberIds.includes(uid);
      const isListedTeamMember = Array.isArray(task.teamMembers) && task.teamMembers.some((member: { id?: string }) => member?.id === uid);
      if (!isAssigned && !isTeamMember && !isListedTeamMember) return "forbidden" as const;

      const employeeName = String(profile.name || profile.email || "Employee");
      transaction.set(recycleRef, {
        ...task,
        originalTaskId: taskId,
        deletedAt: FieldValue.serverTimestamp(),
        deletedBy: uid,
        deletedByName: employeeName,
        ownerUserId: uid,
        ownerRole: profile.role,
        deletionSource: "employee",
        recycleBinType: "employee",
        deletionReason: "Employee removed completed task from history",
        permanentlyDeleted: false,
      });
      transaction.delete(taskRef);
      return "deleted" as const;
    });

    if (outcome === "not_found") return errorResponse("Task not found.", 404);
    if (outcome === "not_completed") return errorResponse("Only completed tasks can be moved to the Recycle Bin.", 409);
    if (outcome === "forbidden") return errorResponse("You can only remove tasks assigned to you.", 403);
    return Response.json({ success: true, recycleBinId: recycleRef.id }, { headers: noStore });
  } catch (error) {
    console.error("Completed employee task deletion failed:", (error as { code?: string })?.code || "unknown error");
    return errorResponse("Unable to move the completed task to your Recycle Bin.", 503);
  }
}
