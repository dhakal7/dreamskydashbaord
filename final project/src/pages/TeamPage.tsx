import React, { useState } from 'react';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { AuthModal } from '../components/modals/AuthModal';

const teamMembers = [
  {
    name: 'Ashis Shrestha',
    role: 'Founder & CEO',
    image: '/ashis_shrestha.jpg',
    desc: 'Senior Education Consultant & Visionary leader with 15+ years guiding students globally.'
  },
  {
    name: 'Amisha Thapa',
    role: 'Senior Counselor',
    image: '/amisha_thapa.jpg',
    desc: 'Expert Australia & UK Admissions Advisor with exceptional visa processing track record.'
  },
  {
    name: 'Amit Dhodari',
    role: 'Counselor',
    image: '/amit_dhodari.jpg',
    desc: 'Specialist in Canada & USA university placements and SOP optimization.'
  },
  {
    name: 'Dipshikha Dawadi',
    role: 'Counselor',
    image: '/dipshikha_dawadi.jpg',
    desc: 'Dedicated Europe & NZ counselor assisting with scholarships and financial documentation.'
  },
  {
    name: 'Santona Khatri',
    role: 'Student Relations Head',
    image: '/santona_khatri.png',
    desc: 'Managing student onboarding, pre-departure briefings, and alumni network support.'
  }
];

export const TeamPage: React.FC = () => {
  const [authModalState, setAuthModalState] = useState<{
    isOpen: boolean;
    tab: 'login' | 'signup' | 'consultation' | 'forgot';
  }>({ isOpen: false, tab: 'login' });

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 antialiased">
      <Navbar onOpenAuthModal={(tab) => setAuthModalState({ isOpen: true, tab })} />

      <section className="pt-32 pb-20 bg-slate-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-redAccent font-bold text-xs tracking-widest uppercase bg-red-50 px-4 py-2 rounded-full border border-red-100">Meet Our Experts</span>
          <h2 className="text-4xl sm:text-5xl font-black text-slate-900 mt-4">The Team Behind Your Overseas Success</h2>
          <p className="text-gray-500 max-w-2xl mx-auto mt-4 text-base">
            Our certified counselors bring decades of combined experience, institutional knowledge, and dedicated 1-on-1 guidance.
          </p>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {teamMembers.map((member, idx) => (
              <div key={idx} className="team-card-cover float-idle group mx-auto" style={{ animationDelay: `${idx * 0.2}s` }}>
                <img src={member.image} alt={member.name} className="bg-img" />
                <div className="overlay-default z-10">
                  <div>
                    <div className="inline-block bg-black/75 backdrop-blur-md border border-white/20 text-white font-black text-lg px-4 py-2 rounded-xl">
                      {member.name}
                    </div>
                    <div className="text-xs text-rose-300 font-bold mt-2">
                      {member.role}
                    </div>
                  </div>
                </div>
                <div className="overlay-hover-popup z-20">
                  <h3 className="text-xl font-black text-white mb-1">{member.name}</h3>
                  <div className="text-xs text-rose-300 font-bold mb-3">{member.role}</div>
                  <p className="text-xs text-gray-300 leading-relaxed mb-4">{member.desc}</p>
                </div>
              </div>
            ))}
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
