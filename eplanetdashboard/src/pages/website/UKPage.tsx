import React, { useState } from 'react';
import { Navbar } from '@/components/website/layout/Navbar';
import { Footer } from '@/components/website/layout/Footer';
import { AuthModal } from '@/components/website/modals/AuthModal';

export const UKPage: React.FC = () => {
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
            src="/uk_hero_photo.jpg" 
            alt="Study in UK" 
            className="w-full h-full object-cover opacity-45"
            onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1529655683826-aba9b3e77383?w=1920&q=80'; }}
          />
        </div>
        <div className="hero-overlay"></div>

        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <div className="max-w-3xl space-y-6">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.12]">
              Study in the United Kingdom <br />
              <span className="text-redAccent">1-Year Master's & 2-Year Graduate Route Visa</span>
            </h1>
            <p className="text-gray-200 text-lg leading-relaxed">
              Experience centuries of academic excellence, shorter 1-year master's programs, and 2 years of post-study work visa rights in London and top UK university towns.
            </p>
            <button 
              onClick={() => setAuthModalState({ isOpen: true, tab: 'consultation' })}
              className="px-7 py-4 bg-redAccent hover:bg-redAccentDark text-white font-extrabold text-sm rounded-full shadow-lg transition duration-300 cursor-pointer"
            >
              Book Free UK Consultation
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
