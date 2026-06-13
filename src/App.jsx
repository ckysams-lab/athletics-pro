import React, { useState } from 'react';
import PreparationPage from './pages/PreparationPage';
import StartListPrint from './pages/StartListPrint';

function App() {
  const [currentPage, setCurrentPage] = useState('preparation');

  return (
    <div>
      {/* 導覽列 */}
      <nav className="bg-gray-900 border-b border-gray-800 p-4 flex gap-4 print:hidden">
        <button 
          onClick={() => setCurrentPage('preparation')}
          className={`px-4 py-2 rounded font-bold ${currentPage === 'preparation' ? 'bg-emerald-500 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
        >
          1. 賽事準備中心
        </button>
        <button 
          onClick={() => setCurrentPage('print')}
          className={`px-4 py-2 rounded font-bold ${currentPage === 'print' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
        >
          2. 🖨️ 列印線道分配表 (PDF)
        </button>
      </nav>

      {/* 頁面切換 */}
      {currentPage === 'preparation' ? <PreparationPage /> : <StartListPrint />}
    </div>
  );
}

export default App;
