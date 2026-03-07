import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    // 1. SECURITY CHECK: Ensure the user is logged in
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized. Please sign in to analyze trades." }, { status: 401 });
    }

    // 2. Proceed with the AI logic
    const { messages } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY in .env.local");
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const formattedContents = messages.map((msg: any) => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    const result = await model.generateContent({ contents: formattedContents });
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ analysis: text });
    
  } catch (error: any) {
    console.error("AI Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}