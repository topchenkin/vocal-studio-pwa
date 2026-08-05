import { NextRequest, NextResponse } from "next/server";
import { sendWebPush } from "@/lib/push";
import { getRequestUser } from "@/lib/server-auth";
import { ADMIN_DISPLAY_NAME, ADMIN_EMAIL } from "@/lib/admin";
import {
  coerceChatMime,
  extensionForChatMedia,
  normalizeMimeType,
} from "@/lib/media-mime";

export const runtime = "nodejs";

type MessageType = "text" | "voice" | "image" | "sticker" | "video";

const MAX_VOICE_SEC = 300;
const MAX_VIDEO_SEC = 60;
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

async function getAccessToken(request: NextRequest) {
  const auth = await getRequestUser(request);
  return auth;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAccessToken(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") ?? "";
    let studentId: string | undefined;
    let groupId: string | undefined;
    let message = "";
    let messageType: MessageType = "text";
    let mediaDurationSec: number | null = null;
    let upload: File | null = null;
    let clientMediaPath: string | null = null;
    let clientMediaMime: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      studentId = String(form.get("studentId") ?? "") || undefined;
      groupId = String(form.get("groupId") ?? "") || undefined;
      message = String(form.get("message") ?? "").trim();
      messageType = (String(form.get("messageType") ?? "text") as MessageType) || "text";
      const durationRaw = form.get("mediaDurationSec");
      mediaDurationSec = durationRaw ? Number(durationRaw) : null;
      const file = form.get("file");
      upload = file instanceof File ? file : null;
      clientMediaPath = String(form.get("mediaPath") ?? "") || null;
      clientMediaMime = String(form.get("mediaMime") ?? "") || null;
    } else {
      const body = (await request.json()) as {
        studentId?: string;
        groupId?: string;
        message?: string;
        messageType?: MessageType;
        mediaDurationSec?: number | null;
        mediaPath?: string | null;
        mediaMime?: string | null;
      };
      studentId = body.studentId;
      groupId = body.groupId;
      message = body.message?.trim() ?? "";
      messageType = body.messageType ?? "text";
      mediaDurationSec = body.mediaDurationSec ?? null;
      clientMediaPath = body.mediaPath ?? null;
      clientMediaMime = body.mediaMime ?? null;
    }

    if ((!studentId && !groupId) || (studentId && groupId)) {
      return NextResponse.json({ error: "Invalid chat target" }, { status: 400 });
    }
    if (!["text", "voice", "image", "sticker", "video"].includes(messageType)) {
      return NextResponse.json({ error: "Invalid message type" }, { status: 400 });
    }
    if (messageType === "text" && (!message || message.length > 2000)) {
      return NextResponse.json({ error: "Invalid chat message" }, { status: 400 });
    }
    if (messageType === "sticker" && !message) {
      return NextResponse.json({ error: "Sticker id required" }, { status: 400 });
    }
    if (messageType === "voice") {
      if (!upload && !clientMediaPath) {
        return NextResponse.json({ error: "Voice file required" }, { status: 400 });
      }
      if (!mediaDurationSec || mediaDurationSec < 1 || mediaDurationSec > MAX_VOICE_SEC) {
        return NextResponse.json(
          { error: "Voice must be between 1 and 300 seconds" },
          { status: 400 }
        );
      }
    }
    if (messageType === "video") {
      if (!upload && !clientMediaPath) {
        return NextResponse.json({ error: "Video file required" }, { status: 400 });
      }
      if (!mediaDurationSec || mediaDurationSec < 1 || mediaDurationSec > MAX_VIDEO_SEC) {
        return NextResponse.json(
          { error: "Video must be between 1 and 60 seconds" },
          { status: 400 }
        );
      }
    }
    if (messageType === "image" && !upload && !clientMediaPath) {
      return NextResponse.json({ error: "Image file required" }, { status: 400 });
    }
    if (upload && upload.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File is too large" }, { status: 400 });
    }

    const isAdmin =
      auth.profile.role === "admin" ||
      auth.user.email?.toLowerCase() === ADMIN_EMAIL;

    const senderName = isAdmin
      ? ADMIN_DISPLAY_NAME
      : auth.profile.full_name || "Ученик";

    let mediaPath: string | null = null;
    let mediaMime: string | null = null;

    if (clientMediaPath) {
      // Client already uploaded to Storage — only accept paths under this user.
      if (!clientMediaPath.startsWith(`${auth.user.id}/`)) {
        return NextResponse.json({ error: "Invalid media path" }, { status: 400 });
      }
      if (!/^[a-zA-Z0-9/_\-.]+$/.test(clientMediaPath)) {
        return NextResponse.json({ error: "Invalid media path" }, { status: 400 });
      }
      mediaPath = clientMediaPath;
      mediaMime = clientMediaMime ? normalizeMimeType(clientMediaMime) : null;
    } else if (upload) {
      const safeMime = coerceChatMime(
        messageType === "voice" || messageType === "video" || messageType === "image"
          ? messageType
          : "image",
        upload.type
      );
      const extension = extensionForChatMedia(
        messageType === "voice" || messageType === "video" || messageType === "image"
          ? messageType
          : "image",
        safeMime,
        upload.name
      );
      mediaPath = `${auth.user.id}/${crypto.randomUUID()}.${extension}`;
      mediaMime = safeMime;
      const buffer = Buffer.from(await upload.arrayBuffer());
      const { error: uploadError } = await auth.admin.storage
        .from("chat-media")
        .upload(mediaPath, buffer, {
          contentType: safeMime,
          upsert: false,
        });
      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 400 });
      }
    }

    const payloadMessage =
      messageType === "text"
        ? message
        : messageType === "sticker"
          ? message
          : messageType === "voice"
            ? "🎤 Голосовое сообщение"
            : messageType === "video"
              ? "🎬 Видеосообщение"
              : "📷 Фото";

    const pushPreview =
      messageType === "text"
        ? message.slice(0, 120)
        : messageType === "sticker"
          ? "Стикер"
          : messageType === "voice"
            ? "🎤 Голосовое сообщение"
            : messageType === "video"
              ? "🎬 Видеосообщение"
              : "📷 Фото";

    if (groupId) {
      if (!isAdmin && auth.profile.app_sub_tier === "none") {
        return NextResponse.json({ error: "Chat access denied" }, { status: 403 });
      }

      const { data: membership } = await auth.admin
        .from("group_chat_members")
        .select("student_id")
        .eq("group_id", groupId)
        .eq("student_id", auth.user.id)
        .maybeSingle();
      if (!isAdmin && !membership) {
        return NextResponse.json({ error: "Group access denied" }, { status: 403 });
      }

      const { data: group } = await auth.admin
        .from("group_chats")
        .select("id,title")
        .eq("id", groupId)
        .maybeSingle();
      if (!group) {
        return NextResponse.json({ error: "Group was not found" }, { status: 404 });
      }

      const { data: createdMessage, error: insertError } = await auth.admin
        .from("group_chat_messages")
        .insert({
          group_id: groupId,
          sender_id: auth.user.id,
          sender_name: senderName,
          message: payloadMessage,
          message_type: messageType,
          media_path: mediaPath,
          media_mime: mediaMime,
          media_duration_sec: mediaDurationSec,
        })
        .select()
        .single();
      if (insertError) throw insertError;

      const { data: members } = await auth.admin
        .from("group_chat_members")
        .select("student_id")
        .eq("group_id", groupId);
      const memberIds = (members ?? [])
        .map((item) => item.student_id)
        .filter((id) => id !== auth.user.id);

      const { data: admins } = await auth.admin
        .from("profiles")
        .select("id")
        .eq("role", "admin");
      const adminIds = (admins ?? [])
        .map((item) => item.id)
        .filter((id) => id !== auth.user.id);

      const [studentPush, adminPush] = await Promise.all([
        sendWebPush(memberIds, {
          title: senderName,
          body: pushPreview,
          url: `/dashboard/student?tab=chat&group=${groupId}`,
        }),
        sendWebPush(isAdmin ? [] : adminIds, {
          title: senderName,
          body: pushPreview,
          url: `/dashboard/admin?tab=chat&group=${groupId}`,
        }),
      ]);

      return NextResponse.json({
        message: createdMessage,
        pushDelivered: studentPush.delivered + adminPush.delivered,
        pushConfigured: studentPush.configured || adminPush.configured,
      });
    }

    if (!isAdmin && (auth.user.id !== studentId || auth.profile.app_sub_tier === "none")) {
      return NextResponse.json({ error: "Chat access denied" }, { status: 403 });
    }

    const { data: student } = await auth.admin
      .from("profiles")
      .select("id")
      .eq("id", studentId!)
      .eq("role", "student")
      .maybeSingle();
    if (!student) {
      return NextResponse.json({ error: "Student was not found" }, { status: 404 });
    }

    const { data: createdMessage, error: insertError } = await auth.admin
      .from("chat_messages")
      .insert({
        student_id: studentId!,
        sender_id: auth.user.id,
        sender_name: senderName,
        message: payloadMessage,
        message_type: messageType,
        media_path: mediaPath,
        media_mime: mediaMime,
        media_duration_sec: mediaDurationSec,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    let push;
    if (isAdmin) {
      push = await sendWebPush([studentId!], {
        title: senderName,
        body: pushPreview,
        url: "/dashboard/student?tab=chat",
      });
    } else {
      const { data: admins } = await auth.admin
        .from("profiles")
        .select("id")
        .eq("role", "admin");
      push = await sendWebPush(
        (admins ?? []).map((item) => item.id),
        {
          title: senderName,
          body: pushPreview,
          url: `/dashboard/admin?tab=chat&student=${studentId}`,
        }
      );
    }

    return NextResponse.json({
      message: createdMessage,
      pushDelivered: push.delivered,
      pushConfigured: push.configured,
    });
  } catch (error) {
    console.error("Chat send failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Message failed" },
      { status: 500 }
    );
  }
}

