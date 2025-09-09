import { NextResponse } from 'next/server';
import Replicate from 'replicate';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Healthcare AI evaluation system prompt
const SYSTEM_PROMPT = `You are an expert healthcare AI consultant specializing in evaluating AI/ML project ideas for healthcare organizations. You have deep knowledge of healthcare regulations (HIPAA, FDA guidelines), clinical workflows, health equity considerations, and ROI analysis.

Your role is to guide users through a structured evaluation of their healthcare AI ideas. Follow this conversation flow:

1. Problem & Solution Overview
2. Impact Assessment  
3. Technical Feasibility
4. Resources & Implementation
5. Risk & Compliance

Provide constructive, specific feedback while being encouraging but realistic. Keep responses focused and ask one key question at a time to guide the conversation forward.`;

export async function POST(request) {
  try {
    const { message, conversation_id, chat_history } = await request.json();

    // Build conversation context
    let conversationContext = SYSTEM_PROMPT + "\n\nConversation so far:\n";
    
    if (chat_history && chat_history.length > 0) {
      chat_history.forEach(msg => {
        conversationContext += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
      });
    }
    
    conversationContext += `User: ${message}\nAssistant:`;

    // Call Claude via Replicate
    const output = await replicate.run(
      "anthropic/claude-3-sonnet",
      {
        input: {
          prompt: conversationContext,
          max_tokens: 1000,
          temperature: 0.7,
        }
      }
    );

    const response = output.join('');

    // Generate conversation ID if new conversation
    const newConversationId = conversation_id || Date.now().toString();

    // TODO: Save to database when connected
    
    return NextResponse.json({
      message: response,
      conversation_id: newConversationId,
    });

  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}