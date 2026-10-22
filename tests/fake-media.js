// עזר לבדיקות ידניות בדפדפן: מחליף את getUserMedia בזרמים סינתטיים (דופק במצלמה ונשימה במיקרופון).
// שימוש בקונסולה של הדפדפן:  await import('./tests/fake-media.js').then(m => m.install({ bpm: 72, rpm: 15 }))
// אין כאן שום מדידה אמיתית — זה כלי בדיקה בלבד, ואינו נטען על ידי היישום.

export function install({ bpm = 72, rpm = 15 } = {}) {
  window.__fake = { bpm, rpm };
  const realGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => {
    if (c.video) {
      const cv = document.createElement('canvas');
      cv.width = 320; cv.height = 240;
      const g = cv.getContext('2d');
      const t0 = performance.now();
      const draw = () => {
        const t = (performance.now() - t0) / 1000;
        const p = (t * window.__fake.bpm / 60) % 1;
        const amp = Math.exp(-((p - 0.15) ** 2) / (2 * 0.07 ** 2)) + 0.3 * Math.exp(-((p - 0.45) ** 2) / (2 * 0.09 ** 2));
        const R = window.__fake.bpm ? 190 - 5 * amp + (Math.random() - 0.5) * 0.8 : 190;
        g.fillStyle = `rgb(${R},45,30)`;
        g.fillRect(0, 0, 320, 240);
      };
      draw();
      window.__camTimer = setInterval(draw, 33);
      return cv.captureStream(30);
    }
    if (c.audio) {
      const ac = new AudioContext();
      const dest = ac.createMediaStreamDestination();
      const len = ac.sampleRate * 2;
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource();
      src.buffer = buf; src.loop = true;
      const gn = ac.createGain();
      gn.gain.value = 0.01;
      src.connect(gn).connect(dest);
      src.start();
      const t0 = performance.now();
      window.__micTimer = setInterval(() => {
        const t = (performance.now() - t0) / 1000;
        const ph = (t * window.__fake.rpm / 60) % 1;
        const burst = ph < 0.5 ? Math.sin(Math.PI * ph / 0.5) : 0;
        gn.gain.value = window.__fake.rpm ? 0.004 + 0.06 * burst * burst : 0.004;
      }, 40);
      return dest.stream;
    }
    return realGUM(c);
  };
}
