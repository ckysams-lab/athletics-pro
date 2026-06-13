// src/pages/SettingsPage.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const SettingsPage = () => {
  const [points, setPoints] = useState([9, 7, 6, 5, 4, 3, 2, 1]);
  const [relayMultiplier, setRelayMultiplier] = useState(2);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const docRef = doc(db, 'settings', 'scoring');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.points) setPoints(data.points);
        if (data.relayMultiplier) setRelayMultiplier(data.relayMultiplier);
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
        relayMultiplier: Number(relayMultiplier)
      });
      alert("✅ 大會計分規則已儲存！");
    } catch (error) {
      console.error("儲存失敗:", error);
      alert("❌ 儲存失敗！");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8 min-h-screen bg-gray-950 text-white">
      <h1 className="text-4xl font-bold text-emerald-400 mb-8">⚙️ 大會計分系統設定</h1>
      
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-2xl shadow-xl">
        <h2 className="text-2xl font-bold text-amber-400 mb-6">各名次得分設定 (單項)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {points.map((pt, idx) => (
            <div key={idx} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
              <label className="block text-sm text-gray-400 mb-2">第 {idx + 1} 名</label>
              <input 
                type="number" 
                value={pt} 
                onChange={(e) => handlePointChange(idx, e.target.value)}
                className="w-full bg-gray-950 border border-gray-600 rounded p-2 text-xl font-bold text-white text-center focus:border-emerald-500 focus:outline-none"
              />
            </div>
          ))}
        </div>

        <h2 className="text-2xl font-bold text-blue-400 mb-6 border-t border-gray-800 pt-6">接力賽得分倍數</h2>
        <div className="flex items-center gap-4 mb-8">
          <input 
            type="number" 
            step="0.1"
            value={relayMultiplier} 
            onChange={(e) => setRelayMultiplier(e.target.value)}
            className="w-32 bg-gray-950 border border-gray-600 rounded p-4 text-3xl font-bold text-blue-400 text-center focus:border-blue-500 focus:outline-none"
          />
          <span className="text-xl text-gray-400">倍 (例如 2 代表雙倍積分)</span>
        </div>

        <button 
          onClick={handleSave} 
          disabled={isSaving}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl text-xl shadow-lg transition-colors"
        >
          {isSaving ? "儲存中..." : "💾 儲存大會設定"}
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
