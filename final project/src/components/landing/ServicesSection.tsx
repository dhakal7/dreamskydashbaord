import React from 'react';

const services = [
  {
    title: 'Career Counseling',
    desc: 'Personalized 1-on-1 guidance to select degrees aligned with your career ambition and financial budget.',
    icon: 'fa-user-tie',
    color: 'bg-rose-50 text-redAccent'
  },
  {
    title: 'University Placements',
    desc: 'Direct applications to 300+ QS top-ranked partner institutions across Australia, UK, USA, Canada, NZ & Europe.',
    icon: 'fa-building-columns',
    color: 'bg-blue-50 text-blue-600'
  },
  {
    title: 'Visa Guidance & Drills',
    desc: 'Flawless financial proofing, GTE/GS statement reviews, and mock embassy interview preparation.',
    icon: 'fa-passport',
    color: 'bg-amber-50 text-amber-600'
  },
  {
    title: 'Test Preparation',
    desc: 'Intensive coaching for IELTS, PTE, TOEFL, and SAT with daily practice sessions and certified trainers.',
    icon: 'fa-pen-to-square',
    color: 'bg-emerald-50 text-emerald-600'
  },
  {
    title: 'Scholarship Assistance',
    desc: 'Maximizing merit awards, bursaries, and tuition fee discounts at premier global universities.',
    icon: 'fa-award',
    color: 'bg-purple-50 text-purple-600'
  },
  {
    title: 'Pre-Departure Support',
    desc: 'Accommodation arrangement, flight bookings, student Forex transfers, and airport pickup assistance.',
    icon: 'fa-plane-departure',
    color: 'bg-indigo-50 text-indigo-600'
  }
];

export const ServicesSection: React.FC = () => {
  return (
    <section className="py-20 bg-slate-50 border-t border-gray-100" id="services">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="text-redAccent font-bold text-xs tracking-[0.2em] uppercase bg-red-50 px-4 py-2 rounded-full border border-red-100">
            WHAT WE OFFER
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#0A0A0A] mt-4 tracking-tight">
            Comprehensive <span className="text-redAccent">Study Abroad Services</span>
          </h2>
          <p className="text-gray-500 mt-3 text-base">
            From initial counseling to landing at your university, we handle every detail with precision.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, idx) => (
            <div 
              key={idx} 
              className="p-8 rounded-3xl bg-white border border-gray-100 shadow-sm hover:shadow-xl hover:border-rose-200 transition-all duration-300 group"
            >
              <div className={`w-14 h-14 rounded-2xl ${service.color} flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform`}>
                <i className={`fas ${service.icon}`}></i>
              </div>
              <h3 className="text-xl font-bold text-[#0A0A0A] mb-3 group-hover:text-redAccent transition-colors">
                {service.title}
              </h3>
              <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
                {service.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
