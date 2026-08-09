import React from 'react';
import { Link } from 'react-router-dom';

const destinations = [
  {
    name: 'Australia',
    link: '/australia',
    image: '/australia_destination.jpg',
    fallback: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?auto=format&fit=crop&w=2400&q=100',
    delay: '0s'
  },
  {
    name: 'United Kingdom',
    link: '/uk',
    image: 'https://images.unsplash.com/photo-1529655683826-aba9b3e77383?auto=format&fit=crop&w=2400&q=100',
    fallback: '',
    delay: '0.3s'
  },
  {
    name: 'United States',
    link: '/usa',
    image: '/usa_destination.jpg',
    fallback: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=2400&q=100',
    delay: '0.6s'
  },
  {
    name: 'Canada',
    link: '/canada',
    image: '/canada_destination.png',
    fallback: 'https://images.unsplash.com/photo-1503614472-8c93d56e92ce?auto=format&fit=crop&w=2400&q=100',
    delay: '0.9s'
  },
  {
    name: 'New Zealand',
    link: '/newzealand',
    image: '/newzealand_destination.jpg',
    fallback: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=2400&q=100',
    delay: '1.2s'
  },
  {
    name: 'Europe',
    link: '/europe',
    image: '/europe_destination.png',
    fallback: 'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?auto=format&fit=crop&w=2400&q=100',
    delay: '1.5s'
  }
];

export const DestinationsSection: React.FC = () => {
  return (
    <section className="pt-20 pb-10 bg-white" id="destinations">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="text-redAccent font-bold text-xs tracking-[0.2em] uppercase bg-red-50 px-4 py-2 rounded-full border border-red-100">
            Step Into Your Global Future
          </span>
          <h2 className="text-4xl sm:text-5xl font-black text-[#0A0A0A] mt-4 tracking-tight">
            Explore Top Study <span className="text-redAccent">Destinations</span>
          </h2>
          <p className="text-gray-500 max-w-2xl mx-auto mt-3 text-base">
            Discover leading universities, scholarships, cost of living, post study work opportunities, and more—all in one place.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8" id="destinationsContainer">
          {destinations.map((dest, idx) => (
            <Link
              key={idx}
              to={dest.link}
              className="dest-card-cover float-idle group block"
              style={{ animationDelay: dest.delay }}
            >
              <img
                src={dest.image}
                alt={dest.name}
                className="bg-img"
                onError={(e) => {
                  if (dest.fallback) {
                    (e.target as HTMLImageElement).src = dest.fallback;
                  }
                }}
              />
              <div className="overlay flex flex-col justify-end items-center text-center pb-8">
                <div className="inline-flex items-center gap-2.5 bg-black/75 group-hover:bg-redAccent border border-white/20 text-white font-black text-xl px-7 py-3.5 rounded-2xl shadow-xl group-hover:scale-105 transition-all duration-300">
                  <span>{dest.name}</span>
                  <i className="fas fa-arrow-right text-sm opacity-80 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300"></i>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};
