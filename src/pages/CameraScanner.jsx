import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

// Full-screen camera overlay. Decodes barcodes and QR codes continuously
// and calls onDetect(text) the moment one is found, then stays open so
// the person can keep scanning (POS use case: scan several items in a row).
export default function CameraScanner({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [error, setError] = useState('');
  const [lastCode, setLastCode] = useState('');

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    let stopped = false;
    let lastText = '';
    let lastTime = 0;

    reader.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoRef.current,
      (result) => {
        if (stopped || !result) return;
        const text = result.getText();
        const now = Date.now();
        // ignore the exact same code repeating within 1.5s (camera scans continuously)
        if (text === lastText && now - lastTime < 1500) return;
        lastText = text; lastTime = now;
        setLastCode(text);
        onDetect(text);
      }
    ).catch(err => setError(err.message || 'Could not access the camera'));

    return () => {
      stopped = true;
      try { reader.reset(); } catch (e) { /* ignore */ }
    };
  }, []);

  return (
    <div className="modal-bg" style={{ background: 'rgba(0,0,0,.9)' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
          <video ref={videoRef} style={{ width: '100%', display: 'block' }} muted playsInline />
          <div style={{ position: 'absolute', inset: '25% 12%', border: '2px solid var(--orange)', borderRadius: 10, pointerEvents: 'none' }} />
        </div>
        {error && <div style={{ color: '#ff8080', marginTop: 12, fontSize: 13 }}>{error}</div>}
        {!error && lastCode && <div style={{ color: '#9ee6a0', marginTop: 12, fontSize: 13 }}>Scanned: {lastCode}</div>}
        {!error && !lastCode && <div style={{ color: '#ccc', marginTop: 12, fontSize: 13 }}>Point the camera at a barcode or QR code</div>}
        <button className="btn ghost" style={{ marginTop: 14, color: '#fff', borderColor: '#555' }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
