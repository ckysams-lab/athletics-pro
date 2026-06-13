// src/pages/LeaguePage.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { Trophy, Medal } from 'lucide-react';

const LeaguePage = () => {
  const [classStandings, setClassStandings] = useState([]);
  const [totalPoints, setTotalPoints] = useState(0);

  useEffect(() => {
    // 即時監聽得分紀錄
    const q = query(collection(db, "score_logs"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = [];
      snapshot.forEach(doc => logs.push(doc.data()));

      // 依據班別 (class) 進行加總
      const aggregated = logs.reduce((acc, log) => {
        if (!acc[log.class]) acc[log.class] = 0;
        acc[log.class] += log.points;
        return acc;
      }, {});

      // 轉換成陣列並排序 (分數高的在前面)
      const sortedStandings = Object.keys(aggregated)
        .map(className => ({ name: className, points: aggregated[className] }))
        .sort((a, b) => b.points - a.points);

      setClassStandings(sortedStandings);
      setTotalPoints(logs.reduce((sum, log) => sum + log.points, 0));
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="flex justify-between items-center mb-10 border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 flex items-center gap-3">
            <Trophy size={40} className="text-amber-400" />
            全場班際總錦標
          </h1>
          <p className="text-gray-400 mt-2 tracking-widest uppercase">Live Class Standings</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">大會總派發積分</div>
          <div className="text-3xl font-mono font-bold text-emerald-400">{totalPoints} pts</div>
        </div>
      </div>

      {classStandings.length === 0 ? (
        <div className="text-center py-20 text-gray-500 border border-dashed border-gray-800 rounded-xl">
          <Medal size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-xl">目前尚無任何班級得分紀錄</p>
          <p className="text-sm mt-2">請於裁判終端機發佈「決賽」成績以產生積分</p>
        </div>
      ) : (
        <div className="space-y-4 max-w-4xl mx-auto">
          {classStandings.map((cls, index) => {
            // 計算最高分作為長條圖的 100% 基準
            const maxPoints = classStandings[0].points;
            const barWidth = `${(cls.points / maxPoints) * 100}%`;

            return (
              <div key={cls.name} className="flex items-center gap-4 bg-gray-900/50 p-4 rounded-xl border border-gray-800 relative overflow-hidden group hover:bg-gray-800 transition-colors">
                
                {/* 名次 (1, 2, 3 有特殊顏色) */}
                <div className={`w-12 h-12 flex items-center justify-center font-black text-2xl rounded-lg z-10 ${
                  index === 0 ? 'bg-amber-500 text-amber-950 shadow-[0_0_15px_rgba(245,158,11,0.5)]' :
                  index === 1 ? 'bg-gray-300 text-gray-900 shadow-[0_0_10px_rgba(209,213,219,0.5)]' :
                  index === 2 ? 'bg-orange-700 text-orange-100 shadow-[0_0_10px_rgba(194,65,12,0.5)]' :
                  'bg-gray-800 text-gray-500'
                }`}>
                  {index + 1}
                </div>

                {/* 班別名稱 */}
                <div className="w-16 text-2xl font-black text-white z-10">{cls.name}</div>

                {/* 長條圖與分數 */}
                <div className="flex-1 h-12 relative bg-gray-950 rounded-r-lg overflow-hidden border-y border-r border-gray-800 z-10">
                  <div 
                    className={`h-full transition-all duration-1000 ease-out flex items-center justify-end pr-4 ${
                      index === 0 ? 'bg-gradient-to-r from-amber-600/50 to-amber-500' :
                      index === 1 ? 'bg-gradient-to-r from-gray-600/50 to-gray-400' :
                      index === 2 ? 'bg-gradient-to-r from-orange-900/50 to-orange-700' :
                      'bg-gradient-to-r from-blue-900/50 to-blue-700'
                    }`}
                    style={{ width: barWidth }}
                  >
                    <span className="font-mono font-black text-xl text-white shadow-sm drop-shadow-md">
                      {cls.points}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LeaguePage;
