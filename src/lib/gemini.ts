import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(API_KEY || "");

export const getGeminiResponse = async (systemInstruction: string, chatHistory: { role: string, parts: { text: string }[] }[]) => {
  if (!API_KEY || API_KEY === "MY_GEMINI_API_KEY") {
    throw new Error("Gemini API Key not configured. Please add VITE_GEMINI_API_KEY to your .env file.");
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-flash-latest",
    systemInstruction,
  });

  const chat = model.startChat({
    history: chatHistory.slice(0, -1), // Everything except the last message
  });

  const lastMessage = chatHistory[chatHistory.length - 1].parts[0].text;
  const result = await chat.sendMessage(lastMessage);
  const response = await result.response;
  return response.text();
};
