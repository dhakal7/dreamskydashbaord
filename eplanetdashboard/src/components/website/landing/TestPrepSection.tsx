import React from 'react';

const testCourses = [
  { name: 'IELTS', score: 'Target Band 7.5+', duration: '4-6 Weeks', desc: 'Comprehensive coaching in Listening, Reading, Writing & Speaking with authentic mock tests.' },
  { name: 'PTE Academic', score: 'Target 79+ Score', duration: '4 Weeks', desc: 'AI-evaluated computer test strategies, real exam question banks, and speed techniques.' },
  { name: 'TOEFL iBT', score: 'Target 100+ Score', duration: '4-6 Weeks', desc: 'Master academic English reading, listening, speaking, and analytical writing.' },
  { name: 'SAT Prep', score: 'Target 1450+', duration: '8 Weeks', desc: 'In-depth Math & Evidence-Based Reading & Writing drills for USA undergraduate admissions.' },
];

export const TestPrepSection: React.FC = () => {
  return (
    <section className="py-20 bg-white border-t border-gray-100" id="testprep">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="text-redAccent font-bold text-xs tracking-[0.2em] uppercase bg-red-50 px-4 py-2 rounded-full border border-red-100">
            TEST PREPARATION CLASSES
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#0A0A0A] mt-4 tracking-tight">
            Achieve Top Scores in <span className="text-redAccent">IELTS, PTE & SAT</span>
          </h2>
          <p className="text-gray-500 mt-3 text-base">
            Small batch sizes, experienced instructors, free study materials, and weekly full-length mock examinations.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {testCourses.map((course, idx) => (
            <div key={idx} className="p-7 rounded-3xl bg-slate-50 border border-slate-100 hover:border-redAccent/30 hover:shadow-xl transition-all duration-300 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-black text-2xl text-[#0A0A0A]">{course.name}</span>
                  <span className="text-[10px] font-extrabold text-redAccent bg-red-50 px-2.5 py-1 rounded-full border border-red-100">{course.duration}</span>
                </div>
                <div className="text-xs font-bold text-emerald-600 mb-2">{course.score}</div>
                <p className="text-xs text-gray-500 leading-relaxed mb-4">{course.desc}</p>
              </div>
              <a href="#contact" className="w-full py-2.5 rounded-full bg-redAccent text-white font-bold text-xs text-center hover:bg-redAccentDark transition block">
                Enroll In Class
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
