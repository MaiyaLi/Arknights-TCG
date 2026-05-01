import React, { useEffect, useRef } from 'react';

export default function TerminalOverlay() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Ambient hum logic placeholder
    // In a real app, we'd handle user interaction to start audio
    const playHum = () => {
      if (audioRef.current) {
        audioRef.current.volume = 0.1;
        audioRef.current.play().catch(() => {
          // Autoplay might be blocked, ignore
        });
      }
    };

    window.addEventListener('click', playHum, { once: true });
    return () => window.removeEventListener('click', playHum);
  }, []);

  return (
    <>
      <div className="crt-overlay" />
      <div className="scanline" />
      <audio
        ref={audioRef}
        loop
        src="https://www.soundjay.com/mechanical/sounds/computer-hum-1.mp3"
      />
    </>
  );
}
