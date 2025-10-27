import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@/lib/firebase";
import { getAuth } from "firebase-admin/auth";
import * as admin from "firebase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Inicializa Firebase Admin (solo en servidor)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

export async function POST(req: Request) {
  try {
    const { uid } = await req.json();

    // Verifica que el uid venga del cliente autenticado
    if (!uid) {
      return NextResponse.json({ error: "UID required" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        { price: process.env.STRIPE_PRICE_ID!, quantity: 1 },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/cancel`,
      metadata: { uid },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
