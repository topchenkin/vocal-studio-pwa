import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";

  return NextResponse.json(
    {
      configured: Boolean(publicKey && privateKey),
      publicKeyPresent: Boolean(publicKey),
      privateKeyPresent: Boolean(privateKey),
      publicKeyLength: publicKey.length,
      privateKeyLength: privateKey.length,
      publicKeyFormatValid: /^[A-Za-z0-9_-]{80,100}$/.test(publicKey),
      privateKeyFormatValid: /^[A-Za-z0-9_-]{40,60}$/.test(privateKey),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
