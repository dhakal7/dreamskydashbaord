import React, { useRef } from 'react';

const universities = [
  {
    name: 'Univ. of Auckland',
    country: 'New Zealand',
    rank: 'World Rank #68',
    domain: 'auckland.ac.nz',
    image: 'https://images.unsplash.com/photo-1562774053-701939374585?w=800&q=80',
    link: 'https://www.auckland.ac.nz/',
    badge: 'Top Partner University',
    desc: "New Zealand's #1 ranked university offering top programs in Engineering, Medicine & Business.",
    scholarship: 'Up to NZD $10,000',
    stat: '~75% Acceptance'
  },
  {
    name: 'LMU Munich',
    country: 'Germany',
    rank: 'World Rank #54',
    domain: 'lmu.de',
    image: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=800&q=80',
    link: 'https://www.lmu.de/en/',
    badge: 'Top European Institution',
    desc: 'Premier European research university with zero tuition fees for international students.',
    scholarship: '€0 Tuition Fees',
    stat: 'AI, Physics, Bio'
  },
  {
    name: 'Univ. of Sydney',
    country: 'Australia',
    rank: 'World Rank #19',
    domain: 'sydney.edu.au',
    image: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800&q=80',
    link: 'https://www.sydney.edu.au/',
    badge: 'Group of Eight Australia',
    desc: "Australia's oldest university ranked #19 globally for employability & academic excellence.",
    scholarship: 'Up to 20% Vice-Chancellor',
    stat: '2-4 Years Visa'
  },
  {
    name: 'Univ. of Melbourne',
    country: 'Australia',
    rank: 'World Rank #14',
    domain: 'unimelb.edu.au',
    image: 'https://images.unsplash.com/photo-1564981797816-1043664bf78d?w=800&q=80',
    link: 'https://www.unimelb.edu.au/',
    badge: '#1 University in Australia',
    desc: "Australia's #1 university located in the cultural capital of Melbourne.",
    scholarship: '#14 Worldwide',
    stat: 'Finance, CS, Architecture'
  },
  {
    name: 'Univ. of Toronto',
    country: 'Canada',
    rank: 'World Rank #21',
    domain: 'utoronto.ca',
    image: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&q=80',
    link: 'https://www.utoronto.ca/',
    badge: "Canada's Top University",
    desc: "Canada's flagship institution renowned for AI innovation and research breakthroughs.",
    scholarship: '3 Year PGWP Canada',
    stat: 'Software, Data Science, AI'
  }
];

export const UniversitiesSection: React.FC = () => {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollTrack = (direction: 'prev' | 'next') => {
    if (trackRef.current) {
      const scrollAmount = direction === 'next' ? 360 : -360;
      trackRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <section className="py-20 bg-[#F8FAFC] border-y border-gray-100 relative overflow-hidden" id="partners">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <span className="text-redAccent font-bold text-xs tracking-[0.2em] uppercase bg-red-50 px-4 py-2 rounded-full border border-red-100">
            GLOBAL INSTITUTIONAL ALLIANCES
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#0A0A0A] mt-3 tracking-tight">
            Partner <span className="text-redAccent">Universities</span>
          </h2>
          <p className="text-gray-500 mt-3 text-sm sm:text-base leading-relaxed">
            Direct tie-ups and official representation with 300+ QS top-ranked universities worldwide. Hover over any university card for details.
          </p>

          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={() => scrollTrack('prev')}
              type="button"
              className="w-11 h-11 rounded-full bg-white border border-gray-200 shadow-md hover:bg-redAccent hover:text-white hover:border-redAccent transition-all duration-300 flex items-center justify-center text-gray-700 font-bold active:scale-95 cursor-pointer"
              title="Previous Universities"
            >
              <i className="fas fa-chevron-left text-sm"></i>
            </button>
            <button
              onClick={() => scrollTrack('next')}
              type="button"
              className="w-11 h-11 rounded-full bg-white border border-gray-200 shadow-md hover:bg-redAccent hover:text-white hover:border-redAccent transition-all duration-300 flex items-center justify-center text-gray-700 font-bold active:scale-95 cursor-pointer"
              title="Next Universities"
            >
              <i className="fas fa-chevron-right text-sm"></i>
            </button>
          </div>
        </div>

        <div className="relative w-full">
          <div
            ref={trackRef}
            className="flex items-center gap-6 overflow-x-auto scroll-smooth py-6 px-2 select-none"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {universities.map((uni, idx) => (
              <a
                key={idx}
                href={uni.link}
                target="_blank"
                rel="noopener noreferrer"
                className="uni-card-cover group"
              >
                <img
                  src={uni.image}
                  alt={uni.name}
                  className="bg-img"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />

                <div className="overlay-default z-10">
                  <div className="flex items-center justify-between">
                    <div className="w-9 h-9 rounded-xl bg-white p-1.5 shadow-md backdrop-blur-md flex items-center justify-center shrink-0 border border-white/60">
                      <img src={`https://www.google.com/s2/favicons?domain=${uni.domain}&sz=256`} alt={`${uni.name} Logo`} className="w-full h-full object-contain" />
                    </div>
                  </div>
                  <div>
                    <div className="inline-block bg-black/75 backdrop-blur-md border border-white/20 text-white font-black text-lg px-4 py-2 rounded-xl shadow-lg group-hover:bg-redAccent group-hover:border-red-500 transition-colors duration-300">
                      {uni.name}
                    </div>
                    <div className="text-xs text-white/90 font-semibold mt-2.5">
                      {uni.country} • {uni.rank}
                    </div>
                  </div>
                </div>

                <div className="overlay-hover-popup z-20">
                  <div className="flex items-center justify-between">
                    <div className="w-9 h-9 rounded-xl bg-white p-1.5 shadow-md flex items-center justify-center shrink-0">
                      <img src={`https://www.google.com/s2/favicons?domain=${uni.domain}&sz=256`} alt={`${uni.name} Logo`} className="w-full h-full object-contain" />
                    </div>
                  </div>
                  <div className="my-auto">
                    <h3 className="text-xl font-black text-white mb-2">{uni.name}</h3>
                    <p className="text-xs text-gray-300 mb-3 leading-relaxed">{uni.desc}</p>
                    <div className="bg-white/10 p-3 rounded-xl backdrop-blur-md text-xs text-white space-y-1">
                      <div><strong className="text-amber-300">Scholarships:</strong> {uni.scholarship}</div>
                      <div><strong className="text-amber-300">Details:</strong> {uni.stat}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between w-full bg-redAccent hover:bg-redAccentDark text-white font-bold text-xs px-4 py-3 rounded-xl transition-all shadow-md">
                    <span>Visit Official Site</span> <i className="fas fa-external-link-alt"></i>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