/** Edit text message (own or admin). */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAccessToken(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = (await request.json()) as {
      messageId?: string;
      groupId?: string | null;
      studentId?: string | null;
      message?: string;
    };

    const messageId = body.messageId?.trim();
    const text = body.message?.trim() ?? "";
    if (!messageId || !text || text.length > 2000) {
      return NextResponse.json({ error: "Invalid edit payload" }, { status: 400 });
    }

    const table = body.groupId ? "group_chat_messages" : "chat_messages";

    const { data: existing, error: loadError } = await auth.admin
      .from(table)
      .select("*")
      .eq("id", messageId)
      .maybeSingle();

    if (loadError || !existing) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    if (existing.message_type && existing.message_type !== "text") {
      return NextResponse.json(
        { error: "Можно редактировать только текстовые сообщения" },
        { status: 400 }
      );
    }
    if (existing.deleted_at) {
      return NextResponse.json({ error: "Сообщение удалено" }, { status: 400 });
    }

    const patch = {
      message: text,
      edited_at: new Date().toISOString(),
    };
    const { data: updated, error: updateError } = await auth.admin
      .from(table)
      .update(patch)
      .eq("id", messageId)
      .select("*")
      .single();

    if (updateError) {
      // Fallback without edited_at column
      const retry = await auth.admin
        .from(table)
        .update({ message: text })
        .eq("id", messageId)
        .select("*")
        .single();
      if (retry.error) {
        return NextResponse.json({ error: retry.error.message }, { status: 400 });
      }
      return NextResponse.json({ message: retry.data });
    }

    return NextResponse.json({ message: updated });
  } catch (error) {
    console.error("Chat edit failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Edit failed" },
      { status: 500 }
    );
  }
}

