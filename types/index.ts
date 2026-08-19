export type UserRole = "guest" | "student" | "admin";

export type AppSubscriptionTier = "none" | "standard" | "premium" | "vip";
export type AppSubscriptionVariant =
  | "individual"
  | "duo_owner"
  | "duo_member";

export type LessonPayType = "abonement" | "one_time";

export type CatLevel = "beginner" | "basic" | "pro" | "star";

export interface StudentProfile {
  [key: string]: unknown;
  id: string;
  email: string | null;
  full_name: string | null;
  role: Exclude<UserRole, "guest">;
  app_sub_tier: AppSubscriptionTier;
  app_sub_variant: AppSubscriptionVariant;
  cat_level: CatLevel;
  is_active_student: boolean;
  lesson_pay_type: LessonPayType;
  custom_lesson_price: number;
  custom_abonement_price: number;
  lessons_balance: number;
  debt_amount: number;
}

export type LessonStatus = "open" | "scheduled" | "completed" | "cancelled";
export type RescheduleRequest = "none" | "pending" | "approved" | "rejected";

export interface Lesson {
  [key: string]: unknown;
  id: string;
  student_id: string | null;
  datetime: string;
  status: LessonStatus;
  reschedule_request: RescheduleRequest;
  series_id?: string | null;
  is_recurring?: boolean;
  preferred_reschedule_at?: string | null;
  reschedule_note?: string | null;
}

export interface Exercise {
  [key: string]: unknown;
  id: string;
  title: string;
  description: string;
  media_url: string;
  type: "audio" | "video";
  min_tier_required: AppSubscriptionTier;
  min_cat_level: CatLevel;
  active_students_only: boolean;
  audience_mode: "rules" | "selected" | "rules_or_selected";
  is_published: boolean;
  storage_path: string | null;
  created_at: string;
  created_by: string | null;
}

export interface AppNotification {
  [key: string]: unknown;
  id: string;
  recipient_id: string | null;
  recipient_role: "student" | "admin";
  message: string;
  is_read: boolean;
  created_at: string;
  title: string | null;
  kind: "general" | "chat" | "lesson" | "payment" | "content";
  action_url: string | null;
  read_at: string | null;
  push_sent_at: string | null;
  email_fallback_at: string | null;
  email_sent_at: string | null;
}

export interface StudentFolder {
  [key: string]: unknown;
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sort_order: number;
  created_at: string;
}

export interface StudentFolderMember {
  [key: string]: unknown;
  folder_id: string;
  student_id: string;
  created_at: string;
}

export interface DuoSubscription {
  [key: string]: unknown;
  id: string;
  owner_id: string;
  partner_id: string | null;
  tier: Exclude<AppSubscriptionTier, "none">;
  status: "awaiting_partner" | "active" | "cancelled";
  linked_at: string | null;
  created_at: string;
  cancelled_at: string | null;
}

export interface StudentNote {
  [key: string]: unknown;
  id: string;
  student_id: string;
  homework: string;
  teacher_comment: string;
  updated_by: string | null;
  updated_at: string;
}

export interface SubscriptionProduct {
  [key: string]: unknown;
  code: string;
  title: string;
  tier: Exclude<AppSubscriptionTier, "none">;
  variant: "individual" | "duo_owner";
  price_rub: number;
  is_active: boolean;
  features: string[];
  created_at: string;
}

export interface PaymentTransaction {
  [key: string]: unknown;
  id: string;
  student_id: string;
  product_code: string | null;
  purpose: "lesson_debt" | "lesson_package" | "app_subscription";
  amount_rub: number;
  provider: string;
  status: "pending" | "confirmed" | "failed" | "cancelled" | "refunded";
  external_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  confirmed_at: string | null;
}

export interface ChatMessage {
  [key: string]: unknown;
  id: string;
  student_id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  created_at: string;
  message_type: "text" | "voice" | "image" | "sticker" | "video" | "announcement" | "vocal_report";
  media_path: string | null;
  media_mime: string | null;
  media_duration_sec: number | null;
  edited_at?: string | null;
  deleted_at?: string | null;
}

export interface GroupChat {
  [key: string]: unknown;
  id: string;
  title: string;
  created_by: string;
  created_at: string;
}

export interface GroupChatMember {
  [key: string]: unknown;
  group_id: string;
  student_id: string;
  created_at: string;
}

export interface GroupChatMessage {
  [key: string]: unknown;
  id: string;
  group_id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  created_at: string;
  message_type: "text" | "voice" | "image" | "sticker" | "video" | "announcement" | "vocal_report";
  media_path: string | null;
  media_mime: string | null;
  media_duration_sec: number | null;
  edited_at?: string | null;
  deleted_at?: string | null;
}

export interface LessonHomework {
  [key: string]: unknown;
  id: string;
  lesson_id: string | null;
  student_id: string;
  lesson_datetime: string | null;
  homework: string;
  teacher_comment: string;
  created_by: string | null;
  created_at: string;
}

