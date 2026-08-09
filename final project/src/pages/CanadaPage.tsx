import React, { useState } from 'react';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { AuthModal } from '../components/modals/AuthModal';

export const CanadaPage: React.FC = () => {
  const [authModalState, setAuthModalState] = useState<{
    isOpen: boolean;
    tab: 'login' | 'signup' | 'consultation' | 'forgot';
  }>({ isOpen: false, tab: 'login' });

  const handleOpenAuth = (tab: 'login' | 'signup' | 'consultation' | 'forgot' = 'login') => {
    setAuthModalState({ isOpen: true, tab });
  };

  return (
    <div className="min-h-screen bg-[#FFFDFD] font-sans text-slate-900 antialiased">
      <Navbar onOpenAuthModal={handleOpenAuth} />

      <section className="relative min-h-screen flex items-center overflow-hidden pt-28 sm:pt-36 pb-20 sm:pb-28 bg-[#0A0A0A]" id="home">
        <div className="hero-bg-container overflow-hidden">
          <img 
            src="/canada_hero_photo.jpg" 
            alt="Study in Canada Background" 
            className="w-full h-full object-cover object-center scale-105 opacity-45"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1503614472-8c93d56e92ce?w=1920&q=80';
            }}
          />
        </div>
        <div className="hero-overlay"></div>

        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start pt-2">
            <div className="lg:col-span-6 space-y-6">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.12]">
                Study in Canada <br />
                <span className="text-redAccent">Top Tier Degrees & Express Entry PR Pathways</span>
              </h1>

              <p className="text-gray-200 text-lg leading-relaxed max-w-xl">
                Canada offers world-renowned universities, high standard of living, 3-year Post Graduation Work Permits (PGWP), and direct pathways to permanent residency.
              </p>

              <button 
                onClick={() => handleOpenAuth('consultation')}
                className="inline-flex items-center gap-3 px-7 py-4 bg-redAccent hover:bg-redAccentDark text-white font-extrabold text-sm rounded-full shadow-lg transition duration-300 cursor-pointer"
              >
                <i className="fas fa-calendar-alt text-base"></i>
                <span>Book Free Canada Assessment</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-redAccent font-bold text-xs tracking-widest uppercase bg-red-50 px-4 py-2 rounded-full border border-red-100">Why Canada</span>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mt-4">Top Academic Reputation & Friendly Immigration</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
            <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100">
              <i className="fas fa-award text-3xl text-redAccent mb-4"></i>
              <h3 className="text-xl font-bold mb-2">3-Year PGWP</h3>
              <p className="text-sm text-gray-600">Eligible graduates receive up to 3 years post-graduation work permit with full employment rights.</p>
            </div>
            <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100">
              <i className="fas fa-shield-alt text-3xl text-redAccent mb-4"></i>
              <h3 className="text-xl font-bold mb-2">Safe & Inclusive</h3>
              <p className="text-sm text-gray-600">Consistently ranked among the safest and most welcoming multicultural countries globally.</p>
            </div>
            <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100">
              <i className="fas fa-id-card text-3xl text-redAccent mb-4"></i>
              <h3 className="text-xl font-bold mb-2">PR Friendly</h3>
              <p className="text-sm text-gray-600">Streamlined PR pathways via Express Entry, Provincial Nominee Programs (PNP), and Canadian Experience Class.</p>
            </div>
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
