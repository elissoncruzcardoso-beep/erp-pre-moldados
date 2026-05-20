import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import type { PermissionKey } from "@/lib/permissions/permissions";

export const SESSION_COOKIE_NAME = "erp_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export type SessionUser = {
  userId: string;
  email: string;
  name: string;
  role: string;
  permissions: PermissionKey[];
  exp: number;
};

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret === "troque-por-uma-chave-segura") {
    throw new Error("AUTH_SECRET precisa ser configurado com uma chave segura.");
  }

  return secret;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getAuthSecret()).update(encodedPayload).digest("base64url");
}

export function createSessionToken(user: Omit<SessionUser, "exp">) {
  const payload: SessionUser = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token?: string): SessionUser | null {
  if (!token) {
    return null;
  }

  const [encodedPayload, receivedSignature] = token.split(".");

  if (!encodedPayload || !receivedSignature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);

  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return null;
  }

  const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as SessionUser;

  if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return parsed;
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return verifySessionToken(token);
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/"
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/"
  });
}
