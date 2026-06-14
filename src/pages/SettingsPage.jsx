// src/pages/SettingsPage.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const SettingsPage = () => {
  const [points, setPoints] = useState([9, 7, 6, 5, 4, 3, 2, 1]);
  const [relayMultiplier, setRelayMultiplier] = useState(2);
  // 👉 新增：儲存自訂的項目排序字串 (以逗號分隔)
  const [customSortOrder, setCustomSortOrder] = useState(""); 
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const docSnap = await getDoc(doc(db, 'settings', 'scoring'));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.points) setPoints(data.points);
        if (data.relayMultiplier) setRelayMultiplier(data.relayMultiplier);
        // 👉 讀取排序設定
        if (data.customSortOrder) setCustomSortOrder(data.customSortOrder);
      }
    };
    fetchSettings();
  }, []);

  const handlePointChange = (index, value) => {
    const newPoints = [...points];
    newPoints[index] = Number(value);
    setPoints(newPoints);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'scoring'), {
        points,
        relayMultiplier: Number(relayMultiplier),
        // 👉 寫入排序設定
        customSortOrder: customSortOrder.trim()
      });
      alert("✅ 大會設定已儲存！");
    } catch (error) {
      console.error("儲存失敗:", error);
      alert("❌ 儲存失敗！");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8 min-h-screen bg-gray-950 text-white">
      <h1 className="text-4xl font-bold text-emerald-400 mb-8">⚙️ 大會系統設定</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl">
        
        {/* 左側：計分設定 */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-xl">
          <h2 className="text-2xl font-bold text-amber-400 mb-6">各名次得分設定 (單項)</h2>
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

          <h2 className="text-2xl font-bold text-blue-400 mb-6 border-t border-gray-800 pt-6">接力賽得分倍數</h2>
          <div className="flex items-center gap-4">
            <input 
              type="number" step="0.1" value={relayMultiplier} onChange={(e) => setRelayMultiplier(e.target.value)}
              className="w-24 bg-gray-950 border border-gray-600 rounded p-3 text-2xl font-bold text-blue-400 text-center focus:border-blue-500 focus:outline-none"
            />
            <span className="text-lg text-gray-400">倍 (例如 2 代表雙倍積分)</span>
          </div>
        </div>

        {/* 右側：場刊排序設定 */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-xl flex flex-col">
          <h2 className="text-2xl font-bold text-purple-400 mb-2">📄 場刊列印排序設定</h2>
          <p className="text-sm text-gray-400 mb-4">預設情況下，列印線道表會依據項目代碼 (如 M_A_100M) 進行字母排序。若你想自訂場刊的列印順序，請在此輸入。</p>
          
          <div className="flex-1">
            <label className="block text-sm font-bold text-gray-300 mb-2">自訂排序清單 (以逗號分隔項目代碼，例如: F_C_60M, M_C_60M)</label>
            <textarea 
              value={customSortOrder}
              onChange={(e) => setCustomSortOrder(e.target.value)}
              placeholder="F_D_60M, M_D_60M, F_C_60M, M_C_60M, F_A_LONG_JUMP..."
              className="w-full h-48 bg-gray-950 border border-gray-700 rounded-lg p-4 text-white font-mono text-sm focus:border-purple-500 focus:outline-none custom-scrollbar"
            />
          </div>
          <div className="mt-4 p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg">
            <p className="text-xs text-purple-300">💡 提示：<br/>1. 只要將你想優先列印的賽事代碼寫在前面即可。<br/>2. 未填寫在此清單的賽事，會自動排在最後面並依照字母排序。</p>
          </div>
        </div>

      </div>

      <div className="mt-8 max-w-6xl">
        <button onClick={handleSave} disabled={isSaving} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-5 rounded-2xl text-2xl shadow-lg transition-colors">
          {isSaving ? "儲存中..." : "💾 儲存所有大會設定"}
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
