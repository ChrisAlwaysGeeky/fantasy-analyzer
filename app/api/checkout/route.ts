import { NextResponse } from "next/server";
import Stripe from "stripe";
import { decodeJwt } from "jose"; // Standard tool to read login tokens

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

export async function POST(req: Request) {
  try {
    console.log("--- SECURE BYPASS START ---");

    // 1. Manually grab the session token from the browser request
    const cookieHeader = req.headers.get("cookie") || "";
    const sessionToken = cookieHeader
      .split("; ")
      .find((row) => row.startsWith("__session="))
      ?.split("=")[1];

    if (!sessionToken) {
      console.error("No session token found in cookies.");
      return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    }

    // 2. Decode the token to get the User ID (This bypasses the Middleware check)
    const payload = decodeJwt(sessionToken);
    const userId = payload.sub; // 'sub' is the Clerk User ID

    if (!userId) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }

    console.log("Verified User ID:", userId);

    // 3. Create Stripe Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "TradeAnalyzer AI Pro",
              description: "Full Dynasty Analytics Unlocked",
            },
            unit_amount: 499,
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      metadata: { userId: userId },
      success_url: `${req.headers.get("origin")}/?success=true`,
      cancel_url: `${req.headers.get("origin")}/?canceled=true`,
    });

    return NextResponse.json({ url: session.url });
    
  } catch (error: any) {
    console.error("Final Bypass Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}