/** Soft-delete message (own or admin). */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAccessToken(request);
    if (!auth) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = (await request.json()) as {
      messageId?: string;
      groupId?: string | null;
    };
    const messageId = body.messageId?.trim();
    if (!messageId) {
      return NextResponse.json({ error: "messageId required" }, { status: 400 });
    }

    const table = body.groupId ? "group_chat_messages" : "chat_messages";

    const { data: existing, error: loadError } = await auth.admin
      .from(table)
      .select("*")
      .eq("id", messageId)
      .maybeSingle();

    if (loadError || !existing) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    // Any authenticated chat participant may delete (product requirement).

    const now = new Date().toISOString();
    const soft = {
      deleted_at: now,
      message: "",
      media_path: null,
      media_mime: null,
      media_duration_sec: null,
      message_type: "text" as const,
    };

    const { data: updated, error: updateError } = await auth.admin
      .from(table)
      .update(soft)
      .eq("id", messageId)
      .select("*")
      .single();

    if (updateError) {
      const hard = await auth.admin.from(table).delete().eq("id", messageId);
      if (hard.error) {
        return NextResponse.json({ error: hard.error.message }, { status: 400 });
      }
      return NextResponse.json({ deleted: true, messageId });
    }

    return NextResponse.json({ message: updated });
  } catch (error) {
    console.error("Chat delete failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 }
    );
  }
}
