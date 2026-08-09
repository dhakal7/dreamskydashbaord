import React, { useState } from 'react';
import { Navbar } from '@/components/website/layout/Navbar';
import { Footer } from '@/components/website/layout/Footer';
import { AuthModal } from '@/components/website/modals/AuthModal';

export const TermsPage: React.FC = () => {
  const [authModalState, setAuthModalState] = useState<{
    isOpen: boolean;
    tab: 'login' | 'signup' | 'consultation' | 'forgot';
  }>({ isOpen: false, tab: 'login' });

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 antialiased">
      <Navbar onOpenAuthModal={(tab) => setAuthModalState({ isOpen: true, tab })} />

      <section className="pt-32 pb-16 bg-slate-50 border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-4xl font-black text-slate-900">Terms of Service</h1>
          <p className="text-gray-500 mt-2 text-sm">Last updated: August 2026</p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-8 text-gray-700 text-sm leading-relaxed">
          <p>
            Welcome to DreamSky Education Consultancy. By accessing our services, website, or consulting with our advisors, you agree to comply with the following terms and conditions.
          </p>
          <h2 className="text-xl font-bold text-slate-900">Consultancy Services</h2>
          <p>
            DreamSky provides expert guidance for university selection, documentation assistance, test preparation, and visa interview preparation. Admission and visa decisions remain at the sole discretion of respective universities and government embassy officials.
          </p>
          <h2 className="text-xl font-bold text-slate-900">Accuracy of Student Information</h2>
          <p>
            Students are responsible for providing authentic academic certificates, identity documents, and financial records for all application and visa filings.
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
