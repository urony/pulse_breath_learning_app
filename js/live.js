// ציור חי על canvas (אות PPG / מעטפת נשימה). אינו מציג דבר מלבד נתונים שנאספו בפועל.

export function drawTrace(canvas, values, { color = '#c62828', markers = [], emptyText = '' } = {}) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 300;
  const cssH = canvas.clientHeight || 90;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, cssW, cssH);
  c.fillStyle = 'rgba(0,0,0,0.04)';
  c.fillRect(0, 0, cssW, cssH);
  if (!values || values.length < 3) {
    if (emptyText) {
      c.fillStyle = '#555';
      c.font = '13px system-ui, Arial';
      c.textAlign = 'center';
      c.fillText(emptyText, cssW / 2, cssH / 2 + 4);
    }
    return;
  }
  let lo = Infinity, hi = -Infinity;
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi - lo < 1e-9) { hi = lo + 1; }
  const pad = 8;
  const X = (i) => (i / (values.length - 1)) * (cssW - 2 * pad) + pad;
  const Y = (v) => cssH - pad - ((v - lo) / (hi - lo)) * (cssH - 2 * pad);
  c.beginPath();
  values.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v))));
  c.strokeStyle = color;
  c.lineWidth = 2;
  c.lineJoin = 'round';
  c.stroke();
  c.fillStyle = color;
  markers.forEach((i) => {
    if (i < 0 || i >= values.length) return;
    c.beginPath();
    c.arc(X(i), Y(values[i]), 4.5, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    c.stroke();
  });
}
