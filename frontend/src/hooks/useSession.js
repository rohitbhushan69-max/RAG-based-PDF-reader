import { useState, useCallback } from 'react';
import axios from 'axios';

function getOrCreateSessionId() {
  let id = localStorage.getItem('alex_session_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('alex_session_id', id);
  }
  return id;
}

export function useSession() {
  const [sessionId, setSessionId] = useState(getOrCreateSessionId);
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi, I'm Alex. Upload a PDF and I'll help you find answers from it.",
    },
  ]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);

  const uploadPdf = useCallback(
    async (file) => {
      setIsUploading(true);
      setError(null);
      try {
        const form = new FormData();
        form.append('pdf', file);
        form.append('sessionId', sessionId);

        const { data } = await axios.post('/api/ingest', form);
        setDocuments((prev) => [
          ...prev,
          { filename: data.filename, pages: data.pages, chunkCount: data.chunkCount },
        ]);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `I've processed **${data.filename}** (${data.pages} pages, ${data.chunkCount} chunks). You can now ask me questions about it!`,
          },
        ]);
        return data;
      } catch (err) {
        const msg = err.response?.data?.error || 'Failed to upload PDF';
        setError(msg);
        throw new Error(msg);
      } finally {
        setIsUploading(false);
      }
    },
    [sessionId]
  );

  const sendMessage = useCallback(
    async (text) => {
      setError(null);
      const userMsg = { role: 'user', content: text };
      setMessages((prev) => [...prev, userMsg]);
      setIsSending(true);

      try {
        // Build history from previous messages (exclude the greeting and system messages)
        const history = messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-10); // last 10 messages for context window

        const { data } = await axios.post('/api/chat', {
          sessionId,
          message: text,
          history,
        });

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.reply,
            sources: data.sources,
            type: data.type, // 'answer' | 'clarification' | 'answer_with_search'
            agentTrace: data.agentTrace || [],
          },
        ]);
      } catch (err) {
        const msg = err.response?.data?.error || 'Failed to get response';
        setError(msg);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: "Sorry, I couldn't process that request. Please try again." },
        ]);
      } finally {
        setIsSending(false);
      }
    },
    [sessionId, messages]
  );

  const clearSession = useCallback(async () => {
    try {
      await axios.post('/api/session/clear', { sessionId });
    } catch {
      // ignore cleanup errors
    }
    const newId = crypto.randomUUID();
    localStorage.setItem('alex_session_id', newId);
    setSessionId(newId);
    setDocuments([]);
    setMessages([
      {
        role: 'assistant',
        content: "Hi, I'm Alex. Upload a PDF and I'll help you find answers from it.",
      },
    ]);
    setError(null);
  }, [sessionId]);

  return {
    sessionId,
    documents,
    messages,
    isUploading,
    isSending,
    error,
    uploadPdf,
    sendMessage,
    clearSession,
    setError,
  };
}
