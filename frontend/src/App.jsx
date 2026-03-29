import { Bot, RotateCcw, FileText, Upload } from 'lucide-react';
import { useSession } from './hooks/useSession';
import PdfUpload, { UploadButton, DocChips } from './components/PdfUpload';
import ChatPanel from './components/ChatPanel';

export default function App() {
  const {
    documents,
    messages,
    isUploading,
    isSending,
    error,
    uploadPdf,
    sendMessage,
    clearSession,
    setError,
  } = useSession();

  const hasDocuments = documents.length > 0;
  const showChat = hasDocuments || isUploading;

  return (
    <div className="h-screen flex flex-col" style={{ background: '#f8fafc' }}>
      {/* Header */}
      <header style={{
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot style={{ width: 20, height: 20, color: 'white' }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Alex</h1>
            <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>PDF Chat Assistant</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <DocChips documents={documents} />
          {hasDocuments && (
            <UploadButton onUpload={uploadPdf} isUploading={isUploading} />
          )}
          <button
            onClick={clearSession}
            style={{
              padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer',
              color: '#94a3b8', background: 'transparent', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
            title="New Chat"
            onMouseEnter={(e) => { e.target.style.background = '#f1f5f9'; e.target.style.color = '#475569'; }}
            onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = '#94a3b8'; }}
          >
            <RotateCcw style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </header>

      {/* Main area */}
      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        minHeight: 0, maxWidth: 780, width: '100%', margin: '0 auto',
      }}>
        {showChat ? (
          <>
            {isUploading && !hasDocuments && (
              <PdfUpload onUpload={uploadPdf} isUploading={isUploading} documents={documents} />
            )}
            <ChatPanel
              messages={messages}
              isSending={isSending}
              onSend={sendMessage}
              hasDocuments={hasDocuments}
              error={error}
            />
          </>
        ) : (
          /* Welcome / Upload screen */
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', padding: '40px 20px',
          }}>
            {/* Logo */}
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20, boxShadow: '0 8px 32px rgba(79, 70, 229, 0.25)',
            }}>
              <Bot style={{ width: 36, height: 36, color: 'white' }} />
            </div>

            <h2 style={{
              margin: 0, fontSize: 28, fontWeight: 700,
              color: '#1e293b', textAlign: 'center',
            }}>
              Hi, I'm Alex
            </h2>
            <p style={{
              margin: '8px 0 32px', fontSize: 16, color: '#64748b',
              textAlign: 'center', maxWidth: 400, lineHeight: 1.5,
            }}>
              Upload a PDF document and I'll help you find answers, summarize content, and explore insights from it.
            </p>

            {/* Upload area */}
            <PdfUpload onUpload={uploadPdf} isUploading={isUploading} documents={documents} />

            {/* Feature hints */}
            <div style={{
              display: 'flex', gap: 24, marginTop: 40, flexWrap: 'wrap',
              justifyContent: 'center',
            }}>
              {[
                { icon: FileText, label: 'Ask questions about your PDF' },
                { icon: Bot, label: 'Get AI-powered answers with sources' },
                { icon: Upload, label: 'Upload multiple documents' },
              ].map(({ icon: Icon, label }, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 13, color: '#94a3b8',
                }}>
                  <Icon style={{ width: 16, height: 16, color: '#c7d2fe' }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
