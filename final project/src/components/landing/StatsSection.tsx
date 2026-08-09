import React from 'react';

const stats = [
  { value: '98.5%', label: 'Visa Approval Success Rate', icon: 'fa-passport' },
  { value: '5,000+', label: 'Successful Students Placed', icon: 'fa-graduation-cap' },
  { value: '300+', label: 'QS Ranked Partner Universities', icon: 'fa-university' },
  { value: '15+', label: 'Years Counseling Experience', icon: 'fa-award' },
];

export const StatsSection: React.FC = () => {
  return (
    <section className="py-12 bg-slate-900 text-white relative overflow-hidden border-y border-red-500/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {stats.map((stat, idx) => (
            <div key={idx} className="p-6 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 hover:border-redAccent/50 transition duration-300">
              <i className={`fas ${stat.icon} text-redAccent text-2xl mb-3`}></i>
              <div className="text-3xl sm:text-4xl font-black text-white">{stat.value}</div>
              <div className="text-xs text-gray-300 font-medium mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
