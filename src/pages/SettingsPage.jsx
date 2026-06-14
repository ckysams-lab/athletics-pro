// src/pages/SettingsPage.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

const SettingsPage = () => {
  const [points, setPoints] = useState([9, 7, 6, 5, 4, 3, 2, 1]);
  const [relayMultiplier, setRelayMultiplier] = useState(2);
  const [customSortOrder, setCustomSortOrder] = useState(""); 
  const [isSaving, setIsSaving] = useState(false);
  
  // 👉 儲存資料庫中實際存在的賽事代碼
  const [availableEvents, setAvailableEvents] = useState([]);

  useEffect(() => {
    const fetchSettingsAndEvents = async () => {
      // 1. 抓取設定
      const docSnap = await getDoc(doc(db, 'settings', 'scoring'));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.points) setPoints(data.points);
        if (data.relayMultiplier) setRelayMultiplier(data.relayMultiplier);
        if (data.customSortOrder) setCustomSortOrder(data.customSortOrder);
      }

      // 2. 抓取目前資料庫中所有的 races 的 EventId，並去重複
      const querySnapshot = await getDocs(collection(db, 'races'));
      const uniqueEvents = new Set();
      querySnapshot.forEach((doc) => {
        uniqueEvents.add(doc.data().eventId);
      });
      setAvailableEvents(Array.from(uniqueEvents).sort());
    };
    fetchSettingsAndEvents();
  }, []);

  const handlePointChange = (index, value) => {
    const newPoints = [...points];
    newPoints[index] = Number(value);
    setPoints(newPoints);
  };

  // 👉 點擊賽事名稱，自動加入到輸入框中
  const handleAddToSortOrder = (eventId) => {
    let currentList = customSortOrder ? customSortOrder.split(',').map(s => s.trim()).filter(s => s) : [];
    if (!currentList.includes(eventId)) {
      currentList.push(eventId);
      setCustomSortOrder(currentList.join(', '));
    }
  };

  const handleClearSortOrder = () => setCustomSortOrder("");

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'scoring'), {
        points,
        relayMultiplier: Number(relayMultiplier),
        customSortOrder: customSortOrder.trim()
      });
      alert("✅ 大會設定已儲存！");
    } catch (error) {
      alert("❌ 儲存失敗！");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8 min-h-screen bg-gray-950 text-white pb-32">
      <h1 className="text-4xl font-bold text-emerald-400 mb-8">⚙️ 大會系統設定</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-[1400px]">
        
        {/* 左側：計分設定 */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-xl h-fit">
          <h2 className="text-2xl font-bold text-amber-400 mb-6">🏆 各名次得分設定 (單項)</h2>
          <div className="grid grid-cols-4 gap-4 mb-8">
            {points.map((pt, idx) => (
              <div key={idx} className="bg-gray-800 p-3 rounded-lg border border-gray-700">
                <label className="block text-xs text-gray-400 mb-1 text-center">第 {idx + 1} 名</label>
                <input 
                  type="number" value={pt} onChange={(e) => handlePointChange(idx, e.target.value)}
                  className="w-full bg-gray-950 border border-gray-600 rounded p-2 text-xl font-bold text-white text-center focus:border-emerald-500 focus:outline-none"
                />
              </div>
            ))}
          </div>

          <h2 className="text-2xl font-bold text-blue-400 mb-6 border-t border-gray-800 pt-6">🏃‍♂️ 接力賽得分倍數</h2>
          <div className="flex items-center gap-4">
            <input 
              type="number" step="0.1" value={relayMultiplier} onChange={(e) => setRelayMultiplier(e.target.value)}
              className="w-24 bg-gray-950 border border-gray-600 rounded p-3 text-2xl font-bold text-blue-400 text-center focus:border-blue-500 focus:outline-none"
            />
            <span className="text-lg text-gray-400">倍 (例如 2 代表雙倍積分)</span>
          </div>
        </div>

        {/* 👉 右側：大幅進化的場刊排序設定 */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-xl flex flex-col">
          <h2 className="text-2xl font-bold text-purple-400 mb-2">📄 場刊列印排序設定 (Checklist)</h2>
          <p className="text-sm text-gray-400 mb-6">點擊下方的可用賽事，系統會自動幫您將它們依序加入到場刊列印清單中。</p>
          
          <div className="mb-6">
            <div className="text-sm font-bold text-gray-300 mb-2">👇 目前資料庫中存在的賽事 (點擊加入)：</div>
            <div className="flex flex-wrap gap-2 p-4 bg-gray-950 rounded-xl border border-gray-800 max-h-48 overflow-y-auto custom-scrollbar">
              {availableEvents.length === 0 ? (
                <span className="text-gray-600 text-sm">請先在準備中心產生賽事</span>
              ) : (
                availableEvents.map(eventId => {
                  // 檢查是否已經被加入了
                  const isAdded = customSortOrder.includes(eventId);
                  return (
                    <button
                      key={eventId}
                      onClick={() => handleAddToSortOrder(eventId)}
                      disabled={isAdded}
                      className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all border ${
                        isAdded 
                          ? 'bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed' 
                          : 'bg-blue-900/30 border-blue-500/50 text-blue-300 hover:bg-blue-600 hover:text-white'
                      }`}
                    >
                      {eventId} {isAdded && '✅'}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="flex-1">
            <div className="flex justify-between items-end mb-2">
              <label className="block text-sm font-bold text-purple-300">📝 最終列印順序 (你也可以手動修改逗號)：</label>
              <button onClick={handleClearSortOrder} className="text-xs text-red-400 hover:text-red-300 border border-red-900 px-2 py-1 rounded">清空重排</button>
            </div>
            <textarea 
              value={customSortOrder}
              onChange={(e) => setCustomSortOrder(e.target.value)}
              placeholder="點擊上方按鈕，或在此手動輸入 (例如: F_D_60M, M_D_60M...)"
              className="w-full h-40 bg-gray-950 border-2 border-gray-700 rounded-xl p-4 text-white font-mono text-lg focus:border-purple-500 focus:outline-none custom-scrollbar"
            />
          </div>
        </div>

      </div>

      <div className="mt-8 max-w-[1400px]">
        <button onClick={handleSave} disabled={isSaving} className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black py-6 rounded-2xl text-2xl shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-all hover:-translate-y-1">
          {isSaving ? "儲存中..." : "💾 儲存所有大會設定"}
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
