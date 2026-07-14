import React, { useEffect, useRef } from 'react';
import QRLib from 'qrcode';

// Renders a QR code for `value` on a canvas.
function QRCode({ value, size = 160, className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    QRLib.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 1,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    }).catch(() => {});
  }, [value, size]);

  return <canvas ref={canvasRef} className={className} aria-label={`QR code for ${value}`} />;
}

export default QRCode;
