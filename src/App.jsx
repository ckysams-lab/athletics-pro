// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// 引入版面與頁面
import Layout from './components/Layout';
import PreparationPage from './pages/PreparationPage';
import StartListPrint from './pages/StartListPrint';
import UmpireConsole from './pages/UmpireConsole';
import LiveArena from './pages/LiveArena';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 所有被 Layout 包覆的頁面 */}
        <Route path="/" element={<Layout />}>
          <Route index element={<PreparationPage />} />
          <Route path="umpire" element={<UmpireConsole />} />
          <Route path="live" element={<LiveArena />} />
        </Route>
        
        {/* 列印頁面不需要側邊欄，所以獨立出來 */}
        <Route path="/print" element={<StartListPrint />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
