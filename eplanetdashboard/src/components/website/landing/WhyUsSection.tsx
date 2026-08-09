import React from 'react';

const steps = [
  {
    num: '01',
    title: 'Career Counselling',
    desc: 'Confused about your future? Get 1-on-1 expert advice tailored strictly to your academic goals and budget.',
    image: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=700&h=500&fit=crop&crop=center',
    delay: '0s'
  },
  {
    num: '02',
    title: 'Test Preparation',
    desc: 'Boost your scores with expert IELTS, PTE, TOEFL & SAT coaching, real exam strategies, and full mock test series.',
    image: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=700&h=500&fit=crop&crop=center',
    delay: '0.2s'
  },
  {
    num: '03',
    title: 'Application Assistance',
    desc: 'Maximize your chances of admission with error-free file processing, professional SOP review, and LOR verification.',
    image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=700&h=500&fit=crop&crop=center',
    delay: '0.4s'
  },
  {
    num: '04',
    title: 'University Selection',
    desc: 'We shortlist top QS ranked universities where you have the highest chance of acceptance & scholarship approval.',
    image: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=700&q=80',
    delay: '0.6s'
  },
  {
    num: '05',
    title: 'Scholarship Matching',
    desc: 'Identify and apply for institutional merit grants, bursaries, and fully-funded government scholarships worldwide.',
    image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=700&h=500&fit=crop&crop=center',
    delay: '0.8s'
  },
  {
    num: '06',
    title: 'Visa Processing & Drills',
    desc: 'Rigorous embassy file preparation, financial proofing, and realistic mock interviews with seasoned visa experts.',
    image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=700&h=500&fit=crop&crop=center',
    delay: '1.0s'
  },
  {
    num: '07',
    title: 'Financial Guidance',
    desc: 'Complete assistance with student education loan approvals, blocked account opening, and currency forex exchange.',
    image: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=700&h=500&fit=crop&crop=center',
    delay: '1.2s'
  },
  {
    num: '08',
    title: 'Pre Departure Briefing',
    desc: 'Flight bookings, student housing allocation, airport pickup, and connecting with our international alumni network.',
    image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=700&h=500&fit=crop&crop=center',
    delay: '1.4s'
  }
];

