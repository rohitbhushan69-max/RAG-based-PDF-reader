import { useState, useRef, useEffect } from 'react';
import { Bot, SendHorizonal, ChevronDown, ChevronUp, FileText, HelpCircle, Search, Type } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

function TypingIndicator() {
  return (
    <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{
        flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
        background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Bot style={{ width: 16, height: 16, color: '#4f46e5' }} />
      </div>
      <div style={{
        background: 'white', borderRadius: '16px 16px 16px 4px',
        padding: '12px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className="typing-dot" style={{ width: 8, height: 8, background: '#94a3b8', borderRadius: '50%', display: 'inline-block' }} />
          <span className="typing-dot" style={{ width: 8, height: 8, background: '#94a3b8', borderRadius: '50%', display: 'inline-block' }} />
          <span className="typing-dot" style={{ width: 8, height: 8, background: '#94a3b8', borderRadius: '50%', display: 'inline-block' }} />
        </div>
      </div>
    </div>
  );
}

function Sources({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div style={{ marginLeft: 44, marginTop: 6 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 12, color: '#94a3b8', background: 'none',
          border: 'none', cursor: 'pointer', padding: '2px 0',
        }}
      >
        {open ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
        {sources.length} source{sources.length > 1 ? 's' : ''}
      </button>
      {open && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sources.map((s, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '8px 12px', background: 'white',
              borderRadius: 10, fontSize: 12, color: '#64748b',
              border: '1px solid #f1f5f9',
            }}>
              <FileText style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0, color: '#94a3b8' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: '#475569' }}>
                    {s.filename} · Chunk {s.chunkIndex}
                  </span>
                  {s.matchType && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: s.matchType === 'both' ? '#ecfdf5' : s.matchType === 'semantic' ? '#eef2ff' : '#fef3c7',
                      color: s.matchType === 'both' ? '#059669' : s.matchType === 'semantic' ? '#4f46e5' : '#d97706',
                    }}>
                      {s.matchType === 'semantic' && <><Search style={{ width: 9, height: 9 }} /> Semantic</>}
                      {s.matchType === 'keyword' && <><Type style={{ width: 9, height: 9 }} /> Keyword</>}
                      {s.matchType === 'both' && <><Search style={{ width: 9, height: 9 }} /> Both</>}
                    </span>
                  )}
                </div>
                <p style={{ margin: '4px 0 0', color: '#94a3b8', lineHeight: 1.5 }}>{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className="animate-fade-in">
      {/* Clarification indicator */}
      {!isUser && message.type === 'clarification' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginLeft: 44, marginBottom: 4,
          fontSize: 11, color: '#f59e0b', fontWeight: 500,
        }}>
          <HelpCircle style={{ width: 12, height: 12 }} />
          Clarifying question
        </div>
      )}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}>
        {/* Avatar */}
        {!isUser && (
          <div style={{
            flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot style={{ width: 16, height: 16, color: '#4f46e5' }} />
          </div>
        )}

        {/* Bubble */}
        <div style={{
          maxWidth: '78%', padding: '10px 16px', lineHeight: 1.6, fontSize: 15,
          ...(isUser
            ? {
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                color: 'white', borderRadius: '16px 16px 4px 16px',
              }
            : {
                background: 'white', color: '#334155',
                borderRadius: '16px 16px 16px 4px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }),
        }}>
          {isUser ? (
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.content}</p>
          ) : (
            <div style={{ lineHeight: 1.65 }}>
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p style={{ margin: '4px 0' }}>{children}</p>,
                  ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ol>,
                  li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
                  strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
                  code: ({ children }) => (
                    <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>
                      {children}
                    </code>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>

      {/* Sources */}
      {!isUser && message.sources && <Sources sources={message.sources} />}
    </div>
  );
}

export default function ChatPanel({ messages, isSending, onSend, hasDocuments, error }) {
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isSending || !hasDocuments) return;
    onSend(text);
    setInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Messages */}
      <div
        ref={scrollRef}
        className="chat-scroll"
        style={{
          flex: 1, overflowY: 'auto', padding: '24px 16px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {isSending && <TypingIndicator />}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '0 16px 4px' }}>
          <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} style={{ padding: '8px 16px 16px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'white', border: '1px solid #e2e8f0',
          borderRadius: 50, padding: '8px 8px 8px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#818cf8';
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(129,140,248,0.1)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={hasDocuments ? 'Ask Alex anything…' : 'Upload a PDF first to start chatting'}
            disabled={!hasDocuments || isSending}
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 15, color: '#334155', fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isSending || !hasDocuments}
            style={{
              flexShrink: 0, width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: (!input.trim() || isSending || !hasDocuments)
                ? '#e2e8f0' : 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              color: (!input.trim() || isSending || !hasDocuments) ? '#94a3b8' : 'white',
              transition: 'all 0.15s',
            }}
          >
            <SendHorizonal style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </form>
    </div>
  );
}
