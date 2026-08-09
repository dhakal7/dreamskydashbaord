import React, { useState } from 'react';
import { Navbar } from '@/components/website/layout/Navbar';
import { Footer } from '@/components/website/layout/Footer';
import { AuthModal } from '@/components/website/modals/AuthModal';

export const MissionVisionPage: React.FC = () => {
  const [authModalState, setAuthModalState] = useState<{
    isOpen: boolean;
    tab: 'login' | 'signup' | 'consultation' | 'forgot';
  }>({ isOpen: false, tab: 'login' });

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 antialiased">
      <Navbar onOpenAuthModal={(tab) => setAuthModalState({ isOpen: true, tab })} />

      <section className="pt-32 pb-20 bg-slate-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-redAccent font-bold text-xs tracking-widest uppercase bg-red-50 px-4 py-2 rounded-full border border-red-100">Our Purpose</span>
          <h2 className="text-4xl sm:text-5xl font-black text-slate-900 mt-4">Mission, Vision & Core Values</h2>
          <p className="text-gray-500 max-w-2xl mx-auto mt-4 text-base">
            Guiding Nepali youth with integrity, transparency, and global opportunities.
          </p>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <div className="p-10 rounded-3xl bg-rose-50/50 border border-rose-100 flex flex-col md:flex-row gap-8 items-center">
            <div className="w-16 h-16 rounded-2xl bg-redAccent text-white flex items-center justify-center text-3xl shrink-0">
              <i className="fas fa-bullseye"></i>
            </div>
            <div>
              <h3 className="text-2xl font-extrabold text-slate-900 mb-3">Our Mission</h3>
              <p className="text-gray-600 text-base leading-relaxed">
                To provide ethical, transparent, and comprehensive education counseling and visa services that empower students from Nepal to achieve their academic aspirations at top global institutions.
              </p>
            </div>
          </div>

          <div className="p-10 rounded-3xl bg-blue-50/50 border border-blue-100 flex flex-col md:flex-row gap-8 items-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-3xl shrink-0">
              <i className="fas fa-eye"></i>
            </div>
            <div>
              <h3 className="text-2xl font-extrabold text-slate-900 mb-3">Our Vision</h3>
              <p className="text-gray-600 text-base leading-relaxed">
                To be Nepal's premier and most trusted international education consultancy, recognized worldwide for excellence, student success rates, and transformative global career pathways.
              </p>
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
