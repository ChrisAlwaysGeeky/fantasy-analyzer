import { NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get("Stripe-Signature") as string;

  let event: Stripe.Event;

  try {
    // Verify that this message actually came from Stripe and not a hacker
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // This is where the magic happens!
  if (event.type === "checkout.session.completed") {
    const userId = session.metadata?.userId;
    
    console.log(`💰 PAYMENT SUCCESS: User ${userId} is now PRO!`);

    // TODO: In the next step, we will add a line here to update your 
    // database or Clerk profile to set "isPro: true"
  }

  return new NextResponse(null, { status: 200 });
}