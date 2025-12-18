import React, { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  z: number;
  pz: number;
}

const StarfieldBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let stars: Star[] = [];
    const numStars = 800;
    const speed = 2;
    const starColor = { r: 200, g: 210, b: 255 };

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const initStars = () => {
      stars = [];
      for (let i = 0; i < numStars; i++) {
        stars.push({
          x: Math.random() * canvas.width - canvas.width / 2,
          y: Math.random() * canvas.height - canvas.height / 2,
          z: Math.random() * canvas.width,
          pz: 0,
        });
      }
    };

    const animate = () => {
      // Clear with fade effect for trails
      ctx.fillStyle = 'rgba(30, 31, 34, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        // Move star closer
        star.pz = star.z;
        star.z -= speed;

        // Reset star if it's too close
        if (star.z <= 0) {
          star.x = Math.random() * canvas.width - centerX;
          star.y = Math.random() * canvas.height - centerY;
          star.z = canvas.width;
          star.pz = canvas.width;
        }

        // Project 3D position to 2D
        const sx = (star.x / star.z) * canvas.width + centerX;
        const sy = (star.y / star.z) * canvas.height + centerY;
        const px = (star.x / star.pz) * canvas.width + centerX;
        const py = (star.y / star.pz) * canvas.height + centerY;

        // Only draw if on screen
        if (sx >= 0 && sx <= canvas.width && sy >= 0 && sy <= canvas.height) {
          // Calculate size and brightness based on distance
          const size = Math.max(0.5, (1 - star.z / canvas.width) * 3);
          const brightness = 1 - star.z / canvas.width;

          // Draw the star trail
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(sx, sy);
          ctx.strokeStyle = `rgba(${starColor.r}, ${starColor.g}, ${starColor.b}, ${brightness * 0.5})`;
          ctx.lineWidth = size * 0.5;
          ctx.stroke();

          // Draw the star
          ctx.beginPath();
          ctx.arc(sx, sy, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${starColor.r}, ${starColor.g}, ${starColor.b}, ${brightness})`;
          ctx.fill();
        }
      }

      animationId = requestAnimationFrame(animate);
    };

    // Initialize
    resizeCanvas();
    initStars();
    animate();

    // Handle resize
    window.addEventListener('resize', () => {
      resizeCanvas();
      initStars();
    });

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
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

export default StarfieldBackground;
