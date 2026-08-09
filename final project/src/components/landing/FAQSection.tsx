import React, { useState } from 'react';

const faqs = [
  {
    question: 'Why choose DreamSky Education Consultancy?',
    answer: 'DreamSky is MOEST approved and TITI certified with over 15 years of industry experience, 300+ QS top partner university alliances, and a 98.5% visa success rate.'
  },
  {
    question: 'How long does the study visa application process take?',
    answer: 'Processing times vary by destination. On average: Australia (4-8 weeks), Canada (6-12 weeks), UK (3-4 weeks), USA (2-4 weeks after interview appointment).'
  },
  {
    question: 'Are scholarships available for international students?',
    answer: 'Yes! DreamSky assists students in securing merit-based institutional scholarships ranging from 10% to 50% tuition fee waivers, as well as government bursaries.'
  },
  {
    question: 'What test score is required for studying abroad?',
    answer: 'Requirements depend on your course and destination. Typically, IELTS 6.0 - 6.5 (or PTE 50 - 58) is required for Undergraduate degrees, and IELTS 6.5 - 7.0 (or PTE 58 - 65) for Master degrees.'
  },
  {
    question: 'Can international students work while studying?',
    answer: 'Yes. Australia permits 48 hours per fortnight, UK allows 20 hours per week, Canada allows up to 20 hours per week during academic terms, and full-time during official semester breaks.'
  }
];

export const FAQSection: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const toggleFaq = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section className="py-20 bg-slate-50 border-t border-gray-100" id="faqs">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="text-redAccent font-bold text-xs tracking-[0.2em] uppercase bg-red-50 px-4 py-2 rounded-full border border-red-100">
            GOT QUESTIONS?
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-[#0A0A0A] mt-4 tracking-tight">
            Frequently Asked <span className="text-redAccent">Questions</span>
          </h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, idx) => (
            <div 
              key={idx}
              className="rounded-2xl bg-white border border-gray-200 overflow-hidden transition-all duration-200 shadow-sm"
            >
              <button
                type="button"
                onClick={() => toggleFaq(idx)}
                className="w-full px-6 py-5 text-left font-bold text-slate-900 flex items-center justify-between gap-4 focus:outline-none hover:text-redAccent transition-colors cursor-pointer"
              >
                <span className="text-base sm:text-lg">{faq.question}</span>
                <i className={`fas fa-chevron-down text-xs transition-transform duration-300 text-redAccent ${openIdx === idx ? 'rotate-180' : ''}`}></i>
              </button>
              {openIdx === idx && (
                <div className="px-6 pb-5 pt-1 text-xs sm:text-sm text-gray-500 leading-relaxed border-t border-gray-100">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
