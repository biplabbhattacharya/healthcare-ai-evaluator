import { sql } from '@vercel/postgres';

/**
 * Database helper functions for Healthcare AI Evaluator
 * Provides CRUD operations with proper error handling and security
 */

// User Operations
export async function createUser(email, passwordHash, name) {
  try {
    const result = await sql`
      INSERT INTO users (email, password_hash, name)
      VALUES (${email}, ${passwordHash}, ${name})
      RETURNING id, email, name, created_at
    `;
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      throw new Error('User with this email already exists');
    }
    throw error;
  }
}

export async function getUserByEmail(email) {
  try {
    const result = await sql`
      SELECT id, email, password_hash, name, created_at
      FROM users
      WHERE email = ${email}
    `;
    return result.rows[0] || null;
  } catch (error) {
    console.error('Database error in getUserByEmail:', error);
    throw error;
  }
}

export async function getUserById(userId) {
  try {
    const result = await sql`
      SELECT id, email, name, created_at
      FROM users
      WHERE id = ${userId}
    `;
    return result.rows[0] || null;
  } catch (error) {
    console.error('Database error in getUserById:', error);
    throw error;
  }
}

// Conversation Operations
export async function createConversation(userId, title = 'New Conversation') {
  try {
    const result = await sql`
      INSERT INTO conversations (user_id, title)
      VALUES (${userId}, ${title})
      RETURNING id, user_id, title, created_at
    `;
    return result.rows[0];
  } catch (error) {
    console.error('Database error in createConversation:', error);
    throw error;
  }
}

export async function getConversation(conversationId) {
  try {
    const result = await sql`
      SELECT id, user_id, title, created_at, updated_at
      FROM conversations
      WHERE id = ${conversationId}
    `;
    return result.rows[0] || null;
  } catch (error) {
    console.error('Database error in getConversation:', error);
    throw error;
  }
}

export async function getUserConversations(userId, limit = 50) {
  try {
    const result = await sql`
      SELECT c.id, c.title, c.created_at, c.updated_at,
             COUNT(m.id) as message_count
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.user_id = ${userId}
      GROUP BY c.id, c.title, c.created_at, c.updated_at
      ORDER BY c.updated_at DESC
      LIMIT ${limit}
    `;
    return result.rows;
  } catch (error) {
    console.error('Database error in getUserConversations:', error);
    throw error;
  }
}

export async function updateConversationTimestamp(conversationId) {
  try {
    await sql`
      UPDATE conversations
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ${conversationId}
    `;
  } catch (error) {
    console.error('Database error in updateConversationTimestamp:', error);
    throw error;
  }
}

// Message Operations
export async function createMessage(conversationId, role, content) {
  try {
    const result = await sql`
      INSERT INTO messages (conversation_id, role, content)
      VALUES (${conversationId}, ${role}, ${content})
      RETURNING id, conversation_id, role, content, created_at
    `;

    // Update conversation timestamp
    await updateConversationTimestamp(conversationId);

    return result.rows[0];
  } catch (error) {
    console.error('Database error in createMessage:', error);
    throw error;
  }
}

export async function getConversationMessages(conversationId, limit = 100) {
  try {
    const result = await sql`
      SELECT id, conversation_id, role, content, created_at
      FROM messages
      WHERE conversation_id = ${conversationId}
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;
    return result.rows;
  } catch (error) {
    console.error('Database error in getConversationMessages:', error);
    throw error;
  }
}

// Audit Logging
export async function logAuditEvent(userId, action, resourceType, resourceId, details, ipAddress, userAgent) {
  try {
    await sql`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
      VALUES (${userId}, ${action}, ${resourceType}, ${resourceId}, ${JSON.stringify(details)}, ${ipAddress}, ${userAgent})
    `;
  } catch (error) {
    // Don't throw on audit log failures to avoid breaking main operations
    console.error('Failed to log audit event:', error);
  }
}

// Authorization Helpers
export async function verifyConversationOwnership(conversationId, userId) {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    return { authorized: false, reason: 'Conversation not found' };
  }
  if (conversation.user_id !== userId) {
    return { authorized: false, reason: 'Access denied' };
  }
  return { authorized: true, conversation };
}

// Database Initialization
export async function initializeDatabase() {
  try {
    // Read and execute schema file
    // Note: In production, use proper migration tools
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const schemaPath = join(process.cwd(), 'lib', 'db', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');

    // Execute schema statements
    await sql.query(schema);

    console.log('Database initialized successfully');
    return true;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}
