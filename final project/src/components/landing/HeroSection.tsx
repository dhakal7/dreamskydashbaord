import React, { useState, useEffect, useRef } from 'react';

const slideImages = [
  '/hero_bg2.jpg',
  '/hero_bg3.jpg',
  '/assets/student life/student1.jpg',
  '/assets/opportunities/engineer.jpg',
  '/assets/student life/camp.jpg',
  '/assets/opportunities/doctor.jpg',
  '/assets/uk_hero_photo.jpg',
  '/assets/student life/studentere.jpg',
  '/assets/opportunities/law.jpg',
  '/assets/student life/std.jpg',
  '/assets/opportunities/0bbd51b0158c6fd07bc44477a7886c53.jpg',
  '/assets/student life/0131c20eed0a951cef9f44bc620d02ff.jpg',
  '/assets/opportunities/fkfs.jpg',
  '/assets/destinations/Australia/universities/uwa_-__university_of_western_australia-4293_a8a4da961a28422d9371071c2ad746e8.jpg',
  'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1920&q=80',
  'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1920&q=80'
];

export const HeroSection: React.FC = () => {
  const [isVideoEnded, setIsVideoEnded] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isVideoEnded) {
      interval = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % slideImages.length);
      }, 6000);
    }
    return () => clearInterval(interval);
  }, [isVideoEnded]);

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      const nextMuted = !videoRef.current.muted;
      videoRef.current.muted = nextMuted;
      videoRef.current.volume = nextMuted ? 0 : 1.0;
      setIsMuted(nextMuted);
    }
  };

  const handleHeroClick = () => {
    if (videoRef.current && isMuted && !isVideoEnded) {
      videoRef.current.muted = false;
      videoRef.current.volume = 1.0;
      setIsMuted(false);
    }
  };

  return (
    <section 
      className="relative min-h-[90vh] lg:min-h-screen flex items-center overflow-hidden pt-28 pb-20 cursor-pointer" 
      id="home"
      onClick={handleHeroClick}
    >
      {/* Dynamic Background Container */}
      <div className="hero-bg-container">
        <video 
          ref={videoRef}
          className="hero-video" 
          id="heroVideo" 
          autoPlay 
          muted 
          playsInline 
          poster="/Dream Sky Logo.jpeg"
          onEnded={() => setIsVideoEnded(true)}
          onError={() => setIsVideoEnded(true)}
          style={{
            opacity: isVideoEnded ? 0 : 1,
            display: isVideoEnded ? 'none' : 'block',
            transition: 'opacity 1.5s ease-in-out'
          }}
        >
          <source src="/Airplane_to_logo_animation_202607241246.mp4" type="video/mp4" />
        </video>

        {/* Cinematic Image Slides */}
        {slideImages.map((src, idx) => (
          <img
            key={idx}
            src={src}
            alt={`Slide ${idx + 1}`}
            className={`hero-slide ${isVideoEnded && currentSlide === idx ? 'active' : ''}`}
          />
        ))}
      </div>

      {/* Dark Overlay */}
      <div className="hero-overlay"></div>

      {/* Sound Toggle Control */}
      {!isVideoEnded && (
        <button 
          onClick={toggleSound}
          type="button" 
          className="absolute bottom-6 right-6 z-20 bg-black/60 hover:bg-redAccent text-white text-xs font-bold px-4 py-2.5 rounded-full backdrop-blur-md border border-white/20 transition-all duration-300 flex items-center gap-2 shadow-lg group cursor-pointer" 
          title="Toggle Video Audio"
        >
          <i className={`fas ${isMuted ? 'fa-volume-mute' : 'fa-volume-up text-green-400'} group-hover:scale-110 transition-transform`}></i>
          <span>{isMuted ? 'Enable Video Audio' : 'Audio Enabled'}</span>
        </button>
      )}

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-4 pl-4 sm:pl-6 lg:pl-4">
        <div className="max-w-3xl">
          <h1 className="text-4xl sm:text-6xl lg:text-6xl font-bold tracking-tight text-white leading-[1.12]">
            Empowering Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-rose-300 to-amber-200">Global Education</span> Journey
          </h1>
          
          <p className="text-base sm:text-lg text-white/80 max-w-2xl mt-6 leading-relaxed font-normal">
            Guiding ambitious students across Nepal with expert counseling, university selection, test preparation, and guaranteed visa support for USA, Canada, UK, Australia, Europe & New Zealand.
          </p>

          <div className="flex flex-wrap gap-4 mt-9">
            <a href="#contact" className="bg-redAccent text-white font-semibold px-7 py-3.5 rounded-full hover:bg-redAccentDark transition duration-300 shadow-lg shadow-redAccent/25 flex items-center gap-2.5 text-sm">
              <i className="fas fa-calendar-alt text-xs"></i> Start Free Assessment
            </a>
            <a href="#destinations" className="bg-white/10 hover:bg-white/20 text-white font-semibold px-7 py-3.5 rounded-full backdrop-blur-md border border-white/20 transition duration-300 flex items-center gap-2.5 text-sm">
              Explore Destinations <i className="fas fa-compass text-xs text-red-300"></i>
            </a>
          </div>

          <div className="mt-10 sm:mt-12">
            <div className="inline-block bg-black/25 backdrop-blur-md rounded-2xl p-4 sm:p-5 max-w-2xl">
              <div className="flex items-start gap-2.5">
                <span className="text-red-400 text-2xl sm:text-3xl font-serif leading-none shrink-0 font-bold">“</span>
                <p className="text-sm sm:text-base text-white/95 font-medium italic leading-relaxed drop-shadow-md">
                  Education changes lives. We simply open the doors.
                </p>
              </div>
              <div className="text-right text-xs text-rose-200/90 font-bold tracking-wide mt-2 drop-shadow-sm">
                — Ashis Shrestha, <span className="text-white/80 font-normal">Founder & CEO of DreamSky</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
