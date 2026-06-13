// src/pages/UmpireConsole.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, doc, writeBatch } from 'firebase/firestore';

const UmpireConsole = () => {
  const [pendingRaces, setPendingRaces] = useState([]);
  const [selectedRace, setSelectedRace] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 載入尚未發佈成績的賽事
  const fetchRaces = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, "races"), where("status", "==", "PENDING"));
      const querySnapshot = await getDocs(q);
      const races = [];
      querySnapshot.forEach((doc) => {
        races.push({ id: doc.id, ...doc.data() });
      });
      
      // 排序邏輯：先排 EventID，同 Event 中把決賽 (FINAL) 排在初賽 (HEAT) 之後
      races.sort((a, b) => {
        if (a.eventId !== b.eventId) return a.eventId.localeCompare(b.eventId);
        if (a.stage !== b.stage) return a.stage === 'FINAL' ? 1 : -1;
        return a.groupNo - b.groupNo;
      });

      setPendingRaces(races);
    } catch (error) {
      console.error("讀取賽事失敗:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRaces();
  }, []);

  const handleSelectRace = (race) => {
    const raceWithInputState = {
      ...race,
      entries: race.entries.map(entry => ({
        ...entry,
        performanceValue: '', 
        entryStatus: 'VALID'
      }))
    };
    setSelectedRace(raceWithInputState);
  };

  const handleScoreChange = (lane, value) => {
    if (!selectedRace) return;
    const newEntries = selectedRace.entries.map(entry => {
      if (entry.lane === lane) {
        return { ...entry, performanceValue: value };
      }
      return entry;
    });
    setSelectedRace({ ...selectedRace, entries: newEntries });
  };

  const handleStatusChange = (lane, newStatus) => {
    if (!selectedRace) return;
    const newEntries = selectedRace.entries.map(entry => {
      if (entry.lane === lane) {
        return { 
          ...entry, 
          entryStatus: newStatus,
          performanceValue: newStatus !== 'VALID' ? '' : entry.performanceValue
        };
      }
      return entry;
    });
    setSelectedRace({ ...selectedRace, entries: newEntries });
  };

  // 提交官方成績到 Firebase (包含自動計分)
  const handleSubmitResults = async () => {
    if (!selectedRace) return;

    const missingScores = selectedRace.entries.some(e => e.entryStatus === 'VALID' && e.performanceValue === '');
    if (missingScores) {
      const confirmSubmit = window.confirm("⚠️ 有參賽者尚未輸入成績！確定要發佈嗎？(未輸入者將被視為無成績)");
      if (!confirmSubmit) return;
    }

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db); // 使用 Batch 確保成績與積分同時寫入
      
      // 1. 處理成績與排序
      let finalizedEntries = selectedRace.entries.map(entry => ({
        ...entry,
        performanceValue: entry.entryStatus === 'VALID' ? parseFloat(entry.performanceValue) || null : null,
        displayMark: entry.entryStatus === 'VALID' && entry.performanceValue ? `${entry.performanceValue}s` : entry.entryStatus
      }));

      // 只有決賽 (FINAL) 才需要計算名次和積分
      if (selectedRace.stage === 'FINAL') {
        // 將有效成績挑出來排序 (由小到大，秒數越少越快)
        const validEntries = finalizedEntries.filter(e => e.entryStatus === 'VALID' && e.performanceValue !== null);
        validEntries.sort((a, b) => a.performanceValue - b.performanceValue);

        // 定義積分規則 (1st->9, 2nd->7, 3rd->6, 4th->5, 5th->4, 6th->3, 7th->2, 8th->1)
        const pointsRule = [9, 7, 6, 5, 4, 3, 2, 1];

        // 給予名次 (rank) 與積分 (points)
        validEntries.forEach((entry, index) => {
          entry.rank = index + 1;
          entry.points = pointsRule[index] || 0; // 如果超過 8 名則 0 分
          
          // 更新原本陣列裡的資料
          const originalEntry = finalizedEntries.find(e => e.lane === entry.lane);
          originalEntry.rank = entry.rank;
          originalEntry.points = entry.points;

          // 👉 關鍵：將積分寫入班級總分 (class_standings 集合的得分紀錄表)
          // 這邊利用 doc(collection(...)) 產生自動 ID 來寫入獨立的 log
          const scoreRecordRef = doc(collection(db, 'score_logs'));
          batch.set(scoreRecordRef, {
            class: entry.class,
            studentName: entry.name,
            eventId: selectedRace.eventId,
            points: entry.points,
            rank: entry.rank,
            timestamp: new Date().toISOString()
          });
        });
      }

      // 2. 更新賽事狀態為 OFFICIAL
      const raceRef = doc(db, 'races', selectedRace.id);
      batch.update(raceRef, {
        entries: finalizedEntries,
        status: "OFFICIAL", 
        updatedAt: new Date().toISOString()
      });

      // 3. 提交所有變更
      await batch.commit();

      alert("✅ 官方成績已發佈！" + (selectedRace.stage === 'FINAL' ? "班際積分已同步派發。" : "大屏幕即將同步。"));
      setSelectedRace(null); 
      fetchRaces(); 
    } catch (error) {
      console.error("成績發佈失敗:", error);
      alert("❌ 發佈失敗，請檢查網路連線。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 pb-32">
      <div className="flex justify-between items-end border-b border-gray-800 pb-4 mb-8">
        <div>
          <h1 className="text-4xl font-bold text-amber-400">⏱️ 官方裁判終端機</h1>
          <p className="text-gray-400 mt-2">點選賽事進行成績輸入。成績發佈後將即時同步至看台大屏幕。</p>
        </div>
        <button onClick={fetchRaces} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
          🔄 重新整理賽事
        </button>
      </div>

      <div className="flex flex-col xl:flex-row gap-8">
        
        {/* 左側：等待檢錄與計時的賽事列表 */}
        <div className="w-full xl:w-1/3 bg-gray-900 border border-gray-800 rounded-xl p-5 h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar shadow-xl">
          <h2 className="text-xl font-bold text-gray-200 mb-4 sticky top-0 bg-gray-900 pb-2">📋 待處理賽事 ({pendingRaces.length})</h2>
          
          {isLoading ? (
            <div className="text-center text-gray-500 py-10 animate-pulse">正在從大會伺服器同步賽程...</div>
          ) : pendingRaces.length === 0 ? (
            <div className="text-center text-emerald-500 py-10 font-bold bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              🎉 太棒了！所有預定賽事皆已完成計時。
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRaces.map(race => (
                <button
                  key={race.id}
                  onClick={() => handleSelectRace(race)}
                  className={`w-full text-left p-4 rounded-xl transition-all border ${
                    selectedRace?.id === race.id 
                      ? race.stage === 'FINAL' 
                          ? 'bg-purple-500/20 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.2)]' // 決賽選中時發紫光
                          : 'bg-amber-500/20 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)]'  // 初賽選中時發黃光
                      : 'bg-gray-800 border-gray-700 hover:border-gray-500 hover:bg-gray-750'
                  }`}
                >
                  <div className={`text-xs font-bold mb-1 ${race.stage === 'FINAL' ? 'text-purple-400' : 'text-amber-400'}`}>
                    【徑項】{race.stage === 'FINAL' ? '🏆 決賽 (FINAL)' : `初賽 (HEAT) - 第 ${race.groupNo} 組`}
                  </div>
                  <div className="text-lg font-bold text-white">{race.eventId}</div>
                  <div className="text-sm text-gray-400 mt-2 flex justify-between">
                    <span>參賽人數: {race.entries.length}</span>
                    <span className="text-blue-400">點擊輸入成績 ➔</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 右側：成績輸入面板 */}
        <div className="w-full xl:w-2/3">
          {!selectedRace ? (
            <div className="h-full flex flex-col items-center justify-center bg-gray-900/50 border-2 border-dashed border-gray-700 rounded-xl p-10 text-gray-500">
              <svg className="w-20 h-20 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <h2 className="text-2xl font-bold">請從左側選擇一場賽事</h2>
            </div>
          ) : (
            <div className={`border rounded-xl p-6 shadow-2xl bg-gray-900 ${selectedRace.stage === 'FINAL' ? 'border-purple-500/30' : 'border-amber-500/30'}`}>
              
              <div className="flex justify-between items-center mb-8 bg-gray-950 p-4 rounded-lg border border-gray-800">
                <div>
                  <div className={`font-bold text-sm ${selectedRace.stage === 'FINAL' ? 'text-purple-400' : 'text-amber-400'}`}>
                    正在輸入成績
                  </div>
                  <h2 className="text-3xl font-black tracking-wide">{selectedRace.eventId}</h2>
                  <div className="text-gray-400 mt-1">{selectedRace.stage === 'FINAL' ? '🏆 決賽' : `初賽 - 第 ${selectedRace.groupNo} 組`}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 mb-1">系統狀態</div>
                  <div className="text-emerald-400 font-bold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                    雲端連線正常
                  </div>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                {selectedRace.entries.map((entry) => (
                  <div 
                    key={entry.lane} 
                    className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                      entry.entryStatus === 'VALID' 
                        ? 'bg-gray-800 border-gray-700 hover:border-gray-500' 
                        : entry.entryStatus === 'ABS'
                          ? 'bg-orange-950/30 border-orange-500/30 opacity-75'
                          : 'bg-red-950/30 border-red-500/30 opacity-75'
                    }`}
                  >
                    
                    <div className="flex items-center gap-6 w-1/2">
                      <div className="w-12 h-12 rounded-lg bg-gray-900 border border-gray-700 flex flex-col items-center justify-center shadow-inner">
                        <span className="text-[10px] text-gray-500 font-bold">LANE</span>
                        <span className="text-xl font-black text-white leading-none">{entry.lane}</span>
                      </div>
                      <div>
                        <div className="text-xl font-bold text-gray-100 flex items-center gap-2">
                          {entry.name}
                          {entry.qualification && (
                            <span className="text-xs bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">
                              {entry.qualification}
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded mt-1 inline-block">
                          {entry.class}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex bg-gray-950 rounded-lg p-1 border border-gray-800">
                         <button onClick={() => handleStatusChange(entry.lane, 'VALID')} className={`px-3 py-2 text-sm font-bold rounded-md transition-colors ${entry.entryStatus === 'VALID' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>正常</button>
                        <button onClick={() => handleStatusChange(entry.lane, 'ABS')} className={`px-3 py-2 text-sm font-bold rounded-md transition-colors ${entry.entryStatus === 'ABS' ? 'bg-orange-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>ABS</button>
                        <button onClick={() => handleStatusChange(entry.lane, 'DQ')} className={`px-3 py-2 text-sm font-bold rounded-md transition-colors ${entry.entryStatus === 'DQ' ? 'bg-red-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>DQ</button>
                      </div>

                      <div className="relative">
                        <input 
                          type="number" step="0.01" placeholder="00.00" value={entry.performanceValue}
                          onChange={(e) => handleScoreChange(entry.lane, e.target.value)}
                          disabled={entry.entryStatus !== 'VALID'}
                          className={`w-32 text-right text-3xl font-black font-mono p-3 rounded-lg border focus:outline-none transition-all ${
                            entry.entryStatus === 'VALID'
                              ? entry.performanceValue 
                                ? 'bg-gray-950 border-emerald-500/50 text-emerald-400 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.1)]'
                                : 'bg-gray-950 border-gray-700 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                              : 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed'
                          }`}
                        />
                        <span className={`absolute right-3 bottom-1 text-sm font-bold ${entry.performanceValue && entry.entryStatus === 'VALID' ? 'text-emerald-500' : 'text-gray-600'}`}>s</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-6 border-t border-gray-800 flex justify-between items-center">
                <p className="text-gray-400 text-sm">💡 提示：確認無誤後點擊發佈。</p>
                <button 
                  onClick={handleSubmitResults} disabled={isSubmitting}
                  className={`flex items-center gap-3 px-8 py-4 rounded-xl font-black text-xl transition-all shadow-xl hover:-translate-y-1 ${
                    isSubmitting 
                      ? 'bg-emerald-600 hover:bg-emerald-600 animate-pulse text-white cursor-not-allowed'
                      : 'bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-white shadow-emerald-500/20'
                  }`}
                >
                  {isSubmitting ? "資料上傳中..." : <><span>發佈官方成績</span></>}
                </button>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UmpireConsole;
