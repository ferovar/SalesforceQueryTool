import React, { useEffect, useRef } from 'react';

/**
 * Punch-Out!! NES cycling scene background.
 * Parallax city skyline, scrolling road, and pixel-art cyclist.
 */

// NES-inspired palette
const COLORS = {
  sky: '#1a1040',
  skyGradient: '#2d1856',
  stars: '#ffffff',
  buildingDark: '#0f0f2a',
  buildingMid: '#1a1a3e',
  buildingLight: '#252550',
  windowLit: '#e8d44d',
  windowDim: '#3a3a5a',
  road: '#2a2a2a',
  roadLine: '#d4d46a',
  roadEdge: '#555555',
  sidewalk: '#4a4a5a',
  cyclist: '#e8a050',
  bike: '#888888',
  wheel: '#555555',
  shirt: '#38a838',
  shorts: '#282828',
  skin: '#e8a050',
  moon: '#e8e8c8',
};

interface Building {
  x: number;
  width: number;
  height: number;
  color: string;
  windows: { row: number; col: number; lit: boolean }[];
  hasAntenna: boolean;
}

const PunchoutBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    // Scene state
    let buildings: Building[] = [];
    let bgBuildings: Building[] = [];

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const generateBuildings = (
      count: number,
      minH: number,
      maxH: number,
      minW: number,
      maxW: number,
      colors: string[],
    ): Building[] => {
      const result: Building[] = [];
      let x = 0;
      for (let i = 0; i < count; i++) {
        const width = minW + Math.random() * (maxW - minW);
        const height = minH + Math.random() * (maxH - minH);
        const color = colors[Math.floor(Math.random() * colors.length)];
        const windows: { row: number; col: number; lit: boolean }[] = [];
        const cols = Math.floor(width / 12);
        const rows = Math.floor(height / 14);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            windows.push({ row: r, col: c, lit: Math.random() > 0.55 });
          }
        }
        result.push({
          x,
          width,
          height,
          color,
          windows,
          hasAntenna: Math.random() > 0.7,
        });
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
      bgBuildings = generateBuildings(
        30, 60, 180, 30, 70,
        [COLORS.buildingDark, '#141430'],
      );
      buildings = generateBuildings(
        20, 100, 280, 40, 90,
        [COLORS.buildingMid, COLORS.buildingLight, '#1e1e48'],
      );
    };

    // Draw pixel-art cyclist
    const drawCyclist = (cx: number, groundY: number) => {
      const scale = Math.min(canvas.width / 900, canvas.height / 500);
      const s = Math.max(scale, 0.6);

      // Pedal rotation
      const pedalAngle = time * 0.1;
      const pedalRadius = 8 * s;

      // Wheel positions
      const rearWheelX = cx - 18 * s;
      const frontWheelX = cx + 18 * s;
      const wheelY = groundY - 10 * s;
      const wheelR = 10 * s;

      // Draw wheels
      ctx.strokeStyle = COLORS.wheel;
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.arc(rearWheelX, wheelY, wheelR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(frontWheelX, wheelY, wheelR, 0, Math.PI * 2);
      ctx.stroke();

      // Spokes
      ctx.lineWidth = 1 * s;
      for (let i = 0; i < 4; i++) {
        const a = pedalAngle + (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(rearWheelX, wheelY);
        ctx.lineTo(rearWheelX + Math.cos(a) * wheelR, wheelY + Math.sin(a) * wheelR);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(frontWheelX, wheelY);
        ctx.lineTo(frontWheelX + Math.cos(a) * wheelR, wheelY + Math.sin(a) * wheelR);
        ctx.stroke();
      }

      // Frame
      ctx.strokeStyle = COLORS.bike;
      ctx.lineWidth = 2.5 * s;
      const seatX = cx - 6 * s;
      const seatY = wheelY - 18 * s;
      const pedalCenterX = cx;
      const pedalCenterY = wheelY - 2 * s;
      const handleX = cx + 12 * s;
      const handleY = wheelY - 22 * s;

      // Seat tube
      ctx.beginPath();
      ctx.moveTo(seatX, seatY);
      ctx.lineTo(pedalCenterX, pedalCenterY);
      ctx.stroke();
      // Down tube
      ctx.beginPath();
      ctx.moveTo(seatX, seatY);
      ctx.lineTo(frontWheelX, wheelY);
      ctx.stroke();
      // Chain stay
      ctx.beginPath();
      ctx.moveTo(pedalCenterX, pedalCenterY);
      ctx.lineTo(rearWheelX, wheelY);
      ctx.stroke();
      // Top tube
      ctx.beginPath();
      ctx.moveTo(seatX, seatY);
      ctx.lineTo(handleX, handleY);
      ctx.stroke();
      // Head tube
      ctx.beginPath();
      ctx.moveTo(handleX, handleY);
      ctx.lineTo(frontWheelX, wheelY);
      ctx.stroke();

      // Handlebars
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(handleX - 4 * s, handleY - 3 * s);
      ctx.lineTo(handleX + 4 * s, handleY - 3 * s);
      ctx.stroke();

      // Seat
      ctx.fillStyle = COLORS.shorts;
      ctx.fillRect(seatX - 4 * s, seatY - 2 * s, 8 * s, 3 * s);

      // Pedal positions
      const pedalLX = pedalCenterX + Math.cos(pedalAngle) * pedalRadius;
      const pedalLY = pedalCenterY + Math.sin(pedalAngle) * pedalRadius;
      const pedalRX = pedalCenterX + Math.cos(pedalAngle + Math.PI) * pedalRadius;
      const pedalRY = pedalCenterY + Math.sin(pedalAngle + Math.PI) * pedalRadius;

      // Legs (back leg first)
      const hipX = seatX;
      const hipY = seatY + 2 * s;

      // Back leg
      ctx.strokeStyle = COLORS.skin;
      ctx.lineWidth = 4 * s;
      ctx.beginPath();
      ctx.moveTo(hipX, hipY);
      const backKneeX = (hipX + pedalRX) / 2 - 3 * s;
      const backKneeY = (hipY + pedalRY) / 2 + 6 * s;
      ctx.quadraticCurveTo(backKneeX, backKneeY, pedalRX, pedalRY);
      ctx.stroke();

      // Front leg
      ctx.beginPath();
      ctx.moveTo(hipX, hipY);
      const frontKneeX = (hipX + pedalLX) / 2 + 3 * s;
      const frontKneeY = (hipY + pedalLY) / 2 + 6 * s;
      ctx.quadraticCurveTo(frontKneeX, frontKneeY, pedalLX, pedalLY);
      ctx.stroke();

      // Torso leaning forward
      const torsoTopX = cx + 4 * s;
      const torsoTopY = seatY - 16 * s;
      ctx.strokeStyle = COLORS.shirt;
      ctx.lineWidth = 6 * s;
      ctx.beginPath();
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(torsoTopX, torsoTopY);
      ctx.stroke();

      // Arms
      ctx.strokeStyle = COLORS.skin;
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.moveTo(torsoTopX, torsoTopY + 2 * s);
      ctx.lineTo(handleX, handleY - 2 * s);
      ctx.stroke();

      // Head
      ctx.fillStyle = COLORS.skin;
      ctx.beginPath();
      ctx.arc(torsoTopX - 1 * s, torsoTopY - 6 * s, 5 * s, 0, Math.PI * 2);
      ctx.fill();

      // Hair
      ctx.fillStyle = '#2a2a2a';
      ctx.beginPath();
      ctx.arc(torsoTopX - 1 * s, torsoTopY - 8 * s, 4 * s, Math.PI, Math.PI * 2);
      ctx.fill();
    };

    const drawMoon = () => {
      const moonX = canvas.width * 0.8;
      const moonY = canvas.height * 0.12;
      const moonR = 20;

      ctx.fillStyle = COLORS.moon;
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
      ctx.fill();

      // Craters
      ctx.fillStyle = '#c8c8a8';
      ctx.beginPath();
      ctx.arc(moonX - 5, moonY - 3, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(moonX + 6, moonY + 5, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(moonX - 2, moonY + 7, 2, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawStars = () => {
      ctx.fillStyle = COLORS.stars;
      // Deterministic stars based on canvas size
      const seed = 42;
      for (let i = 0; i < 60; i++) {
        const px = ((seed * (i + 1) * 7919) % 10000) / 10000;
        const py = ((seed * (i + 1) * 6271) % 10000) / 10000;
        const x = px * canvas.width;
        const y = py * canvas.height * 0.4;
        const twinkle = Math.sin(time * 0.03 + i * 1.7) * 0.5 + 0.5;
        ctx.globalAlpha = twinkle * 0.8;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;
    };

    const drawScene = () => {
      const w = canvas.width;
      const h = canvas.height;
      const groundY = h * 0.78;
      const roadH = h - groundY;

      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
      skyGrad.addColorStop(0, COLORS.sky);
      skyGrad.addColorStop(0.6, COLORS.skyGradient);
      skyGrad.addColorStop(1, '#3d2068');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, groundY);

      // Stars
      drawStars();

      // Moon
      drawMoon();

      // Background buildings (far - slow parallax)
      const bgSpeed = 0.3;
      const bgTotalWidth = bgBuildings.length > 0
        ? bgBuildings[bgBuildings.length / 2 - 1].x + bgBuildings[bgBuildings.length / 2 - 1].width + 2
        : w;
      const bgOffset = (time * bgSpeed) % bgTotalWidth;

      for (const b of bgBuildings) {
        const bx = b.x - bgOffset;
        if (bx + b.width < -100 || bx > w + 100) continue;

        ctx.fillStyle = b.color;
        ctx.fillRect(bx, groundY - b.height, b.width, b.height);

        // Windows (smaller, dimmer for distant buildings)
        for (const win of b.windows) {
          ctx.fillStyle = win.lit
            ? `rgba(232, 212, 77, ${0.3 + Math.sin(time * 0.02 + win.row + win.col) * 0.1})`
            : 'rgba(60, 60, 90, 0.3)';
          ctx.fillRect(
            bx + 6 + win.col * 10,
            groundY - b.height + 6 + win.row * 12,
            5, 7,
          );
        }
      }

      // Foreground buildings (closer - faster parallax)
      const fgSpeed = 0.8;
      const fgTotalWidth = buildings.length > 0
        ? buildings[buildings.length / 2 - 1].x + buildings[buildings.length / 2 - 1].width + 2
        : w;
      const fgOffset = (time * fgSpeed) % fgTotalWidth;

      for (const b of buildings) {
        const bx = b.x - fgOffset;
        if (bx + b.width < -100 || bx > w + 100) continue;

        ctx.fillStyle = b.color;
        ctx.fillRect(bx, groundY - b.height, b.width, b.height);

        // Antenna
        if (b.hasAntenna) {
          ctx.strokeStyle = '#444466';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(bx + b.width / 2, groundY - b.height);
          ctx.lineTo(bx + b.width / 2, groundY - b.height - 20);
          ctx.stroke();
          // Blinking light
          ctx.fillStyle = Math.sin(time * 0.05) > 0 ? '#ff3333' : '#660000';
          ctx.beginPath();
          ctx.arc(bx + b.width / 2, groundY - b.height - 20, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Windows
        for (const win of b.windows) {
          const flickr = Math.sin(time * 0.01 + win.row * 3.7 + win.col * 2.3);
          ctx.fillStyle = win.lit
            ? `rgba(232, 212, 77, ${0.6 + flickr * 0.15})`
            : COLORS.windowDim;
          ctx.fillRect(
            bx + 8 + win.col * 12,
            groundY - b.height + 8 + win.row * 14,
            7, 9,
          );
        }
      }

      // Sidewalk
      ctx.fillStyle = COLORS.sidewalk;
      ctx.fillRect(0, groundY, w, 6);

      // Road
      ctx.fillStyle = COLORS.road;
      ctx.fillRect(0, groundY + 6, w, roadH - 6);

      // Road edge stripe
      ctx.fillStyle = COLORS.roadEdge;
      ctx.fillRect(0, groundY + 6, w, 2);

      // Lane dashes (scrolling)
      const dashSpeed = 2.5;
      const dashLen = 40;
      const dashGap = 30;
      const dashY = groundY + roadH * 0.45;
      ctx.fillStyle = COLORS.roadLine;
      const totalDash = dashLen + dashGap;
      const dashOffset = (time * dashSpeed) % totalDash;
      for (let x = -dashOffset - dashLen; x < w + dashLen; x += totalDash) {
        ctx.fillRect(x, dashY, dashLen, 3);
      }

      // Cyclist
      const cyclistX = w * 0.3;
      drawCyclist(cyclistX, groundY + 6);

      // Subtle ground line at bottom
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, h - 2, w, 2);
    };

    const animate = () => {
      time++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
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
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
};

export default PunchoutBackground;
