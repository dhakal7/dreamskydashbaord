import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { AustraliaPage } from './pages/AustraliaPage';
import { CanadaPage } from './pages/CanadaPage';
import { UKPage } from './pages/UKPage';
import { USAPage } from './pages/USAPage';
import { NewZealandPage } from './pages/NewZealandPage';
import { EuropePage } from './pages/EuropePage';
import { TeamPage } from './pages/TeamPage';
import { MissionVisionPage } from './pages/MissionVisionPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/australia" element={<AustraliaPage />} />
        <Route path="/canada" element={<CanadaPage />} />
        <Route path="/uk" element={<UKPage />} />
        <Route path="/usa" element={<USAPage />} />
        <Route path="/newzealand" element={<NewZealandPage />} />
        <Route path="/europe" element={<EuropePage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/mission-vision" element={<MissionVisionPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
      </Routes>
    </BrowserRouter>
  );
};
