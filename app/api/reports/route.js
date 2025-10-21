import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]/route';
import { z } from 'zod';
import {
  getConversationMessages,
  verifyConversationOwnership,
  logAuditEvent,
} from '@/lib/db';

// Input validation schema
const reportRequestSchema = z.object({
  conversation_id: z.string().uuid('Invalid conversation ID'),
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
    const validatedData = reportRequestSchema.parse(body);
    const { conversation_id } = validatedData;

    // 3. Verify conversation ownership
    const ownershipCheck = await verifyConversationOwnership(conversation_id, userId);
    if (!ownershipCheck.authorized) {
      await logAuditEvent(
        userId,
        'UNAUTHORIZED_REPORT_ATTEMPT',
        'conversation',
        conversation_id,
        { reason: ownershipCheck.reason },
        request.headers.get('x-forwarded-for'),
        request.headers.get('user-agent')
      );
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // 4. Retrieve conversation from database
    const messages = await getConversationMessages(conversation_id);

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: 'No messages found in this conversation' },
        { status: 404 }
      );
    }

    // 5. Generate report (simplified for now - can be enhanced with AI later)
    const report = {
      id: crypto.randomUUID(),
      conversation_id,
      created_at: new Date().toISOString(),
      summary: {
        total_messages: messages.length,
        user_messages: messages.filter(m => m.role === 'user').length,
        assistant_messages: messages.filter(m => m.role === 'assistant').length,
        first_message_date: messages[0]?.created_at,
        last_message_date: messages[messages.length - 1]?.created_at,
      },
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.created_at,
      })),
    };

    // 6. Log audit event
    await logAuditEvent(
      userId,
      'REPORT_GENERATED',
      'conversation',
      conversation_id,
      { message_count: messages.length },
      request.headers.get('x-forwarded-for'),
      request.headers.get('user-agent')
    );

    // 7. Return report
    return NextResponse.json({
      report_id: report.id,
      message: 'Report generated successfully',
      report,
    });

  } catch (error) {
    console.error('Reports API Error:', error);

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

    // Generic error
    return NextResponse.json(
      { error: 'Failed to generate report. Please try again later.' },
      { status: 500 }
    );
  }
}