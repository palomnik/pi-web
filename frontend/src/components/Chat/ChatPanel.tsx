import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import MessageBubble from './MessageBubble';
import { Send, Plus, Trash2 } from 'lucide-react';

export default function ChatPanel() {
  const {
    sessions,
    currentSessionId,
    createSession,
    setCurrentSession,
    addMessage,
    deleteSession,
  } = useAppStore();

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const currentSession = sessions.find((s) => s.id === currentSessionId);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  // Create initial session if none exists
  useEffect(() => {
    if (sessions.length === 0) {
      createSession();
    }
  }, [sessions.length, createSession]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !currentSessionId || isStreaming) return;

    const content = input.trim();
    setInput('');

    // Add user message
    addMessage(currentSessionId, { role: 'user', content });

    setIsStreaming(true);

    try {
      // Send to backend via REST API (WebSocket would be better for streaming)
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, sessionId: currentSessionId }),
      });

      if (response.ok) {
        // For now, just add a placeholder response
        // TODO: Implement proper streaming via WebSocket
        addMessage(currentSessionId, {
          role: 'assistant',
          content: 'Message received. Full streaming integration coming soon...',
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      addMessage(currentSessionId, {
        role: 'assistant',
        content: 'Failed to connect to Pi. Make sure the web interface is started from within Pi.',
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <header className="h-12 border-b border-pi-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <h1 className="font-semibold text-pi-text">Pi Chat</h1>
          {currentSession && (
            <span className="text-sm text-pi-text-secondary">
              {currentSession.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={currentSessionId || ''}
            onChange={(e) => setCurrentSession(e.target.value)}
            className="bg-pi-bg-secondary border border-pi-border rounded px-2 py-1 text-sm"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => createSession()}
            className="p-1.5 rounded hover:bg-pi-bg-secondary"
            title="New session"
          >
            <Plus size={18} />
          </button>
          {currentSessionId && sessions.length > 1 && (
            <button
              onClick={() => deleteSession(currentSessionId)}
              className="p-1.5 rounded hover:bg-pi-bg-secondary text-red-400"
              title="Delete session"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {currentSession?.messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-pi-text-secondary">
            <div className="text-6xl mb-4">π</div>
            <p className="text-lg">Pi Web Interface</p>
            <p className="text-sm mt-2">Start typing to chat with Pi</p>
          </div>
        )}
        {currentSession?.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isStreaming && (
          <div className="flex items-center gap-2 text-pi-text-secondary">
            <div className="animate-pulse-slow">Pi is thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-pi-border">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message to Pi..."
            className="flex-1 bg-pi-bg-secondary border border-pi-border rounded-lg px-4 py-3 resize-none focus:outline-none focus:border-pi-accent"
            rows={1}
            style={{ minHeight: '44px', maxHeight: '200px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="px-4 py-2 bg-pi-accent text-white rounded-lg hover:bg-pi-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={20} />
          </button>
        </form>
        <div className="mt-2 text-xs text-pi-text-secondary">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}