import React, { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkleSpeed: number;
  twinkleOffset: number;
}

interface ShootingStar {
  x: number;
  y: number;
  angle: number;
  speed: number;
  length: number;
  opacity: number;
  active: boolean;
}

interface AmbientStarfieldProps {
  opacity?: number; // Overall opacity of the starfield (0-1)
  starCount?: number; // Number of stars
  shootingStarInterval?: number; // Milliseconds between shooting stars (0 to disable)
}

const AmbientStarfield: React.FC<AmbientStarfieldProps> = ({ 
  opacity = 0.4, 
  starCount = 150,
  shootingStarInterval = 8000
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let stars: Star[] = [];
    let shootingStars: ShootingStar[] = [];
    let lastShootingStarTime = 0;
    const starColors = [
      { r: 200, g: 210, b: 255 }, // Blue-white
      { r: 255, g: 240, b: 220 }, // Warm white
      { r: 180, g: 200, b: 255 }, // Cool blue
      { r: 255, g: 220, b: 180 }, // Warm yellow
    ];

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const initStars = () => {
      stars = [];
      for (let i = 0; i < starCount; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 1.5 + 0.5,
          opacity: Math.random() * 0.5 + 0.3,
          twinkleSpeed: Math.random() * 0.02 + 0.005,
          twinkleOffset: Math.random() * Math.PI * 2,
        });
      }
    };

    const spawnShootingStar = () => {
      // Start from top-right area, move toward bottom-left
      const startX = canvas.width * 0.3 + Math.random() * canvas.width * 0.7;
      const startY = Math.random() * canvas.height * 0.3;
      
      shootingStars.push({
        x: startX,
        y: startY,
        angle: Math.PI * 0.7 + Math.random() * 0.2, // Mostly diagonal down-left
        speed: 8 + Math.random() * 6,
        length: 80 + Math.random() * 60,
        opacity: 1,
        active: true,
      });
    };

    const animate = (time: number) => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw twinkling stars
      for (const star of stars) {
        const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
        const currentOpacity = star.opacity * (0.6 + twinkle * 0.4);
        const currentSize = star.size * (0.9 + twinkle * 0.1);
        
        // Pick a color based on star position (deterministic)
        const colorIndex = Math.floor((star.x + star.y) * 0.01) % starColors.length;
        const color = starColors[colorIndex];

        // Draw glow
        const gradient = ctx.createRadialGradient(
          star.x, star.y, 0,
          star.x, star.y, currentSize * 3
        );
        gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${currentOpacity * 0.8})`);
        gradient.addColorStop(0.5, `rgba(${color.r}, ${color.g}, ${color.b}, ${currentOpacity * 0.3})`);
        gradient.addColorStop(1, 'transparent');
        
        ctx.beginPath();
        ctx.arc(star.x, star.y, currentSize * 3, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw star core
        ctx.beginPath();
        ctx.arc(star.x, star.y, currentSize, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${currentOpacity})`;
        ctx.fill();
      }

      // Handle shooting stars
      if (shootingStarInterval > 0 && time - lastShootingStarTime > shootingStarInterval) {
        spawnShootingStar();
        lastShootingStarTime = time;
      }

      // Draw and update shooting stars
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const ss = shootingStars[i];
        
        if (!ss.active) {
          shootingStars.splice(i, 1);
          continue;
        }

        // Update position
        ss.x += Math.cos(ss.angle) * ss.speed;
        ss.y += Math.sin(ss.angle) * ss.speed;
        ss.opacity -= 0.015;

        // Draw shooting star trail
        const tailX = ss.x - Math.cos(ss.angle) * ss.length;
        const tailY = ss.y - Math.sin(ss.angle) * ss.length;

        const gradient = ctx.createLinearGradient(tailX, tailY, ss.x, ss.y);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(0.5, `rgba(200, 220, 255, ${ss.opacity * 0.3})`);
        gradient.addColorStop(1, `rgba(255, 255, 255, ${ss.opacity * 0.8})`);

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(ss.x, ss.y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw bright head
        ctx.beginPath();
        ctx.arc(ss.x, ss.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${ss.opacity})`;
        ctx.fill();

        // Deactivate if off screen or faded
        if (ss.opacity <= 0 || ss.x < -100 || ss.x > canvas.width + 100 || 
            ss.y < -100 || ss.y > canvas.height + 100) {
          ss.active = false;
        }
      }

      animationId = requestAnimationFrame(animate);
    };

    // Initialize
    resizeCanvas();
    initStars();
    animate(0);

    // Handle resize
    const handleResize = () => {
      resizeCanvas();
      initStars();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, [starCount, shootingStarInterval]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, opacity }}
    />
  );
};

export default AmbientStarfield;
