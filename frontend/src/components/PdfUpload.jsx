import { useCallback, useRef, useState } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';

export default function PdfUpload({ onUpload, isUploading, documents }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (file) => {
      if (file && file.type === 'application/pdf') {
        onUpload(file);
      }
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      handleFile(file);
    },
    [handleFile]
  );

  // Uploading state
  if (isUploading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ textAlign: 'center' }}>
          <div className="animate-pulse-ring" style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Loader2 style={{ width: 24, height: 24, color: '#4f46e5', animation: 'spin 1s linear infinite' }} />
          </div>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>Processing your PDF…</p>
          <p style={{ color: '#94a3b8', fontSize: 12, margin: '4px 0 0' }}>Extracting text and creating embeddings</p>
        </div>
      </div>
    );
  }

  // Upload card (shown on welcome screen)
  if (documents.length === 0) {
    return (
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => inputRef.current?.click()}
        style={{
          width: '100%', maxWidth: 420,
          border: `2px dashed ${isDragging ? '#818cf8' : '#e2e8f0'}`,
          borderRadius: 16, padding: '40px 32px',
          textAlign: 'center', cursor: 'pointer',
          background: isDragging ? '#eef2ff' : 'white',
          transition: 'all 0.2s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#818cf8';
          e.currentTarget.style.background = '#fafbff';
        }}
        onMouseLeave={(e) => {
          if (!isDragging) {
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.background = 'white';
          }
        }}
      >
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <Upload style={{ width: 22, height: 22, color: '#4f46e5' }} />
        </div>
        <p style={{ fontSize: 16, fontWeight: 600, color: '#334155', margin: '0 0 6px' }}>
          Drop your PDF here
        </p>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
          or click to browse • PDF files up to 20MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ''; }}
        />
      </div>
    );
  }

  return null;
}

/** Compact upload button for the header */
export function UploadButton({ onUpload, isUploading }) {
  const inputRef = useRef(null);

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', fontSize: 13, fontWeight: 500,
          borderRadius: 8, border: 'none', cursor: 'pointer',
          background: '#eef2ff', color: '#4f46e5',
          transition: 'background 0.15s',
          opacity: isUploading ? 0.5 : 1,
        }}
        onMouseEnter={(e) => { e.target.style.background = '#e0e7ff'; }}
        onMouseLeave={(e) => { e.target.style.background = '#eef2ff'; }}
        title="Upload another PDF"
      >
        {isUploading ? (
          <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
        ) : (
          <Upload style={{ width: 14, height: 14 }} />
        )}
        <span>Add PDF</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files[0];
          if (file && file.type === 'application/pdf') onUpload(file);
          e.target.value = '';
        }}
      />
    </>
  );
}

/** Document chips shown in the header */
export function DocChips({ documents }) {
  if (documents.length === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', maxWidth: 300 }}>
      {documents.map((doc, i) => (
        <span
          key={i}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', fontSize: 12, fontWeight: 500,
            background: '#f1f5f9', color: '#64748b',
            borderRadius: 20, whiteSpace: 'nowrap',
          }}
          title={`${doc.filename} — ${doc.pages} pages, ${doc.chunkCount} chunks`}
        >
          <FileText style={{ width: 12, height: 12 }} />
          {doc.filename.length > 20 ? doc.filename.slice(0, 18) + '…' : doc.filename}
        </span>
      ))}
    </div>
  );
}
