// /src/app/api/customer-portal/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminDB } from "@/lib/firebaseAdmin";

export const runtime = "nodejs"; // API route en Node

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { uid } = await req.json();
    if (!uid) {
      return NextResponse.json({ error: "uid requerido" }, { status: 400 });
    }

    // Recupera el stripeCustomerId guardado en users/{uid}
    const snap = await getAdminDB().doc(`users/${uid}`).get();
    const data = snap.exists ? snap.data() : null;
    const customerId = data?.stripeCustomerId as string | undefined;

    if (!customerId) {
      return NextResponse.json({ error: "No hay stripeCustomerId en tu perfil" }, { status: 400 });
    }

    const origin = req.nextUrl.origin;
    const return_url =
      process.env.NEXT_PUBLIC_PORTAL_RETURN_URL || `${origin}/billing?status=portal`;

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
