import React, { useState } from 'react';
import { Navbar } from '../components/layout/Navbar';
import { HeroSection } from '../components/landing/HeroSection';
import { DestinationsSection } from '../components/landing/DestinationsSection';
import { UniversitiesSection } from '../components/landing/UniversitiesSection';
import { ServicesSection } from '../components/landing/ServicesSection';
import { WhyUsSection } from '../components/landing/WhyUsSection';
import { TestPrepSection } from '../components/landing/TestPrepSection';
import { FAQSection } from '../components/landing/FAQSection';
import { ContactSection } from '../components/landing/ContactSection';
import { Footer } from '../components/layout/Footer';
import { AuthModal } from '../components/modals/AuthModal';

export const HomePage: React.FC = () => {
  const [authModalState, setAuthModalState] = useState<{
    isOpen: boolean;
    tab: 'login' | 'signup' | 'consultation' | 'forgot';
  }>({
    isOpen: false,
    tab: 'login',
  });

  const handleOpenAuthModal = (tab: 'login' | 'signup' | 'consultation' | 'forgot' = 'login') => {
    setAuthModalState({ isOpen: true, tab });
  };

  const handleCloseAuthModal = () => {
    setAuthModalState((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <div className="min-h-screen bg-white font-sans text-gray-700 antialiased selection:bg-redAccent selection:text-white">
      <Navbar onOpenAuthModal={handleOpenAuthModal} />
      <main>
        <HeroSection />
        <DestinationsSection />
        <UniversitiesSection />
        <ServicesSection />
        <WhyUsSection />
        <TestPrepSection />
        <FAQSection />
        <ContactSection />
      </main>
      <Footer />
      <AuthModal
        isOpen={authModalState.isOpen}
        initialTab={authModalState.tab}
        onClose={handleCloseAuthModal}
      />
    </div>
  );
};
