import React, { useEffect, useRef } from 'react';

const NatureBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    // Gradient background - sky to ground
    const drawBackground = () => {
      // Sky gradient (sunset/dusk colors)
      const skyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.6);
      skyGradient.addColorStop(0, '#2d1b4e'); // Deep purple at top
      skyGradient.addColorStop(0.3, '#4a2f6e'); // Purple
      skyGradient.addColorStop(0.6, '#6b4d8a'); // Lighter purple
      skyGradient.addColorStop(1, '#8b6fa8'); // Purple-pink horizon
      
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height * 0.6);

      // Ground gradient
      const groundGradient = ctx.createLinearGradient(0, canvas.height * 0.6, 0, canvas.height);
      groundGradient.addColorStop(0, '#1a3a2e'); // Dark green
      groundGradient.addColorStop(0.5, '#0f2419'); // Darker green
      groundGradient.addColorStop(1, '#0a1612'); // Almost black
      
      ctx.fillStyle = groundGradient;
      ctx.fillRect(0, canvas.height * 0.6, canvas.width, canvas.height * 0.4);
    };

    // Draw distant mountains
    const drawMountains = () => {
      ctx.fillStyle = 'rgba(40, 30, 60, 0.6)';
      
      // Mountain 1 (left)
      ctx.beginPath();
      ctx.moveTo(-100, canvas.height * 0.6);
      ctx.lineTo(canvas.width * 0.3, canvas.height * 0.35);
      ctx.lineTo(canvas.width * 0.5, canvas.height * 0.6);
      ctx.closePath();
      ctx.fill();

      // Mountain 2 (right)
      ctx.beginPath();
      ctx.moveTo(canvas.width * 0.4, canvas.height * 0.6);
      ctx.lineTo(canvas.width * 0.7, canvas.height * 0.3);
      ctx.lineTo(canvas.width + 100, canvas.height * 0.6);
      ctx.closePath();
      ctx.fill();
    };

    // Animated waterfall
    let waterfallParticles: Array<{x: number; y: number; speed: number; opacity: number}> = [];
    
    const initWaterfall = () => {
      waterfallParticles = [];
      const waterfallX = canvas.width * 0.75;
      const waterfallTop = canvas.height * 0.35;
      
      for (let i = 0; i < 100; i++) {
        waterfallParticles.push({
          x: waterfallX + (Math.random() - 0.5) * 30,
          y: waterfallTop + Math.random() * canvas.height * 0.25,
          speed: 2 + Math.random() * 3,
          opacity: 0.3 + Math.random() * 0.4,
        });
      }
    };

    const drawWaterfall = () => {
      const waterfallBottom = canvas.height * 0.6;
      
      waterfallParticles.forEach(particle => {
        // Draw particle
        ctx.fillStyle = `rgba(200, 220, 255, ${particle.opacity})`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 2, 0, Math.PI * 2);
        ctx.fill();

        // Update position
        particle.y += particle.speed;
        
        // Reset if reached bottom
        if (particle.y > waterfallBottom) {
          particle.y = canvas.height * 0.35;
          particle.opacity = 0.3 + Math.random() * 0.4;
        }
      });
    };

    // Animated campfire
    let fireParticles: Array<{x: number; y: number; vx: number; vy: number; life: number; size: number}> = [];
    
    const drawCampfire = () => {
      const fireX = canvas.width * 0.2;
      const fireY = canvas.height * 0.75;

      // Add new fire particles
      if (Math.random() < 0.3) {
        fireParticles.push({
          x: fireX + (Math.random() - 0.5) * 40,
          y: fireY,
          vx: (Math.random() - 0.5) * 2,
          vy: -2 - Math.random() * 3,
          life: 1.0,
          size: 10 + Math.random() * 15,
        });
      }

      // Draw and update fire particles
      fireParticles = fireParticles.filter(particle => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy *= 0.98; // Slow down
        particle.life -= 0.02;

        if (particle.life > 0) {
          const alpha = particle.life;
          const size = particle.size * particle.life;
          
          // Gradient from yellow to orange to red
          const gradient = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, size);
          if (particle.life > 0.6) {
            gradient.addColorStop(0, `rgba(255, 255, 100, ${alpha})`); // Bright yellow
            gradient.addColorStop(0.5, `rgba(255, 150, 0, ${alpha * 0.8})`); // Orange
            gradient.addColorStop(1, `rgba(255, 50, 0, ${alpha * 0.3})`); // Red
          } else {
            gradient.addColorStop(0, `rgba(255, 150, 0, ${alpha})`); // Orange
            gradient.addColorStop(0.5, `rgba(255, 50, 0, ${alpha * 0.7})`); // Red
            gradient.addColorStop(1, `rgba(100, 0, 0, ${alpha * 0.2})`); // Dark red
          }
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
          ctx.fill();

          return true;
        }
        return false;
      });

      // Draw campfire base (logs)
      ctx.fillStyle = '#3a2817';
      ctx.fillRect(fireX - 50, fireY + 10, 100, 15);
      ctx.fillRect(fireX - 40, fireY + 20, 80, 12);
    };

    // Floating fireflies/particles
    let fireflies: Array<{x: number; y: number; vx: number; vy: number; brightness: number; pulseSpeed: number}> = [];
    
    const initFireflies = () => {
      fireflies = [];
      for (let i = 0; i < 20; i++) {
        fireflies.push({
          x: Math.random() * canvas.width,
          y: canvas.height * 0.5 + Math.random() * canvas.height * 0.3,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          brightness: Math.random(),
          pulseSpeed: 0.02 + Math.random() * 0.03,
        });
      }
    };

    const drawFireflies = () => {
      fireflies.forEach(firefly => {
        // Pulse brightness
        firefly.brightness += firefly.pulseSpeed;
        if (firefly.brightness > 1 || firefly.brightness < 0) {
          firefly.pulseSpeed *= -1;
          firefly.brightness = Math.max(0, Math.min(1, firefly.brightness));
        }

        // Draw glow
        const gradient = ctx.createRadialGradient(firefly.x, firefly.y, 0, firefly.x, firefly.y, 15);
        gradient.addColorStop(0, `rgba(255, 255, 150, ${firefly.brightness * 0.8})`);
        gradient.addColorStop(0.5, `rgba(255, 255, 100, ${firefly.brightness * 0.3})`);
        gradient.addColorStop(1, 'rgba(255, 255, 100, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(firefly.x, firefly.y, 15, 0, Math.PI * 2);
        ctx.fill();

        // Update position
        firefly.x += firefly.vx;
        firefly.y += firefly.vy;

        // Bounce off edges
        if (firefly.x < 0 || firefly.x > canvas.width) firefly.vx *= -1;
        if (firefly.y < canvas.height * 0.5 || firefly.y > canvas.height * 0.8) firefly.vy *= -1;
      });
    };

    // Stars (subtle, in the sky)
    let stars: Array<{x: number; y: number; size: number; twinkle: number; twinkleSpeed: number}> = [];
    
    const initStars = () => {
      stars = [];
      for (let i = 0; i < 100; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height * 0.4,
          size: 1 + Math.random() * 2,
          twinkle: Math.random(),
          twinkleSpeed: 0.01 + Math.random() * 0.02,
        });
      }
    };

    const drawStars = () => {
      stars.forEach(star => {
        star.twinkle += star.twinkleSpeed;
        if (star.twinkle > 1 || star.twinkle < 0) {
          star.twinkleSpeed *= -1;
          star.twinkle = Math.max(0, Math.min(1, star.twinkle));
        }

        ctx.fillStyle = `rgba(255, 255, 255, ${star.twinkle * 0.6})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const animate = () => {
      // Draw all elements
      drawBackground();
      drawStars();
      drawMountains();
      drawWaterfall();
      drawFireflies();
      drawCampfire();

      animationId = requestAnimationFrame(animate);
    };

    // Initialize
    resizeCanvas();
    initWaterfall();
    initFireflies();
    initStars();
    animate();

    // Handle window resize
    const handleResize = () => {
      resizeCanvas();
      initWaterfall();
      initFireflies();
      initStars();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed top-0 left-0 w-full h-full -z-10"
      style={{ background: '#1a1a2e' }}
    />
  );
};

export default NatureBackground;
