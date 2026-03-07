import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    // We now expect an array of messages: [{ role: "user" | "model", text: "..." }]
    const { messages } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY in .env.local");
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Format the history exactly how Gemini expects it
    const formattedContents = messages.map((msg: any) => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    // Send the entire conversation history to the AI
    const result = await model.generateContent({ contents: formattedContents });
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ analysis: text });
    
  } catch (error: any) {
    console.error("AI Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}