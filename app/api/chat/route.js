import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]/route';
import Replicate from 'replicate';
import { z } from 'zod';
import {
  createConversation,
  getConversation,
  getConversationMessages,
  createMessage,
  verifyConversationOwnership,
  logAuditEvent,
} from '@/lib/db';

// Validate environment variables
if (!process.env.REPLICATE_API_TOKEN) {
  throw new Error('REPLICATE_API_TOKEN environment variable is required');
}

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

// Input validation schema
const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(5000, 'Message too long'),
  conversation_id: z.string().uuid().optional(),
});

export async function POST(request) {
  try {
    // 1. Authentication check
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // 2. Parse and validate input
    const body = await request.json();
    const validatedData = chatRequestSchema.parse(body);
    const { message, conversation_id } = validatedData;

    // 3. Handle conversation: create new or verify ownership of existing
    let conversationId = conversation_id;
    let conversationTitle = null;

    if (conversationId) {
      // Verify user owns this conversation
      const ownershipCheck = await verifyConversationOwnership(conversationId, userId);
      if (!ownershipCheck.authorized) {
        await logAuditEvent(
          userId,
          'UNAUTHORIZED_ACCESS_ATTEMPT',
          'conversation',
          conversationId,
          { reason: ownershipCheck.reason },
          request.headers.get('x-forwarded-for'),
          request.headers.get('user-agent')
        );
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }
    } else {
      // Create new conversation
      const firstWords = message.substring(0, 50);
      conversationTitle = firstWords.length < message.length ? `${firstWords}...` : firstWords;
      const newConversation = await createConversation(userId, conversationTitle);
      conversationId = newConversation.id;
    }

    // 4. Save user message to database
    await createMessage(conversationId, 'user', message);

    // 5. Load conversation history from database (last 20 messages for context)
    const dbMessages = await getConversationMessages(conversationId, 20);

    // Build conversation context from database
    let conversationContext = SYSTEM_PROMPT + "\n\nConversation so far:\n";

    // Only include messages before the current one (excluding the one we just saved)
    const previousMessages = dbMessages.slice(0, -1);
    previousMessages.forEach(msg => {
      conversationContext += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
    });

    conversationContext += `User: ${message}\nAssistant:`;

    // 6. Call Claude via Replicate with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    let output;
    try {
      output = await replicate.run(
        "anthropic/claude-3-sonnet",
        {
          input: {
            prompt: conversationContext,
            max_tokens: 1000,
            temperature: 0.7,
          }
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const response = output.join('');

    // 7. Save assistant response to database
    await createMessage(conversationId, 'assistant', response);

    // 8. Log audit event
    await logAuditEvent(
      userId,
      'AI_QUERY',
      'conversation',
      conversationId,
      { message_length: message.length, response_length: response.length },
      request.headers.get('x-forwarded-for'),
      request.headers.get('user-agent')
    );

    // 9. Return response
    return NextResponse.json({
      message: response,
      conversation_id: conversationId,
    });

  } catch (error) {
    console.error('Chat API Error:', error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        },
        { status: 400 }
      );
    }

    // Handle timeout
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timeout. Please try again.' },
        { status: 504 }
      );
    }

    // Generic error
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}