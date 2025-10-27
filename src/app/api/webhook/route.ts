import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminDB, getAdminAuth } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Helpers base
async function setProByUid(uid: string, data: Record<string, any> = {}) {
  await getAdminDB().doc(`users/${uid}`).set(
    { planTier: "pro", proSince: new Date(), ...data },
    { merge: true }
  );
}

async function setTierByCustomerId(
  customerId: string,
  tier: "pro" | "free",
  extras: Record<string, any> = {}
) {
  const snap = await getAdminDB()
    .collection("users")
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();

  if (!snap.empty) {
    await snap.docs[0].ref.set({ planTier: tier, ...extras }, { merge: true });
    return true;
  }
  return false;
}

// Fallbacks
async function setProByEmail(email: string, extras: Record<string, any> = {}) {
  try {
    const user = await getAdminAuth().getUserByEmail(email);
    await getAdminDB().doc(`users/${user.uid}`).set(
      { planTier: "pro", proSince: new Date(), email, ...extras },
      { merge: true }
    );
  } catch {
    // no existe usuario con ese email en Firebase Auth
  }
}

async function upsertByCustomerIdWithEmail(
  customerId: string,
  tier: "pro" | "free",
  extras: Record<string, any> = {}
) {
  // 1) intenta por customerId
  const linked = await setTierByCustomerId(customerId, tier, extras);
  if (linked) return;

  // 2) busca email del customer en Stripe
  const cust = (await stripe.customers.retrieve(customerId)) as Stripe.Customer;
  const email =
    cust.email ||
    ((cust as any).invoice_settings && (cust as any).invoice_settings.email) ||
    undefined;

  if (!email) return;

  // 3) vincula por email → uid y guarda customerId
  try {
    const user = await getAdminAuth().getUserByEmail(email);
    await getAdminDB().doc(`users/${user.uid}`).set(
      { planTier: tier, stripeCustomerId: customerId, ...extras },
      { merge: true }
    );
  } catch {
    // sin usuario en Firebase con ese email
  }
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;
  if (!sig || !secret) return NextResponse.json({ error: "Missing signature or secret" }, { status: 400 });

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
        const email = s.customer_details?.email || s.customer_email || null;

        if (uid) {
          await setProByUid(uid, {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subId,
            email,
          });
        } else if (customerId) {
          await upsertByCustomerIdWithEmail(customerId, "pro", {
            stripeSubscriptionId: subId,
            email,
          });
        } else if (s.mode === "payment" && email) {
          // Emergencia: Payment Link (pago único sin customer/uid). Activa por email.
          await setProByEmail(email);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const isActive = ["trialing", "active", "past_due"].includes(sub.status);
        await upsertByCustomerIdWithEmail(customerId, isActive ? "pro" : "free", {
          stripeSubscriptionStatus: sub.status,
          stripeSubscriptionId: sub.id,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        await upsertByCustomerIdWithEmail(customerId, "free", {
          stripeSubscriptionStatus: "canceled",
        });
        break;
      }

      case "invoice.payment_succeeded": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = inv.customer as string | undefined;

        // algunos typings no exponen 'subscription' en Invoice
        let subId: string | undefined;
        if (typeof inv === "object" && inv !== null && "subscription" in inv) {
          subId = (inv as any).subscription as string | undefined;
        }

        if (customerId) {
          await upsertByCustomerIdWithEmail(customerId, "pro", {
            stripeSubscriptionId: subId ?? null,
            lastInvoiceId: inv.id,
          });
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }
}
