import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <>
      <footer className="slim-footer py-14">
        {/* Top Gradient Line */}
        <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-redAccent to-blue-500 absolute top-0 left-0 right-0"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 pb-12 border-b border-white/10">
            
            {/* Col 1: Brand & Accreditations */}
            <div className="lg:col-span-4 space-y-4">
              <div className="flex items-center gap-3">
                <img src="/Dream Sky Logo.jpeg" alt="DreamSky" className="w-11 h-11 rounded-xl object-contain bg-white p-1 shadow-md border border-white/20" />
                <div className="text-white font-black text-xl leading-tight tracking-tight">Dream<span className="text-blue-600">Sky</span></div>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed font-normal">
                Nepal's premier education consultancy empowering students with admissions, visa guidance, test prep (IELTS/PTE), and post-arrival support for top global universities.
              </p>
              
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="bg-blue-900/60 text-blue-200 border border-blue-700/50 text-[10px] font-semibold px-2.5 py-1 rounded-md">
                  <i className="fas fa-check-circle text-blue-400 mr-1"></i> MOEST Approved
                </span>
                <span className="bg-red-900/40 text-red-200 border border-red-700/40 text-[10px] font-semibold px-2.5 py-1 rounded-md">
                  <i className="fas fa-shield-alt text-red-400 mr-1"></i> TITI Certified
                </span>
              </div>

              <div className="flex gap-2.5 pt-2">
                <a href="#" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-gray-300 hover:bg-redAccent hover:text-white transition-all duration-300 text-xs shadow-sm" title="Facebook"><i className="fab fa-facebook-f"></i></a>
                <a href="#" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-gray-300 hover:bg-redAccent hover:text-white transition-all duration-300 text-xs shadow-sm" title="Instagram"><i className="fab fa-instagram"></i></a>
                <a href="#" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-gray-300 hover:bg-redAccent hover:text-white transition-all duration-300 text-xs shadow-sm" title="TikTok"><i className="fab fa-tiktok"></i></a>
              </div>
            </div>

            {/* Col 2: Navigation Links */}
            <div className="lg:col-span-2 space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider border-b border-blue-500/30 pb-2 inline-block">Quick Links</h4>
              <ul className="space-y-2 text-xs text-gray-300 font-medium">
                <li><Link to="/" className="hover:text-blue-400 transition flex items-center gap-1.5"><i className="fas fa-chevron-right text-[8px] text-blue-500"></i> Home</Link></li>
                <li><Link to="/team" className="hover:text-blue-400 transition flex items-center gap-1.5"><i className="fas fa-chevron-right text-[8px] text-blue-500"></i> About Us & Team</Link></li>
                <li><a href="/#destinations" className="hover:text-blue-400 transition flex items-center gap-1.5"><i className="fas fa-chevron-right text-[8px] text-blue-500"></i> Destinations</a></li>
                <li><a href="/#partners" className="hover:text-blue-400 transition flex items-center gap-1.5"><i className="fas fa-chevron-right text-[8px] text-blue-500"></i> Universities</a></li>
                <li><a href="/#journey" className="hover:text-blue-400 transition flex items-center gap-1.5"><i className="fas fa-chevron-right text-[8px] text-blue-500"></i> Study Journey</a></li>
                <li><a href="/#contact" className="hover:text-blue-400 transition flex items-center gap-1.5"><i className="fas fa-chevron-right text-[8px] text-blue-500"></i> Contact Us</a></li>
              </ul>
            </div>

            {/* Col 3: Study Destinations */}
            <div className="lg:col-span-3 space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider border-b border-blue-500/30 pb-2 inline-block">Top Countries</h4>
              <ul className="space-y-2 text-xs text-gray-300 font-medium">
                <li><Link to="/australia" className="hover:text-blue-400 transition flex items-center gap-2.5"><span className="px-1.5 py-0.5 rounded bg-blue-900/80 text-blue-300 font-extrabold text-[10px] uppercase border border-blue-600/40 tracking-wider shrink-0">AU</span> <span>Study in Australia</span></Link></li>
                <li><Link to="/canada" className="hover:text-blue-400 transition flex items-center gap-2.5"><span className="px-1.5 py-0.5 rounded bg-blue-900/80 text-blue-300 font-extrabold text-[10px] uppercase border border-blue-600/40 tracking-wider shrink-0">CA</span> <span>Study in Canada</span></Link></li>
                <li><Link to="/uk" className="hover:text-blue-400 transition flex items-center gap-2.5"><span className="px-1.5 py-0.5 rounded bg-blue-900/80 text-blue-300 font-extrabold text-[10px] uppercase border border-blue-600/40 tracking-wider shrink-0">UK</span> <span>Study in United Kingdom</span></Link></li>
                <li><Link to="/usa" className="hover:text-blue-400 transition flex items-center gap-2.5"><span className="px-1.5 py-0.5 rounded bg-blue-900/80 text-blue-300 font-extrabold text-[10px] uppercase border border-blue-600/40 tracking-wider shrink-0">US</span> <span>Study in United States</span></Link></li>
                <li><Link to="/newzealand" className="hover:text-blue-400 transition flex items-center gap-2.5"><span className="px-1.5 py-0.5 rounded bg-blue-900/80 text-blue-300 font-extrabold text-[10px] uppercase border border-blue-600/40 tracking-wider shrink-0">NZ</span> <span>Study in New Zealand</span></Link></li>
                <li><Link to="/europe" className="hover:text-blue-400 transition flex items-center gap-2.5"><span className="px-1.5 py-0.5 rounded bg-blue-900/80 text-blue-300 font-extrabold text-[10px] uppercase border border-blue-600/40 tracking-wider shrink-0">EU</span> <span>Study in Europe</span></Link></li>
              </ul>
            </div>

            {/* Col 4: Headquarters */}
            <div className="lg:col-span-3 space-y-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider border-b border-blue-500/30 pb-2 inline-block">Headquarters</h4>
              <ul className="space-y-2.5 text-xs text-gray-300">
                <li className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-blue-900/60 border border-blue-700/50 flex items-center justify-center text-blue-400 text-[10px] shrink-0 mt-0.5"><i className="fas fa-map-marker-alt"></i></div>
                  <a href="https://maps.app.goo.gl/4uaCbrnNGFcTqChk9" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition underline underline-offset-2">2nd Floor, KL Tower, Boudhanath Sadak, Kathmandu 44600</a>
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-blue-900/40 border border-blue-700/40 flex items-center justify-center text-blue-400 text-[10px] shrink-0"><i className="fas fa-phone-alt"></i></div>
                  <a href="tel:015928292" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">01-5928292</a>
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-emerald-900/40 border border-emerald-700/40 flex items-center justify-center text-emerald-400 text-[10px] shrink-0"><i className="fab fa-whatsapp"></i></div>
                  <a href="https://wa.me/9779768987156?text=Hello%20Dream%20Sky,%20I%20am%20interested%20in%20studying%20abroad." target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition">+977 9768987156 (Chat on WhatsApp)</a>
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-blue-900/60 border border-blue-700/50 flex items-center justify-center text-blue-400 text-[10px] shrink-0"><i className="fas fa-envelope"></i></div>
                  <a href="mailto:info@dreamsky.edu.np" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">info@dreamsky.edu.np</a>
                </li>
                <li className="flex items-center gap-2.5 text-[11px] text-gray-400 pt-1 pb-2">
                  <i className="far fa-clock text-amber-400 text-xs"></i>
                  <span>Sun – Fri: 7:00 AM – 6:00 PM</span>
                </li>
                {/* Embedded Map in Footer for all pages */}
                <li className="pt-2">
                  <div className="w-full h-32 rounded-xl overflow-hidden border border-white/10 relative">
                    <iframe 
                      src="https://maps.google.com/maps?q=2nd%20Floor%2C%20KL%20Tower%2C%20Boudhanath%20Sadak%2C%20Kathmandu%2044600&t=&z=17&ie=UTF8&iwloc=&output=embed" 
                      className="w-full h-full border-0" 
                      allowFullScreen 
                      loading="lazy" 
                      referrerPolicy="no-referrer-when-downgrade" 
                      title="DreamSky Location Map"
                    />
                  </div>
                </li>
              </ul>
            </div>

          </div>

          <div className="pt-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-[11px] text-gray-400">
            <div>&copy; 2026 Dream Sky Education Consultancy. All rights reserved.</div>
            <div className="flex items-center gap-5 font-medium">
              <Link to="/privacy" className="hover:text-white transition">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-white transition">Terms of Service</Link>
              <a href="#home" className="w-8 h-8 rounded-xl bg-redAccent/30 hover:bg-redAccent text-rose-200 hover:text-white border border-rose-500/40 flex items-center justify-center transition-all duration-300" title="Back to top">
                <i className="fas fa-chevron-up text-xs"></i>
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp Quick Button */}
      <a 
        href="https://wa.me/9779768987156?text=Hello%20Dream%20Sky%20Education%20Consultancy,%20I%20am%20interested%20in%20studying%20abroad." 
        target="_blank" 
        rel="noopener noreferrer" 
        className="fixed bottom-6 left-6 z-50 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs px-4 py-3 rounded-full shadow-2xl flex items-center gap-2.5 transition-all duration-300 hover:scale-105 group border border-emerald-400/30" 
        title="Chat on WhatsApp"
      >
        <i className="fab fa-whatsapp text-lg animate-bounce"></i>
        <span className="hidden sm:inline">Chat on WhatsApp</span>
      </a>
    </>
  );
};
