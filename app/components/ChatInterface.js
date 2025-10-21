'use client';
import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Send, FileText, LogOut, User } from 'lucide-react';

export default function ChatInterface() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);

  // Redirect to sign-in if not authenticated
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  // Show loading while checking authentication
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          conversation_id: conversationId,
        }),
      });

      const data = await response.json();

      // Handle authentication errors
      if (response.status === 401) {
        router.push('/auth/signin');
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      if (data.conversation_id && !conversationId) {
        setConversationId(data.conversation_id);
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.message}. Please try again.`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const generateReport = async () => {
    if (!conversationId) return;

    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate report');
      }

      // Show report data in console for now (can be enhanced to show in UI)
      console.log('Report generated:', data.report);
      alert('Report generated successfully! Check console for details.');
    } catch (error) {
      console.error('Error generating report:', error);
      alert(`Failed to generate report: ${error.message}`);
    }
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/auth/signin' });
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4">
      <div className="bg-blue-600 text-white p-6 rounded-t-lg">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageSquare className="w-8 h-8" />
              Healthcare AI Idea Evaluator
            </h1>
            <p className="mt-2 opacity-90">
              Let's evaluate your healthcare AI concept together
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5" />
              <span className="text-sm">{session?.user?.name || session?.user?.email}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-2 bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm">Sign out</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-gray-50 p-6 overflow-y-auto">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-semibold mb-2">Start Your AI Evaluation</h3>
            <p>I'll guide you through a comprehensive assessment of your healthcare AI idea.</p>
          </div>
        )}
        
        {messages.map((message, index) => (
          <div key={index} className={`mb-4 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
            <div className={`inline-block p-4 rounded-lg max-w-3xl ${
              message.role === 'user' 
                ? 'bg-blue-500 text-white' 
                : 'bg-white shadow-md'
            }`}>
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="text-left mb-4">
            <div className="inline-block p-4 rounded-lg bg-white shadow-md">
              <div className="flex items-center gap-2">
                <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                <span>Analyzing your response...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white p-4 rounded-b-lg border-t flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Describe your healthcare AI idea..."
          className="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
          className="bg-blue-500 text-white p-3 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-5 h-5" />
        </button>
        
        {messages.length > 5 && (
          <button
            onClick={generateReport}
            className="bg-green-500 text-white px-4 py-3 rounded-lg hover:bg-green-600 flex items-center gap-2"
          >
            <FileText className="w-5 h-5" />
            Generate Report
          </button>
        )}
      </div>
    </div>
  );
}