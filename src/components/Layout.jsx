// src/components/Layout.jsx
import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Users, Timer, MonitorPlay, Printer } from 'lucide-react';

const Layout = () => {
  const navItems = [
    { path: '/', name: '賽事準備中心', icon: <LayoutDashboard size={20} /> },
    { path: '/umpire', name: '裁判終端機', icon: <Timer size={20} /> },
    { path: '/live', name: '大屏幕轉播', icon: <MonitorPlay size={20} /> },
    { path: '/print', name: '列印線道表', icon: <Printer size={20} /> },
  ];

  return (
    <div className="flex h-screen bg-gray-950 text-white font-sans overflow-hidden">
      
      {/* 側邊導覽列 (Sidebar) - Glassmorphism 風格 */}
      <aside className="w-64 bg-gray-900/50 backdrop-blur-xl border-r border-gray-800 flex flex-col hidden md:flex">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 tracking-wider">
            ATHLETICS PRO
          </h1>
          <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">BCKLAS Event System</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-bold ${
                  isActive 
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                }`
              }
            >
              {item.icon}
              {item.name}
            </NavLink>
          ))}
        </nav>

        {/* 底部使用者資訊 */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-800/50 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-400 to-blue-500 flex items-center justify-center font-bold text-sm shadow-lg">
              KC
            </div>
            <div>
              <div className="text-sm font-bold text-gray-200">Ken Chui</div>
              <div className="text-xs text-emerald-400">大會總裁判</div>
            </div>
          </div>
        </div>
      </aside>

      {/* 主要內容區塊 */}
      <main className="flex-1 overflow-y-auto custom-scrollbar relative">
        {/* 背景裝飾光暈 */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none -z-10"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none -z-10"></div>
        
        {/* 子頁面內容會渲染在這裡 */}
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;