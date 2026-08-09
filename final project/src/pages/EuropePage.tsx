import React, { useState } from 'react';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { AuthModal } from '../components/modals/AuthModal';

export const EuropePage: React.FC = () => {
  const [authModalState, setAuthModalState] = useState<{
    isOpen: boolean;
    tab: 'login' | 'signup' | 'consultation' | 'forgot';
  }>({ isOpen: false, tab: 'login' });

  return (
    <div className="min-h-screen bg-[#FFFDFD] font-sans text-slate-900 antialiased">
      <Navbar onOpenAuthModal={(tab) => setAuthModalState({ isOpen: true, tab })} />

      <section className="relative min-h-screen flex items-center overflow-hidden pt-28 sm:pt-36 pb-20 bg-[#0A0A0A]">
        <div className="hero-bg-container overflow-hidden">
          <img 
            src="/europe_destination.png" 
            alt="Study in Europe" 
            className="w-full h-full object-cover opacity-45"
            onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?w=1920&q=80'; }}
          />
        </div>
        <div className="hero-overlay"></div>

        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <div className="max-w-3xl space-y-6">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.12]">
              Study in Europe <br />
              <span className="text-redAccent">Low/Zero Tuition Fees & Schengen Travel Access</span>
            </h1>
            <p className="text-gray-200 text-lg leading-relaxed">
              Explore Germany, France, Netherlands, Finland & Sweden. Access zero tuition public universities, English-taught programs, and Schengen visa travel across 27 EU nations.
            </p>
            <button 
              onClick={() => setAuthModalState({ isOpen: true, tab: 'consultation' })}
              className="px-7 py-4 bg-redAccent hover:bg-redAccentDark text-white font-extrabold text-sm rounded-full shadow-lg transition duration-300 cursor-pointer"
            >
              Book Free Europe Consultation
            </button>
          </div>
        </div>
      </section>

      <Footer />
      <AuthModal 
        isOpen={authModalState.isOpen}
        initialTab={authModalState.tab}
        onClose={() => setAuthModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
