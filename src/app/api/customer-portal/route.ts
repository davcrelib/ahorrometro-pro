import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminDB } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Busca (y si hace falta, crea) un Customer de Stripe para ese email
async function ensureStripeCustomerId(email: string): Promise<string> {
  // 1) ¿ya existe alguno con ese email?
  const list = await stripe.customers.list({ email, limit: 1 });
  if (list.data.length > 0) return list.data[0].id;

  // 2) No existe → lo creamos
  const c = await stripe.customers.create({ email });
  return c.id;
}

export async function POST(req: NextRequest) {
  try {
    const { uid, email } = (await req.json()) as { uid?: string; email?: string };
    if (!uid || !email) {
      return NextResponse.json({ error: "uid y email requeridos" }, { status: 400 });
    }

    const ref = getAdminDB().doc(`users/${uid}`);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : null;

    // Si ya hay customerId, úsalo. Si no, lo buscamos/creamos por email y lo guardamos.
    let customerId = (data?.stripeCustomerId as string | undefined) || null;
    if (!customerId) {
      customerId = await ensureStripeCustomerId(email);
      await ref.set({ stripeCustomerId: customerId, email }, { merge: true });
    }

    const origin = req.nextUrl.origin;
    const return_url = process.env.NEXT_PUBLIC_PORTAL_RETURN_URL || `${origin}/billing?status=portal`;

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (e: any) {
    console.error("customer-portal error:", e);
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
