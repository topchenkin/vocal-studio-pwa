export type UserRole = "guest" | "student_free" | "student_premium" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Exclude<UserRole, "guest">;
  subscriptionEnd?: string;
  lessonsRemaining?: number;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export type LessonStatus = "available" | "booked" | "cancelled";

export interface Lesson {
  id: string;
  studentId?: string;
  studentName?: string;
  date: string;
  time: string;
  status: LessonStatus;
  duration: number;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
  messageType?: "text" | "voice" | "image" | "sticker" | "video" | "announcement";
  mediaUrl?: string | null;
  mediaDurationSec?: number | null;
  stickerId?: string | null;
}

export interface Note {
  id: string;
  studentId: string;
  homework: string;
  teacherComment: string;
  updatedAt: string;
}

export interface SubscriptionPlan {
  id: string;
  duration: string;
  months: number;
  price: number;
  pricePerMonth: number;
  badge?: string;
}

export type PaymentMethod = "sbp" | "card";

export type ModalStep = "registration" | "payment" | "processing" | "success";
