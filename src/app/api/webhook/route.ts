import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  console.log("➡️ HIT /api/webhook sig? ", !!sig, "bytes=", raw.length);

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  // Si NO hay secret (o no queremos verificar), solo loguea y responde
  if (!secret || !sig) {
    try {
      const parsed = JSON.parse(raw || "{}");
      console.log("🔎 (DEBUG) body sin verificar:", parsed?.type, parsed?.data?.object?.metadata);
    } catch { /* noop */ }
    return NextResponse.json({ debug: true });
  }

  // Verificación real (cuando uses Stripe CLI o endpoint en producción)
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const event = stripe.webhooks.constructEvent(raw, sig, secret);
    console.log("🔔 Evento Stripe:", event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid = (session.metadata as any)?.uid;
      console.log("metadata.uid =", uid, "email =", session.customer_details?.email);
      // Aquí marcarías Pro en Firestore cuando tengas uid o mapping email→uid
      // await adminDb.doc(`users/${uid}`).set({ planTier: "pro" }, { merge: true });
      if (uid) console.log(`✅ Usuario ${uid} actualizado a Pro`);
      else console.warn("⚠️ Sin uid en metadata; usa /api/checkout para adjuntarlo o mapea email→uid.");
    }
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("❌ Verificación firma:", err.message);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }
}
