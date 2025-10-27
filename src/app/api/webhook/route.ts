// /src/app/api/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { adminDB } from "../../../lib/firebaseAdmin"; // Si no usas alias "@", cambia a import relativo: ../../../lib/firebaseAdmin

export const runtime = "nodejs"; // webhooks deben correr en Node (no Edge)

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// --- Helpers ---
async function setProByUid(uid: string, data: Record<string, any> = {}) {
  await adminDB.doc(`users/${uid}`).set(
    {
      planTier: "pro",
      proSince: new Date(),
      ...data,
    },
    { merge: true }
  );
}

async function setTierByCustomerId(
  customerId: string,
  tier: "pro" | "free",
  extras: Record<string, any> = {}
) {
  const snap = await adminDB
    .collection("users")
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();

  if (!snap.empty) {
    await snap.docs[0].ref.set({ planTier: tier, ...extras }, { merge: true });
  }
}

// --- Webhook handler ---
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;
  if (!sig || !secret) {
    return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });
  }

  // ¡OJO! El cuerpo debe ser crudo (string), no JSON
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (e: any) {
    console.error("❌ Bad Stripe signature:", e.message);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const uid = (s.metadata as any)?.uid as string | undefined;
        const customerId = (s.customer as string) ?? null;
        const subId = (s.subscription as string) ?? null;
        const email =
          s.customer_details?.email || s.customer_email || null;

        if (uid) {
          // Camino principal: tenemos el uid de tu app
          await setProByUid(uid, {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subId,
            email,
          });
        } else if (customerId) {
          // Fallback: no llegó uid, enlaza por customerId
          await setTierByCustomerId(customerId, "pro", {
            stripeSubscriptionId: subId,
            email,
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const isActive = ["trialing", "active", "past_due"].includes(sub.status);
        await setTierByCustomerId(customerId, isActive ? "pro" : "free", {
          stripeSubscriptionStatus: sub.status,
          stripeSubscriptionId: sub.id,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        await setTierByCustomerId(customerId, "free", {
          stripeSubscriptionStatus: "canceled",
        });
        break;
      }

      case "invoice.payment_succeeded": {
        // Fallback: en live a veces verás este evento antes/además del checkout.session.completed
        const inv = event.data.object as Stripe.Invoice;
        const customerId = inv.customer as string | undefined;

        // Algunas versiones de types no incluyen "subscription" en Invoice; hacemos type-guard
        let subId: string | undefined;
        if (typeof inv === "object" && inv !== null && "subscription" in inv) {
          subId = (inv as any).subscription as string | undefined;
        }

        if (customerId) {
          await setTierByCustomerId(customerId, "pro", {
            stripeSubscriptionId: subId ?? null,
            lastInvoiceId: inv.id,
          });
        }
        break;
      }

      // Puedes loguear otros eventos si quieres
      default:
        // console.log("Unhandled event:", event.type);
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }
}
