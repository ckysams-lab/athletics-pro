// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Layout from './components/Layout';
import PreparationPage from './pages/PreparationPage';
import StartListPrint from './pages/StartListPrint';
import UmpireConsole from './pages/UmpireConsole';
import LiveArena from './pages/LiveArena';
import SettingsPage from './pages/SettingsPage';
import LeaguePage from './pages/LeaguePage'; 

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<PreparationPage />} />
          <Route path="umpire" element={<UmpireConsole />} />
          <Route path="live" element={<LiveArena />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="league" element={<LeaguePage />} /> 
        </Route>
        
        <Route path="/print" element={<StartListPrint />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