export interface PushSubscriptionRecord {
  [key: string]: unknown;
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export type StudentAudioSource =
  | "remover_minus"
  | "remover_vocal"
  | "mixer"
  | "pitchshift";

export interface StudentAudioTrack {
  [key: string]: unknown;
  id: string;
  user_id: string;
  source: StudentAudioSource;
  title: string;
  duration_sec: number;
  storage_path: string;
  mime: string;
  size_bytes: number;
  created_at: string;
}

export interface VocalTestResult {
  [key: string]: unknown;
  id: string;
  user_id: string;
  mode: "note" | "scale";
  target_label: string;
  duration_sec: number;
  overall_score: number;
  pitch_accuracy: number;
  tone_stability: number;
  breath_control: number;
  too_quiet: boolean;
  payload: Record<string, unknown>;
  created_at: string;
}

export type AiToolId = "tuner" | "remover" | "timbre" | "mixer" | "pitchshift";

export interface AiToolAccess {
  [key: string]: unknown;
  tool_id: AiToolId;
  min_tier: AppSubscriptionTier;
  enabled: boolean;
  title: string;
  updated_at: string;
  updated_by: string | null;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: StudentProfile;
        Insert: Omit<StudentProfile, "id"> & { id: string };
        Update: Partial<Omit<StudentProfile, "id">>;
        Relationships: [];
      };
      lessons: {
        Row: Lesson;
        Insert: {
          id?: string;
          student_id?: string | null;
          datetime: string;
          status?: LessonStatus;
          reschedule_request?: RescheduleRequest;
          series_id?: string | null;
          is_recurring?: boolean;
          preferred_reschedule_at?: string | null;
          reschedule_note?: string | null;
        };
        Update: Partial<Omit<Lesson, "id">>;
        Relationships: [];
      };
      exercises: {
        Row: Exercise;
        Insert: Omit<Exercise, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Exercise, "id">>;
        Relationships: [];
      };
      notifications: {
        Row: AppNotification;
        Insert: {
          id?: string;
          recipient_id?: string | null;
          recipient_role: "student" | "admin";
          message: string;
          is_read?: boolean;
          created_at?: string;
          title?: string | null;
          kind?: AppNotification["kind"];
          action_url?: string | null;
          read_at?: string | null;
          push_sent_at?: string | null;
          email_fallback_at?: string | null;
          email_sent_at?: string | null;
        };
        Update: Partial<
          Pick<
            AppNotification,
            "is_read" | "read_at" | "push_sent_at" | "email_sent_at"
          >
        >;
        Relationships: [];
      };
      student_folders: {
        Row: StudentFolder;
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          color?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Omit<StudentFolder, "id" | "created_at">>;
        Relationships: [];
      };
      student_folder_members: {
        Row: StudentFolderMember;
        Insert: {
          folder_id: string;
          student_id: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      duo_subscriptions: {
        Row: DuoSubscription;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      student_notes: {
        Row: StudentNote;
        Insert: {
          id?: string;
          student_id: string;
          homework?: string;
          teacher_comment?: string;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: Partial<
          Pick<
            StudentNote,
            "homework" | "teacher_comment" | "updated_by" | "updated_at"
          >
        >;
        Relationships: [];
      };
      subscription_products: {
        Row: SubscriptionProduct;
        Insert: SubscriptionProduct;
        Update: Partial<Omit<SubscriptionProduct, "code" | "created_at">>;
        Relationships: [];
      };
      payment_transactions: {
        Row: PaymentTransaction;
        Insert: Record<string, never>;
        Update: Partial<
          Pick<PaymentTransaction, "status" | "external_id" | "confirmed_at">
        >;
        Relationships: [];
      };
      exercise_folder_access: {
        Row: {
          exercise_id: string;
          folder_id: string;
        };
        Insert: {
          exercise_id: string;
          folder_id: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      exercise_student_access: {
        Row: {
          exercise_id: string;
          student_id: string;
          effect: "allow" | "deny";
        };
        Insert: {
          exercise_id: string;
          student_id: string;
          effect?: "allow" | "deny";
        };
        Update: Partial<Pick<{ effect: "allow" | "deny" }, "effect">>;
        Relationships: [];
      };
      chat_messages: {
        Row: ChatMessage;
        Insert: {
          id?: string;
          student_id: string;
          sender_id: string;
          sender_name: string;
          message: string;
          created_at?: string;
          message_type?: ChatMessage["message_type"];
          media_path?: string | null;
          media_mime?: string | null;
          media_duration_sec?: number | null;
          edited_at?: string | null;
          deleted_at?: string | null;
        };
        Update: Partial<
          Pick<
            ChatMessage,
            | "message"
            | "edited_at"
            | "deleted_at"
            | "message_type"
            | "media_path"
            | "media_mime"
            | "media_duration_sec"
          >
        >;
        Relationships: [];
      };
      group_chats: {
        Row: GroupChat;
        Insert: {
          id?: string;
          title: string;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Pick<GroupChat, "title">>;
        Relationships: [];
      };
      group_chat_members: {
        Row: GroupChatMember;
        Insert: {
          group_id: string;
          student_id: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      group_chat_messages: {
        Row: GroupChatMessage;
        Insert: {
          id?: string;
          group_id: string;
          sender_id: string;
          sender_name: string;
          message: string;
          created_at?: string;
          message_type?: GroupChatMessage["message_type"];
          media_path?: string | null;
          media_mime?: string | null;
          media_duration_sec?: number | null;
          edited_at?: string | null;
          deleted_at?: string | null;
        };
        Update: Partial<
          Pick<
            GroupChatMessage,
            | "message"
            | "edited_at"
            | "deleted_at"
            | "message_type"
            | "media_path"
            | "media_mime"
            | "media_duration_sec"
          >
        >;
        Relationships: [];
      };
      lesson_homework: {
        Row: LessonHomework;
        Insert: {
          id?: string;
          lesson_id?: string | null;
          student_id: string;
          lesson_datetime?: string | null;
          homework: string;
          teacher_comment?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Pick<LessonHomework, "homework" | "teacher_comment" | "lesson_id">
        >;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRecord;
        Insert: {
          endpoint: string;
          user_id: string;
          p256dh: string;
          auth: string;
          created_at?: string;
        };
        Update: Partial<Pick<PushSubscriptionRecord, "p256dh" | "auth">>;
        Relationships: [];
      };
      ai_tool_access: {
        Row: AiToolAccess;
        Insert: {
          tool_id: AiToolId;
          min_tier?: AppSubscriptionTier;
          enabled?: boolean;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: Partial<
          Pick<AiToolAccess, "min_tier" | "enabled" | "title" | "updated_by">
        >;
        Relationships: [];
      };
      student_audio_tracks: {
        Row: StudentAudioTrack;
        Insert: {
          id?: string;
          user_id: string;
          source: StudentAudioSource;
          title: string;
          duration_sec: number;
          storage_path: string;
          mime: string;
          size_bytes: number;
          created_at?: string;
        };
        Update: Partial<Pick<StudentAudioTrack, "title">>;
        Relationships: [];
      };
      vocal_test_results: {
        Row: VocalTestResult;
        Insert: {
          id?: string;
          user_id: string;
          mode: VocalTestResult["mode"];
          target_label: string;
          duration_sec: number;
          overall_score: number;
          pitch_accuracy: number;
          tone_stability: number;
          breath_control: number;
          too_quiet?: boolean;
          payload?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<Pick<VocalTestResult, "payload">>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      request_lesson_reschedule: {
        Args: {
          lesson_id: string;
          preferred_at?: string | null;
          student_note?: string | null;
        };
        Returns: undefined;
      };
      complete_lesson: {
        Args: { lesson_id: string };
        Returns: undefined;
      };
      book_lesson_slot: {
        Args: { slot_id: string };
        Returns: undefined;
      };
      settle_student_debt: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      upgrade_app_subscription: {
        Args: { new_tier: "standard" | "premium" | "vip" };
        Returns: undefined;
      };
      register_push_subscription: {
        Args: {
          subscription_endpoint: string;
          subscription_p256dh: string;
          subscription_auth: string;
        };
        Returns: undefined;
      };
      upgrade_duo_subscription: {
        Args: { new_tier: "standard" | "premium" | "vip" };
        Returns: undefined;
      };
      link_duo_partner: {
        Args: { partner_email: string };
        Returns: undefined;
      };
      admin_change_duo_partner: {
        Args: { duo_owner_id: string; new_partner_email: string };
        Returns: undefined;
      };
      admin_resolve_reschedule: {
        Args: {
          lesson_id: string;
          approve: boolean;
          new_datetime?: string | null;
        };
        Returns: undefined;
      };
      admin_cancel_lesson: {
        Args: { lesson_id: string };
        Returns: undefined;
      };
      admin_assign_lesson: {
        Args: { lesson_id: string; target_student_id: string };
        Returns: undefined;
      };
      complete_sandbox_payment: {
        Args: {
          payment_purpose: "lesson_debt" | "app_subscription";
          amount_rub: number;
          new_tier?: "standard" | "premium" | "vip" | null;
          is_duo?: boolean;
        };
        Returns: string;
      };
      create_group_chat: {
        Args: { chat_title: string; student_ids: string[] };
        Returns: string;
      };
      admin_assign_homework: {
        Args: {
          target_student_id: string;
          homework_text: string;
          teacher_comment_text?: string;
          target_lesson_id?: string | null;
        };
        Returns: string;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
