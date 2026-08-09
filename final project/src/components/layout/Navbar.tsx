import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface NavbarProps {
  onOpenAuthModal: (tab: 'login' | 'signup' | 'consultation' | 'forgot') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAuthModal }) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const hero = document.getElementById('home');
      const heroHeight = hero ? hero.offsetHeight : 600;
      const threshold = Math.max(100, heroHeight - 80);
      if (window.scrollY > threshold) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleScroll);
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  const closeMobile = () => setMobileMenuOpen(false);

  return (
    <>
      {/* Mobile Drawer Overlay */}
      <div 
        className={`mobile-overlay ${mobileMenuOpen ? 'active' : ''}`}
        onClick={closeMobile}
      />

      {/* Mobile Menu Drawer */}
      <div className={`mobile-menu ${mobileMenuOpen ? 'open' : ''}`}>
        <Link to="/" onClick={closeMobile} className="block py-3.5 text-[#0A0A0A] font-semibold border-b border-gray-100 hover:text-redAccent transition">
          Home
        </Link>
        
        <div className="border-b border-gray-100 py-3">
          <div className="text-[#0A0A0A] font-bold text-sm mb-2 text-redAccent">About Us</div>
          <div className="pl-4 space-y-2 text-xs font-semibold">
            <Link to="/mission-vision" onClick={closeMobile} className="block py-1 text-gray-600 hover:text-redAccent">Mission and Vision</Link>
            <Link to="/team" onClick={closeMobile} className="block py-1 text-gray-600 hover:text-redAccent">Our Team</Link>
          </div>
        </div>

        <div className="border-b border-gray-100 py-3">
          <div className="text-[#0A0A0A] font-bold text-sm mb-2 text-redAccent">Destinations</div>
          <div className="pl-4 space-y-2 text-xs font-semibold">
            <Link to="/australia" onClick={closeMobile} className="block py-1 text-gray-600 hover:text-redAccent">🇦🇺 Study in Australia</Link>
            <Link to="/canada" onClick={closeMobile} className="block py-1 text-gray-600 hover:text-redAccent">🇨🇦 Study in Canada</Link>
            <Link to="/uk" onClick={closeMobile} className="block py-1 text-gray-600 hover:text-redAccent">🇬🇧 Study in UK</Link>
            <Link to="/usa" onClick={closeMobile} className="block py-1 text-gray-600 hover:text-redAccent">🇺🇸 Study in USA</Link>
            <Link to="/newzealand" onClick={closeMobile} className="block py-1 text-gray-600 hover:text-redAccent">🇳🇿 Study in New Zealand</Link>
            <Link to="/europe" onClick={closeMobile} className="block py-1 text-gray-600 hover:text-redAccent">🇪🇺 Study in Europe</Link>
          </div>
        </div>

        <a href="/#partners" onClick={closeMobile} className="block py-3.5 text-[#0A0A0A] font-semibold border-b border-gray-100 hover:text-redAccent transition">Universities</a>
        <a href="/#journey" onClick={closeMobile} className="block py-3.5 text-[#0A0A0A] font-semibold border-b border-gray-100 hover:text-redAccent transition">Study Journey</a>
        
        <button 
          onClick={() => { closeMobile(); onOpenAuthModal('login'); }}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-rose-50 text-gray-900 border border-rose-200 font-bold py-3 rounded-full hover:bg-redAccent hover:text-white transition shadow-sm cursor-pointer"
        >
          <i className="fas fa-user-circle text-base text-redAccent"></i> Login
        </button>

        <a 
          href="/#contact" 
          onClick={closeMobile}
          className="mt-3 block w-full text-center bg-redAccent text-white font-semibold py-3.5 rounded-full hover:bg-redAccentDark transition shadow-md"
        >
          Book Free Consultation
        </a>
      </div>

      {/* Main Glass Header */}
      <header className={`fixed top-0 left-0 w-full z-50 glass-nav ${scrolled ? 'scrolled' : ''}`} id="header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <Link to="/" className="flex items-center gap-3 group">
              <img src="/Dream Sky Logo.jpeg" alt="DreamSky" className="w-10 h-10 rounded-xl object-contain bg-white p-1 shadow-md border border-gray-100 group-hover:scale-105 transition-transform duration-300" />
              <div className="nav-logo-text font-bold text-xl leading-tight tracking-tight">Dream<span className="text-blue-600">Sky</span></div>
            </Link>

            <nav className="hidden xl:flex items-center gap-8">
              <Link to="/" className="nav-link text-sm py-1">Home</Link>
              
              {/* About Us Dropdown Menu */}
              <div className="relative group py-2">
                <a href="/#about" className="nav-link text-sm py-1 inline-flex items-center gap-1.5 cursor-pointer">
                  <span>About Us</span>
                  <i className="fas fa-chevron-down text-[10px] opacity-80 group-hover:rotate-180 transition-transform duration-300"></i>
                </a>

                {/* Dropdown Popup Card */}
                <div className="absolute top-full left-0 w-56 bg-white/95 backdrop-blur-xl rounded-2xl p-2 shadow-2xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 z-50">
                  <Link to="/mission-vision" className="flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold text-gray-700 hover:text-redAccent hover:bg-rose-50/80 hover:translate-x-1 transition-all duration-200 group/item">
                    <i className="fas fa-bullseye text-redAccent w-4 text-center group-hover/item:scale-110 transition-transform"></i>
                    <span>Mission and Vision</span>
                  </Link>
                  <Link to="/team" className="flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold text-gray-700 hover:text-redAccent hover:bg-rose-50/80 hover:translate-x-1 transition-all duration-200 group/item">
                    <i className="fas fa-users text-redAccent w-4 text-center group-hover/item:scale-110 transition-transform"></i>
                    <span>Our Team</span>
                  </Link>
                </div>
              </div>

              {/* Destinations Dropdown Menu */}
              <div className="relative group py-2">
                <a href="/#destinations" className="nav-link text-sm py-1 inline-flex items-center gap-1.5 cursor-pointer">
                  <span>Destinations</span>
                  <i className="fas fa-chevron-down text-[10px] opacity-80 group-hover:rotate-180 transition-transform duration-300"></i>
                </a>

                {/* Dropdown Popup Card */}
                <div className="absolute top-full left-0 w-60 bg-white/95 backdrop-blur-xl rounded-2xl p-2 shadow-2xl border border-gray-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 z-50">
                  <Link to="/australia" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-gray-700 hover:text-redAccent hover:bg-rose-50/80 hover:translate-x-1 transition-all duration-200 group/item">
                    <span className="text-base group-hover/item:scale-125 transition-transform">🇦🇺</span>
                    <span>Study in Australia</span>
                  </Link>
                  <Link to="/canada" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-gray-700 hover:text-redAccent hover:bg-rose-50/80 hover:translate-x-1 transition-all duration-200 group/item">
                    <span className="text-base group-hover/item:scale-125 transition-transform">🇨🇦</span>
                    <span>Study in Canada</span>
                  </Link>
                  <Link to="/uk" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-gray-700 hover:text-redAccent hover:bg-rose-50/80 hover:translate-x-1 transition-all duration-200 group/item">
                    <span className="text-base group-hover/item:scale-125 transition-transform">🇬🇧</span>
                    <span>Study in UK</span>
                  </Link>
                  <Link to="/usa" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-gray-700 hover:text-redAccent hover:bg-rose-50/80 hover:translate-x-1 transition-all duration-200 group/item">
                    <span className="text-base group-hover/item:scale-125 transition-transform">🇺🇸</span>
                    <span>Study in USA</span>
                  </Link>
                  <Link to="/newzealand" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-gray-700 hover:text-redAccent hover:bg-rose-50/80 hover:translate-x-1 transition-all duration-200 group/item">
                    <span className="text-base group-hover/item:scale-125 transition-transform">🇳🇿</span>
                    <span>Study in New Zealand</span>
                  </Link>
                  <Link to="/europe" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-gray-700 hover:text-redAccent hover:bg-rose-50/80 hover:translate-x-1 transition-all duration-200 group/item">
                    <span className="text-base group-hover/item:scale-125 transition-transform">🇪🇺</span>
                    <span>Study in Europe</span>
                  </Link>
                </div>
              </div>

              <a href="/#partners" className="nav-link text-sm py-1">Universities</a>
              <a href="/#journey" className="nav-link text-sm py-1">Journey</a>
              <a href="/#contact" className="nav-link text-sm py-1">Contact</a>
            </nav>

            <div className="flex items-center gap-2.5">
              <button 
                onClick={() => onOpenAuthModal('login')} 
                className="nav-login-btn hidden sm:inline-flex items-center gap-2 text-xs font-semibold px-5 py-2.5 rounded-full transition transform hover:-translate-y-0.5 shadow-md hover:shadow-lg cursor-pointer"
              >
                <i className="fas fa-user-circle text-sm"></i> Login
              </button>
              <a href="/#contact" className="nav-cta-btn hidden sm:inline-flex text-xs font-semibold px-5 py-2.5 rounded-full transition transform hover:-translate-y-0.5 shadow-md hover:shadow-lg">
                Book Consultation <i className="fas fa-arrow-right ml-2 my-auto group-hover:translate-x-1 transition-transform"></i>
              </a>
              <button 
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="xl:hidden p-2 text-white hover:text-redAccent hover:scale-110 transition focus:outline-none hamburger-icon" 
                aria-label="Toggle Navigation"
              >
                <i className="fas fa-bars text-2xl"></i>
              </button>
            </div>
          </div>
        </div>
      </header>
    </>
  );
};
