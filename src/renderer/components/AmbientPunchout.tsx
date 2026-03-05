import React, { useEffect, useRef } from 'react';

/**
 * Ambient Punch-Out!! NES cycling scene.
 * Subtle version for the main page background — reduced detail and opacity.
 */

const COLORS = {
  buildingDark: '#0f0f2a',
  buildingMid: '#1a1a3e',
  windowLit: '#e8d44d',
  windowDim: '#3a3a5a',
  road: '#2a2a2a',
  roadLine: '#d4d46a',
  sidewalk: '#4a4a5a',
};

interface Building {
  x: number;
  width: number;
  height: number;
  color: string;
  windows: { row: number; col: number; lit: boolean }[];
}

interface AmbientPunchoutProps {
  opacity?: number;
}

const AmbientPunchout: React.FC<AmbientPunchoutProps> = ({ opacity = 0.3 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;
    let buildings: Building[] = [];

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const generateBuildings = (): Building[] => {
      const result: Building[] = [];
      let x = 0;
      const count = 25;
      for (let i = 0; i < count; i++) {
        const width = 35 + Math.random() * 55;
        const height = 80 + Math.random() * 200;
        const color = Math.random() > 0.5 ? COLORS.buildingDark : COLORS.buildingMid;
        const windows: { row: number; col: number; lit: boolean }[] = [];
        const cols = Math.floor(width / 12);
        const rows = Math.floor(height / 14);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            windows.push({ row: r, col: c, lit: Math.random() > 0.55 });
          }
        }
        result.push({ x, width, height, color, windows });
        x += width + 2;
      }
      // Duplicate for seamless scrolling
      const originalLen = result.length;
      const totalW = x;
      for (let i = 0; i < originalLen; i++) {
        result.push({ ...result[i], x: result[i].x + totalW });
      }
      return result;
    };

    const init = () => {
      buildings = generateBuildings();
    };

    const drawScene = () => {
      const w = canvas.width;
      const h = canvas.height;
      const groundY = h * 0.82;

      ctx.clearRect(0, 0, w, h);

      // Buildings scrolling slowly
      const speed = 0.4;
      const totalWidth = buildings.length > 0
        ? buildings[buildings.length / 2 - 1].x + buildings[buildings.length / 2 - 1].width + 2
        : w;
      const offset = (time * speed) % totalWidth;

      for (const b of buildings) {
        const bx = b.x - offset;
        if (bx + b.width < -100 || bx > w + 100) continue;

        ctx.fillStyle = b.color;
        ctx.fillRect(bx, groundY - b.height, b.width, b.height);

        // Windows
        for (const win of b.windows) {
          const flickr = Math.sin(time * 0.01 + win.row * 3.7 + win.col * 2.3);
          ctx.fillStyle = win.lit
            ? `rgba(232, 212, 77, ${0.5 + flickr * 0.12})`
            : COLORS.windowDim;
          ctx.fillRect(
            bx + 8 + win.col * 12,
            groundY - b.height + 8 + win.row * 14,
            6, 8,
          );
        }
      }

      // Sidewalk
      ctx.fillStyle = COLORS.sidewalk;
      ctx.fillRect(0, groundY, w, 5);

      // Road
      ctx.fillStyle = COLORS.road;
      ctx.fillRect(0, groundY + 5, w, h - groundY - 5);

      // Lane dashes
      const dashSpeed = 1.5;
      const dashLen = 35;
      const dashGap = 25;
      const dashY = groundY + (h - groundY) * 0.45;
      ctx.fillStyle = COLORS.roadLine;
      const totalDash = dashLen + dashGap;
      const dashOffset = (time * dashSpeed) % totalDash;
      for (let x = -dashOffset - dashLen; x < w + dashLen; x += totalDash) {
        ctx.fillRect(x, dashY, dashLen, 2);
      }
    };

    const animate = () => {
      time++;
      drawScene();
      animationId = requestAnimationFrame(animate);
    };

    resizeCanvas();
    init();
    animate();

    const handleResize = () => {
      resizeCanvas();
      init();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0, opacity }}
    />
  );
};

export default AmbientPunchout;
