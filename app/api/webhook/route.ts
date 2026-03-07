import { NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { createClerkClient } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
  const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  
  const body = await req.text();
  const signature = (await headers()).get("Stripe-Signature") as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET || "");
  } catch (err: any) {
    console.error("❌ Webhook Signature Verification Failed");
    return new NextResponse(`Error: ${err.message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;

    console.log("🔔 Webhook received for User ID:", userId);

    if (!userId) {
      console.error("❌ ERROR: No userId found in Stripe metadata. Cannot update Clerk.");
      return new NextResponse("No User ID in metadata", { status: 400 });
    }

    try {
      console.log("System: Attempting to update Clerk Metadata for:", userId);
      await clerkClient.users.updateUserMetadata(userId, {
        publicMetadata: {
          isPro: true,
        },
      });
      console.log("✅ SUCCESS: Clerk profile updated for:", userId);
    } catch (clerkError: any) {
      console.error("❌ CLERK UPDATE FAILED:", clerkError.message);
      return new NextResponse("Clerk update failed", { status: 500 });
    }
  }

  return new NextResponse("Success", { status: 200 });
}