import React, { useEffect, useRef } from 'react';

interface AmbientWavesProps {
  opacity?: number; // Overall opacity (0-1)
}

const AmbientWaves: React.FC<AmbientWavesProps> = ({ opacity = 0.3 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const drawWaves = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw subtle wave layers at the bottom of the screen
      const waves = [
        { y: canvas.height * 0.85, amplitude: 15, frequency: 0.015, speed: 0.015, color: 'rgba(52, 152, 219, 0.15)' },
        { y: canvas.height * 0.90, amplitude: 12, frequency: 0.012, speed: 0.012, color: 'rgba(41, 128, 185, 0.2)' },
        { y: canvas.height * 0.95, amplitude: 10, frequency: 0.01, speed: 0.01, color: 'rgba(52, 152, 219, 0.25)' },
      ];

      waves.forEach(wave => {
        ctx.beginPath();
        ctx.moveTo(0, canvas.height);

        for (let x = 0; x <= canvas.width; x += 5) {
          const y = wave.y + Math.sin(x * wave.frequency + time * wave.speed) * wave.amplitude;
          ctx.lineTo(x, y);
        }

        ctx.lineTo(canvas.width, canvas.height);
        ctx.closePath();
        ctx.fillStyle = wave.color;
        ctx.globalAlpha = opacity;
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      // Add some floating bubbles/particles
      const bubbles = 8;
      for (let i = 0; i < bubbles; i++) {
        const offset = (i / bubbles) * Math.PI * 2;
        const x = (Math.sin(time * 0.005 + offset) * 0.3 + 0.5) * canvas.width;
        const y = (Math.cos(time * 0.003 + offset) * 0.3 + 0.5) * canvas.height;
        const size = 2 + Math.sin(time * 0.01 + offset) * 1;
        
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100, 180, 255, ${opacity * 0.4})`;
        ctx.fill();
      }

      time += 1;
      animationId = requestAnimationFrame(drawWaves);
    };

    drawWaves();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationId);
    };
  }, [opacity]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
};

export default AmbientWaves;
