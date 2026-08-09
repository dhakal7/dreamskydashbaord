import React, { useState } from 'react';
import { Navbar } from '@/components/website/layout/Navbar';
import { Footer } from '@/components/website/layout/Footer';
import { AuthModal } from '@/components/website/modals/AuthModal';

export const AustraliaPage: React.FC = () => {
  const [authModalState, setAuthModalState] = useState<{
    isOpen: boolean;
    tab: 'login' | 'signup' | 'consultation' | 'forgot';
  }>({ isOpen: false, tab: 'login' });

  const handleOpenAuth = (tab: 'login' | 'signup' | 'consultation' | 'forgot' = 'login') => {
    setAuthModalState({ isOpen: true, tab });
  };

  return (
    <div className="min-h-screen bg-[#FFFDFD] font-sans text-slate-900 antialiased selection:bg-rose-500 selection:text-white">
      <Navbar onOpenAuthModal={handleOpenAuth} />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center overflow-hidden pt-28 sm:pt-36 pb-20 sm:pb-28 bg-[#0A0A0A]" id="home">
        <div className="hero-bg-container overflow-hidden">
          <img 
            src="/australia_hero_fresh.jpg" 
            alt="Study in Australia Background" 
            className="w-full h-full object-cover object-center scale-105 transition-all duration-700 opacity-45"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=1920&q=80';
            }}
          />
        </div>
        <div className="hero-overlay"></div>

        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start pt-2 sm:pt-4">
            <div className="lg:col-span-5 space-y-6">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.12] drop-shadow-md">
                Study in Australia <br />
                <span className="text-redAccent">World Class Go8 Degrees, Vibrant Lifestyle</span>
              </h1>

              <p className="text-gray-200 text-lg sm:text-xl leading-relaxed font-normal max-w-xl drop-shadow">
                Australia is home to prestigious Group of Eight (Go8) universities, innovative research hubs, an unrivaled beach lifestyle, and up to 4 years of post study work visa rights for international graduates.
              </p>

              <div className="pt-2 space-y-3">
                <button 
                  onClick={() => handleOpenAuth('consultation')}
                  className="inline-flex items-center gap-3 px-7 py-4 bg-redAccent hover:bg-redAccentDark text-white font-extrabold text-sm rounded-full shadow-lg shadow-rose-600/30 transition-all duration-300 group hover:scale-[1.02] cursor-pointer"
                >
                  <i className="fas fa-calendar-alt text-base text-rose-200"></i>
                  <span>Book Free Australia Consultation</span>
                  <i className="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
                </button>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="grid grid-cols-2 gap-5 sm:gap-6 lg:gap-7">
                <div className="group rounded-3xl overflow-hidden shadow-2xl border-4 border-white/20 h-60 sm:h-72 lg:h-80 relative animate-float">
                  <img src="/assets/destinations/Australia/universities/uwa_-__university_of_western_australia-4293_a8a4da961a28422d9371071c2ad746e8.jpg" alt="Top Universities" className="w-full h-full object-cover group-hover:scale-110 transition-all duration-500" onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=800&q=80'; }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none z-10"></div>
                  <div className="absolute bottom-4 left-4 right-4 z-20">
                    <div className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">Top Universities</div>
                    <div className="text-xs text-rose-300">Go8 & QS Top 100</div>
                  </div>
                </div>

                <div className="group rounded-3xl overflow-hidden shadow-2xl border-4 border-white/20 h-60 sm:h-72 lg:h-80 relative animate-float-delayed">
                  <img src="/assets/opportunities/engineer.jpg" alt="Work Visa Rights" className="w-full h-full object-cover group-hover:scale-110 transition-all duration-500" onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&q=80'; }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none z-10"></div>
                  <div className="absolute bottom-4 left-4 right-4 z-20">
                    <div className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">Post-Study Work</div>
                    <div className="text-xs text-rose-300">Up to 4 Years Subclass 485</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Highlights */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-redAccent font-bold text-xs tracking-widest uppercase bg-red-50 px-4 py-2 rounded-full border border-red-100">Why Study in Australia</span>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mt-4">Unmatched Global Education & Career Horizons</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
            <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:border-redAccent/30 hover:shadow-xl transition">
              <i className="fas fa-university text-3xl text-redAccent mb-4"></i>
              <h3 className="text-xl font-bold text-slate-900 mb-2">QS Top 100 Excellence</h3>
              <p className="text-sm text-gray-600">Home to 7 of the world's top 100 universities and globally recognized degree credentials.</p>
            </div>
            <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:border-redAccent/30 hover:shadow-xl transition">
              <i className="fas fa-briefcase text-3xl text-redAccent mb-4"></i>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Part-Time Work Rights</h3>
              <p className="text-sm text-gray-600">Work up to 48 hours per fortnight during study terms and unlimited during scheduled breaks.</p>
            </div>
            <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:border-redAccent/30 hover:shadow-xl transition">
              <i className="fas fa-plane-arrival text-3xl text-redAccent mb-4"></i>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Permanent Residency Pathways</h3>
              <p className="text-sm text-gray-600">Generous regional migration incentives and skilled occupation lists for qualified graduates.</p>
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
