import React, { useEffect, useRef } from 'react';

export const AudioWaveformVisualizer = ({ 
  isRecording = false, 
  isPaused = false,
  stream = null, 
  height = 64, 
  barColor = '#6366f1',
  activeBarColor = '#818cf8',
  backgroundColor = 'transparent'
}) => {
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (isRecording && stream && !isPaused) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }
        const audioCtx = audioContextRef.current;
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        sourceRef.current = source;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
          animationFrameRef.current = requestAnimationFrame(draw);
          analyser.getByteFrequencyData(dataArray);

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const barWidth = (canvas.width / bufferLength) * 1.5;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 255.0;
            const barHeight = Math.max(4, v * (canvas.height - 8));

            // Dynamic gradient from Indigo to Cyan
            const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
            gradient.addColorStop(0, '#4f46e5');
            gradient.addColorStop(0.5, '#6366f1');
            gradient.addColorStop(1, '#06b6d4');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.roundRect(x, (canvas.height - barHeight) / 2, Math.max(3, barWidth - 2), barHeight, 2);
            ctx.fill();

            x += barWidth + 2;
          }
        };

        draw();
      } catch (err) {
        console.warn('AudioContext visualization setup notice:', err);
        fallbackDraw(canvas, ctx);
      }
    } else {
      fallbackDraw(canvas, ctx, isPaused);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (sourceRef.current) {
        try { sourceRef.current.disconnect(); } catch (_) {}
      }
    };
  }, [isRecording, isPaused, stream]);

  const fallbackDraw = (canvas, ctx, paused = false) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bars = 28;
    const barWidth = canvas.width / bars;

    for (let i = 0; i < bars; i++) {
      const heightFactor = paused 
        ? 0.15 
        : Math.sin(i * 0.4) * 0.3 + 0.35;
      const barH = Math.max(4, canvas.height * heightFactor * 0.7);
      
      ctx.fillStyle = paused ? '#64748b' : '#475569';
      ctx.beginPath();
      ctx.roundRect(i * barWidth + 2, (canvas.height - barH) / 2, Math.max(2, barWidth - 4), barH, 2);
      ctx.fill();
    }
  };

  return (
    <div className="w-full flex items-center justify-center overflow-hidden rounded-xl bg-slate-950/60 p-2 border border-slate-800/80">
      <canvas 
        ref={canvasRef} 
        width={320} 
        height={height} 
        className="w-full max-w-sm h-14"
      />
    </div>
  );
};
