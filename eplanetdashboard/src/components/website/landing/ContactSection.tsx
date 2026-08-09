import React, { useState } from 'react';

export const ContactSection: React.FC = () => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    destination: '',
    message: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`🎉 Consultation request submitted successfully! A DreamSky counselor will contact you within 24 hours.`);
    setFormData({ name: '', email: '', phone: '', destination: '', message: '' });
    setIsFlipped(false);
  };

  return (
    <section className="py-24 bg-grayBg" id="contact">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5 space-y-6">
            <span className="text-redAccent font-bold text-xs tracking-[0.2em] uppercase bg-red-50 px-4 py-2 rounded-full border border-red-100">
              Get In Touch
            </span>
            <h2 className="text-4xl sm:text-5xl font-black text-[#0A0A0A] tracking-tight">
              Start Your Global <span className="text-redAccent">Journey Today</span>
            </h2>
            <p className="text-gray-500 leading-relaxed text-base">
              Book a free 1-on-1 consultation with our senior international counselors. We review your academic certificates and outline your best university choices.
            </p>

            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-blue-200 transition">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-lg">
                  <i className="fas fa-phone-alt"></i>
                </div>
                <div>
                  <div className="text-xs text-gray-400 font-medium">Telephone Line</div>
                  <a href="tel:015928292" target="_blank" rel="noopener noreferrer" className="text-base font-extrabold text-[#0A0A0A] hover:text-blue-600 transition">
                    01-5928292
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-emerald-200 transition">
                <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center text-lg">
                  <i className="fab fa-whatsapp"></i>
                </div>
                <div>
                  <div className="text-xs text-gray-400 font-medium">WhatsApp Assistance</div>
                  <a 
                    href="https://wa.me/9779768987156?text=Hello%20Dream%20Sky%20Education%20Consultancy,%20I%20would%20like%20to%20inquire%20about%20study%20abroad%20opportunities!" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-base font-extrabold text-[#0A0A0A] hover:text-emerald-600 transition flex items-center gap-2"
                  >
                    <span>+977 9768987156</span>
                    <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">Chat Now</span>
                  </a>
                </div>
              </div>

              {/* Location Card */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:border-red-300 hover:shadow-md transition-all duration-300">
                <a href="https://maps.app.goo.gl/4uaCbrnNGFcTqChk9" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 group cursor-pointer hover:bg-red-50/40 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-rose-50 text-redAccent rounded-2xl flex items-center justify-center text-lg shrink-0 border border-rose-100 group-hover:bg-redAccent group-hover:text-white transition-colors">
                      <i className="fas fa-map-marker-alt"></i>
                    </div>
                    <div>
                      <div className="text-xs text-redAccent font-bold tracking-tight">Our Location</div>
                      <div className="text-sm sm:text-base font-extrabold text-[#0A0A0A] leading-snug">
                        2nd Floor, KL Tower, Boudhanath Sadak, Kathmandu 44600
                      </div>
                    </div>
                  </div>
                  <span className="bg-red-50 group-hover:bg-redAccent text-redAccent group-hover:text-white text-xs font-bold px-3 py-1.5 rounded-full border border-red-200 group-hover:border-redAccent flex items-center gap-1.5 transition-all shrink-0 ml-2">
                    <i className="fas fa-directions"></i> View Map
                  </span>
                </a>
                <div className="w-full h-48 border-t border-gray-100 relative bg-gray-100">
                  <iframe 
                    src="https://maps.google.com/maps?q=2nd%20Floor%2C%20KL%20Tower%2C%20Boudhanath%20Sadak%2C%20Kathmandu%2044600&t=&z=17&ie=UTF8&iwloc=&output=embed" 
                    className="w-full h-full border-0" 
                    allowFullScreen 
                    loading="lazy" 
                    referrerPolicy="no-referrer-when-downgrade" 
                    title="DreamSky Location Map"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            {/* 3D Flip Card Container */}
            <div className="flip-card-container">
              <div className={`flip-card-inner ${isFlipped ? 'flipped' : ''}`}>
                
                {/* FRONT SIDE */}
                <div 
                  onClick={() => setIsFlipped(true)}
                  className="flip-card-front glass-form rounded-3xl p-7 sm:p-9 shadow-premium border border-gray-200 flex flex-col justify-between items-center text-center cursor-pointer overflow-hidden"
                >
                  <div>
                    <span className="bg-red-50 text-redAccent font-extrabold text-[10px] px-3.5 py-1.5 rounded-full uppercase tracking-wider border border-red-100 mb-3 inline-block">
                      Official Consultation Hub
                    </span>

                    <div className="my-2 flex justify-center relative group">
                      <video autoPlay muted loop playsInline className="w-56 sm:w-64 h-36 sm:h-40 rounded-2xl shadow-xl border-2 border-red-100 object-cover bg-white transform group-hover:scale-105 transition-transform duration-500">
                        <source src="/Airplane_to_logo_animation_202607241246.mp4" type="video/mp4" />
                      </video>
                      <div className="absolute bottom-2.5 right-2.5 bg-black/60 backdrop-blur-md text-white text-[9px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-redAccent animate-ping"></span> Live Showcase
                      </div>
                    </div>

                    <h3 className="text-2xl font-black text-[#0A0A0A] mt-2 tracking-tight">Apply Here For Free Guidance</h3>
                    <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 leading-relaxed font-medium">
                      Start your study abroad process with Nepal's premier education consultancy. Click anywhere on this card to open your quick assessment form.
                    </p>
                  </div>
                  
                  <div className="w-full pt-3 border-t border-gray-100 mt-3">
                    <button type="button" className="w-full bg-gradient-to-r from-redAccent to-redAccentDark text-white font-bold text-sm py-3.5 rounded-full hover:shadow-glow-lg transition duration-300 flex items-center justify-center gap-2 group">
                      <span>Click Here to Fill Consultation Form</span> <i className="fas fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
                    </button>
                  </div>
                </div>

                {/* BACK SIDE */}
                <div className="flip-card-back glass-form rounded-3xl p-8 sm:p-10 shadow-premium border border-gray-200 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <img src="/Dream Sky Logo.jpeg" alt="Dream Sky Logo" className="w-10 h-10 rounded-xl object-contain bg-white p-1 border border-gray-100 shadow-sm" />
                        <div>
                          <h3 className="text-lg font-extrabold text-[#0A0A0A] leading-tight">Book Free Consultation</h3>
                          <p className="text-[10px] text-gray-500 font-medium">Dream Sky Education Consultancy</p>
                        </div>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setIsFlipped(false)}
                        className="text-xs font-bold text-gray-500 hover:text-redAccent bg-gray-100 hover:bg-red-50 px-3.5 py-1.5 rounded-full transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <i className="fas fa-arrow-left"></i> Back
                      </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="form-floating">
                          <input 
                            type="text" 
                            id="name" 
                            placeholder=" " 
                            required 
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          />
                          <label htmlFor="name">Full Name *</label>
                        </div>
                        <div className="form-floating">
                          <input 
                            type="email" 
                            id="email" 
                            placeholder=" " 
                            required 
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          />
                          <label htmlFor="email">Email Address *</label>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="form-floating">
                          <input 
                            type="tel" 
                            id="phone" 
                            placeholder=" " 
                            required 
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          />
                          <label htmlFor="phone">Phone Number *</label>
                        </div>
                        <div className="form-floating">
                          <select 
                            id="countrySelect" 
                            className="appearance-none" 
                            required
                            value={formData.destination}
                            onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                          >
                            <option value="" disabled></option>
                            <option value="Australia">Australia</option>
                            <option value="Canada">Canada</option>
                            <option value="United Kingdom">United Kingdom</option>
                            <option value="United States">United States</option>
                            <option value="New Zealand">New Zealand</option>
                            <option value="Europe">Europe</option>
                          </select>
                          <label htmlFor="countrySelect">Preferred Destination *</label>
                        </div>
                      </div>

                      <div className="form-floating">
                        <textarea 
                          id="message" 
                          placeholder=" " 
                          rows={2}
                          value={formData.message}
                          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                        />
                        <label htmlFor="message">Tell us about your educational goals...</label>
                      </div>

                      <button 
                        type="submit" 
                        className="w-full bg-gradient-to-r from-redAccent to-redAccentDark text-white font-bold text-sm py-3 rounded-full hover:shadow-glow-lg transition duration-300 flex items-center justify-center gap-2 mt-1 cursor-pointer"
                      >
                        <i className="fas fa-paper-plane"></i> Submit Free Assessment Request
                      </button>
                    </form>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
