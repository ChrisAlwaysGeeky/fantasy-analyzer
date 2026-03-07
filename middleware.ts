import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define routes that do NOT need a login (like the Stripe webhook)
const isPublicRoute = createRouteMatcher(["/api/webhook"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    // This protects all other routes (like your /api/analyze route)
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes (This is what fixes your AI chat)
    '/(api|trpc)(.*)',
  ],
};