// src/pages/LeaguePage.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { Trophy, Medal } from 'lucide-react';

const LeaguePage = () => {
  const [gradesData, setGradesData] = useState({ '6': [], '5': [], '4': [], '3': [] });
  const [selectedGrade, setSelectedGrade] = useState('6'); // 預設顯示六年級
  const [totalPoints, setTotalPoints] = useState(0);

  const gradeNames = { '6': '六年級 (P6)', '5': '五年級 (P5)', '4': '四年級 (P4)', '3': '三年級 (P3)' };

  useEffect(() => {
    const q = query(collection(db, "score_logs"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = [];
      snapshot.forEach(doc => logs.push(doc.data()));

      // 依據年級與班別進行加總
      const aggregated = { '6': {}, '5': {}, '4': {}, '3': {} };
      let total = 0;

      logs.forEach(log => {
        const classPrefix = String(log.class).charAt(0); // 抓取第一個字元 (例如 '6'A -> '6')
        if (aggregated[classPrefix] !== undefined) {
          if (!aggregated[classPrefix][log.class]) aggregated[classPrefix][log.class] = 0;
          aggregated[classPrefix][log.class] += log.points;
        }
        total += log.points;
      });

      // 轉換並排序各年級的資料
      const newGradesData = {};
      Object.keys(aggregated).forEach(grade => {
        newGradesData[grade] = Object.keys(aggregated[grade])
          .map(className => ({ name: className, points: aggregated[grade][className] }))
          .sort((a, b) => b.points - a.points);
      });

      setGradesData(newGradesData);
      setTotalPoints(total);
    });

    return () => unsubscribe();
  }, []);

  const currentStandings = gradesData[selectedGrade] || [];

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="flex justify-between items-end mb-10 border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 flex items-center gap-3">
            <Trophy size={40} className="text-amber-400" />
            各級班際總錦標
          </h1>
          <p className="text-gray-400 mt-2 tracking-widest uppercase">Live Class Standings by Level</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">大會總派發積分</div>
          <div className="text-3xl font-mono font-bold text-emerald-400">{totalPoints} pts</div>
        </div>
      </div>

      {/* 級別切換頁籤 */}
      <div className="flex gap-4 mb-8 bg-gray-900 p-2 rounded-xl border border-gray-800 w-fit">
        {Object.keys(gradeNames).reverse().map(grade => (
          <button
            key={grade}
            onClick={() => setSelectedGrade(grade)}
            className={`px-6 py-3 rounded-lg font-bold text-lg transition-all ${
              selectedGrade === grade 
                ? 'bg-amber-500 text-amber-950 shadow-lg shadow-amber-500/20' 
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {gradeNames[grade]}
          </button>
        ))}
      </div>

      {/* 排行榜內容 */}
      {currentStandings.length === 0 ? (
        <div className="text-center py-20 text-gray-500 border border-dashed border-gray-800 rounded-xl">
          <Medal size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-xl">目前 {gradeNames[selectedGrade]} 尚無任何班級得分紀錄</p>
        </div>
      ) : (
        <div className="space-y-4 max-w-4xl">
          {currentStandings.map((cls, index) => {
            const maxPoints = currentStandings[0].points || 1; // 避免除以 0
            const barWidth = `${(cls.points / maxPoints) * 100}%`;

            return (
              <div key={cls.name} className="flex items-center gap-4 bg-gray-900/50 p-4 rounded-xl border border-gray-800 relative overflow-hidden group hover:bg-gray-800 transition-colors">
                <div className={`w-12 h-12 flex items-center justify-center font-black text-2xl rounded-lg z-10 ${
                  index === 0 ? 'bg-amber-500 text-amber-950 shadow-[0_0_15px_rgba(245,158,11,0.5)]' :
                  index === 1 ? 'bg-gray-300 text-gray-900 shadow-[0_0_10px_rgba(209,213,219,0.5)]' :
                  index === 2 ? 'bg-orange-700 text-orange-100 shadow-[0_0_10px_rgba(194,65,12,0.5)]' :
                  'bg-gray-800 text-gray-500'
                }`}>
                  {index + 1}
                </div>
                <div className="w-16 text-2xl font-black text-white z-10">{cls.name}</div>
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
                    <span className="font-mono font-black text-xl text-white shadow-sm drop-shadow-md">{cls.points}</span>
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
