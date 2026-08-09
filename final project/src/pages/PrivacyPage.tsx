import React, { useState } from 'react';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { AuthModal } from '../components/modals/AuthModal';

export const PrivacyPage: React.FC = () => {
  const [authModalState, setAuthModalState] = useState<{
    isOpen: boolean;
    tab: 'login' | 'signup' | 'consultation' | 'forgot';
  }>({ isOpen: false, tab: 'login' });

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 antialiased">
      <Navbar onOpenAuthModal={(tab) => setAuthModalState({ isOpen: true, tab })} />

      <section className="pt-32 pb-16 bg-slate-50 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-4xl font-black text-slate-900">Privacy Policy</h1>
          <p className="text-gray-500 mt-2 text-sm">Last updated: August 2026</p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-8 text-gray-700 text-sm leading-relaxed">
          <p>
            At DreamSky Education Consultancy, we respect your privacy and are committed to protecting the personal information you share with us during counseling, university admissions, and visa processing.
          </p>
          <h2 className="text-xl font-bold text-slate-900">Information Collection & Usage</h2>
          <p>
            We collect personal details such as your name, email, contact number, academic transcripts, and preferred study destinations strictly for processing university applications and visa documentation.
          </p>
          <h2 className="text-xl font-bold text-slate-900">Data Security</h2>
          <p>
            Your information is stored securely and never sold or distributed to unauthorized third parties. Personal data is shared solely with official partner universities and embassy immigration authorities upon your authorization.
          </p>
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