export const WhyUsSection: React.FC = () => {
  return (
    <>
      {/* 8-step Study Journey */}
      <section className="py-24 bg-white" id="journey">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-black text-[#0A0A0A] tracking-tight">
              Your Complete <span className="text-redAccent">Study Abroad</span> Support System
            </h2>
            <p className="text-gray-500 max-w-2xl mx-auto mt-4 text-base">
              An end-to-end 8-step support system designed to take you smoothly from career counseling to your university campus abroad.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-7" id="journeyContainer">
            {steps.map((step, idx) => (
              <div key={idx} className="journey-card-modern float-idle" style={{ animationDelay: step.delay }}>
                <div className="card-img-wrap">
                  <img src={step.image} alt={step.title} className="card-img" />
                </div>
                <div className="card-body">
                  <div className="step-badge">{step.num}</div>
                  <h3 className="text-xl font-bold text-[#0A0A0A] mb-2 leading-snug">{step.title}</h3>
                  <p className="text-xs text-gray-500 font-normal leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Corporate Pillars Section */}
      <section className="py-24 bg-white" id="about">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-redAccent font-bold text-xs tracking-[0.2em] uppercase bg-red-50 px-4 py-2 rounded-full border border-red-100">About DreamSky</span>
            <h2 className="text-4xl sm:text-5xl font-black text-[#0A0A0A] mt-4 tracking-tight">
              Empowering Nepal's Students <span className="text-redAccent">To Reach Global Heights</span>
            </h2>
            <p className="text-gray-500 max-w-3xl mx-auto mt-4 text-base leading-relaxed font-normal">
              Established in Kathmandu, DreamSky Education Consultancy is Nepal's trusted gateway to higher education abroad. We specialize in university placements, test preparation (IELTS, PTE, SAT), financial counseling, and guaranteed visa support for Australia, UK, USA, Canada, New Zealand & Europe.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20" id="mission-vision">
            {/* Pillar 1 */}
            <div className="group relative rounded-[28px] bg-white border border-gray-100 overflow-hidden shadow-md hover:bg-rose-50/50 hover:border-rose-300 hover:shadow-[0_25px_50px_rgba(225,29,72,0.15)] hover:-translate-y-2.5 transition-all duration-500">
              <div className="relative h-[210px] sm:h-[230px] w-full overflow-hidden">
                <img src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=95" alt="Government Approved MOEST & TITI" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent"></div>
              </div>
              <div className="p-7 flex flex-col justify-between h-[220px]">
                <div>
                  <h3 className="text-2xl font-black text-[#0A0A0A] mb-2 transition-colors duration-300">
                    Government Approved
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed font-normal">
                    MOEST approved (Ministry of Education, Science and Technology, Nepal) & TITI certified education counselors ensuring 100% legal & transparent processing.
                  </p>
                </div>
                <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-redAccent font-bold flex items-center gap-2">
                    <i className="fas fa-check-circle text-redAccent"></i> 100% Verified Consultancy
                  </span>
                  <span className="w-8 h-8 rounded-full bg-rose-50 border border-rose-200 text-redAccent flex items-center justify-center text-xs group-hover:bg-redAccent group-hover:border-redAccent group-hover:text-white transition-colors duration-300">
                    <i className="fas fa-arrow-right"></i>
                  </span>
                </div>
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="group relative rounded-[28px] bg-white border border-gray-100 overflow-hidden shadow-md hover:bg-rose-50/50 hover:border-rose-300 hover:shadow-[0_25px_50px_rgba(225,29,72,0.15)] hover:-translate-y-2.5 transition-all duration-500">
              <div className="relative h-[210px] sm:h-[230px] w-full overflow-hidden">
                <img src="https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=800&q=95" alt="300+ Partner Universities Campus" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent"></div>
              </div>
              <div className="p-7 flex flex-col justify-between h-[220px]">
                <div>
                  <h3 className="text-2xl font-black text-[#0A0A0A] mb-2 transition-colors duration-300">
                    300+ Partner Universities
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed font-normal">
                    Direct alliances with top QS ranked institutions worldwide, unlocking generous merit scholarships, tuition grants, and seamless credit transfers.
                  </p>
                </div>
                <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-redAccent font-bold flex items-center gap-2">
                    <i className="fas fa-graduation-cap text-redAccent"></i> Global Network
                  </span>
                  <span className="w-8 h-8 rounded-full bg-rose-50 border border-rose-200 text-redAccent flex items-center justify-center text-xs group-hover:bg-redAccent group-hover:border-redAccent group-hover:text-white transition-colors duration-300">
                    <i className="fas fa-arrow-right"></i>
                  </span>
                </div>
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="group relative rounded-[28px] bg-white border border-gray-100 overflow-hidden shadow-md hover:bg-rose-50/50 hover:border-rose-300 hover:shadow-[0_25px_50px_rgba(225,29,72,0.15)] hover:-translate-y-2.5 transition-all duration-500">
              <div className="relative h-[210px] sm:h-[230px] w-full overflow-hidden">
                <img src="https://images.unsplash.com/photo-1569154941061-e231b4725ef1?auto=format&fit=crop&w=800&q=95" alt="98.5% Visa Success Approval" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent"></div>
              </div>
              <div className="p-7 flex flex-col justify-between h-[220px]">
                <div>
                  <h3 className="text-2xl font-black text-[#0A0A0A] mb-2 transition-colors duration-300">
                    98.5% Visa Success
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed font-normal">
                    Rigorous mock embassy interview drills, SOP verification, and financial documentation tailored to embassy guidelines.
                  </p>
                </div>
                <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-redAccent font-bold flex items-center gap-2">
                    <i className="fas fa-passport text-redAccent"></i> High Visa Approval Rate
                  </span>
                  <span className="w-8 h-8 rounded-full bg-rose-50 border border-rose-200 text-redAccent flex items-center justify-center text-xs group-hover:bg-redAccent group-hover:border-redAccent group-hover:text-white transition-colors duration-300">
                    <i className="fas fa-arrow-right"></i>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
