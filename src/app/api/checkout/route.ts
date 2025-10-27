// /app/api/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs"; // importante: webhook/checkout no en Edge

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { uid, email } = body as { uid?: string; email?: string };

    if (!uid || !email) {
      return NextResponse.json({ error: "uid y email son obligatorios" }, { status: 400 });
    }

    const priceId =
      process.env.STRIPE_PRICE_ID ||
      process.env.STRIPE_PRICE_PRO_MONTHLY;

    if (!priceId) {
      return NextResponse.json({ error: "Falta STRIPE_PRICE_ID o STRIPE_PRICE_PRO_MONTHLY" }, { status: 500 });
    }

    // Construye URLs (usa env si existen; si no, deriva del origin actual)
    const origin = req.nextUrl.origin;
    const success_url =
      process.env.NEXT_PUBLIC_CHECKOUT_SUCCESS_URL ||
      `${origin}/billing?status=success`;
    const cancel_url =
      process.env.NEXT_PUBLIC_CHECKOUT_CANCEL_URL ||
      `${origin}/billing?status=cancel`;

    // Crea la sesión de checkout (suscripción)
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url,
      cancel_url,
      customer_email: email,     // crea/usa el customer por email
      allow_promotion_codes: true,
      metadata: { uid },         // lo usaremos en el webhook para marcar Pro
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("Checkout error:", err);
    return NextResponse.json({ error: err?.message ?? "Error" }, { status: 500 });
  }
}
