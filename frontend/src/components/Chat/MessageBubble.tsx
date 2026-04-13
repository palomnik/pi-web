import { marked } from 'marked';
import { useMemo } from 'react';
import { Message } from '../../stores/appStore';
import { User, Bot } from 'lucide-react';

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // Parse markdown for assistant messages
  const htmlContent = useMemo(() => {
    if (isUser || isSystem) return null;
    return marked(message.content, { breaks: true });
  }, [message.content, isUser, isSystem]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} ${
        isSystem ? 'justify-center' : ''
      }`}
    >
      {/* Avatar */}
      {!isSystem && (
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isUser ? 'bg-blue-600' : 'bg-pi-accent'
          }`}
        >
          {isUser ? (
            <User size={16} className="text-white" />
          ) : (
            <Bot size={16} className="text-white" />
          )}
        </div>
      )}

      {/* Content */}
      <div
        className={`max-w-[80%] ${
          isSystem
            ? 'bg-yellow-900/20 border border-yellow-600/30'
            : isUser
            ? 'bg-blue-600/20'
            : 'bg-pi-bg-secondary'
        } rounded-lg px-4 py-2`}
      >
        {!isUser && !isSystem && htmlContent ? (
          <div
            className="prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        ) : (
          <p className="whitespace-pre-wrap">{message.content}</p>
        )}
        <div
          className={`text-xs mt-1 ${
            isUser ? 'text-right' : ''
          } text-pi-text-secondary`}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}