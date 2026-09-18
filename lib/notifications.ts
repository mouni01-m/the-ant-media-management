import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export type NotificationPriority =
  | "normal"
  | "important"
  | "urgent";

export type NotificationType =
  | "task"
  | "deadline"
  | "review"
  | "approval"
  | "submission"
  | "leave"
  | "calendar"
  | "system"
  | "warning";

type SendNotificationParams = {
  senderId: string;
  senderName: string;

  recipientId: string;
  recipientName: string;

  title: string;
  message: string;

  type?: NotificationType;
  priority?: NotificationPriority;

  link?: string;
  taskId?: string;
};

export async function sendNotification({
  senderId,
  senderName,
  recipientId,
  recipientName,
  title,
  message,
  type = "system",
  priority = "normal",
  link = "",
  taskId = "",
}: SendNotificationParams) {
  if (!senderId) {
    throw new Error("Sender ID is required.");
  }

  if (!recipientId) {
    throw new Error("Recipient ID is required.");
  }

  if (senderId === recipientId) {
    throw new Error(
      "Sender and recipient cannot be the same."
    );
  }

  const notificationsRef =
    collection(db, "notifications");

  /*
   * RECEIVED COPY
   *
   * This is the notification the recipient sees.
   */
  await addDoc(notificationsRef, {
    userId: recipientId,

    senderId,
    senderName,

    recipientId,
    recipientName,

    direction: "received",

    title,
    message,

    type,
    priority,

    read: false,

    link,
    taskId,

    createdAt: serverTimestamp(),
  });

  /*
   * SENT COPY
   *
   * This is the record the sender sees
   * inside the Sent tab.
   */
  await addDoc(notificationsRef, {
    userId: senderId,

    senderId,
    senderName,

    recipientId,
    recipientName,

    direction: "sent",

    title,
    message,

    type,
    priority,

    /*
     * A sent message doesn't need
     * "Mark as read".
     */
    read: true,

    link,
    taskId,

    createdAt: serverTimestamp(),
  });
}