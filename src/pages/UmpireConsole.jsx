// src/pages/UmpireConsole.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, doc, writeBatch, getDoc } from 'firebase/firestore';

const UmpireConsole = () => {
  const [pendingRaces, setPendingRaces] = useState([]);
  const [selectedRace, setSelectedRace] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [scoringSettings, setScoringSettings] = useState({ 
    points: [9, 7, 6, 5, 4, 3, 2, 1], 
    relayMultiplier: 2 
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const settingsSnap = await getDoc(doc(db, 'settings', 'scoring'));
      if (settingsSnap.exists()) {
        setScoringSettings(settingsSnap.data());
      }

      const q = query(collection(db, "races"), where("status", "==", "PENDING"));
      const querySnapshot = await getDocs(q);
      const races = [];
      querySnapshot.forEach((doc) => {
        races.push({ id: doc.id, ...doc.data() });
      });
      
      races.sort((a, b) => {
        if (a.eventId !== b.eventId) return a.eventId.localeCompare(b.eventId);
        if (a.stage !== b.stage) return a.stage === 'FINAL' ? 1 : -1;
        return a.groupNo - b.groupNo;
      });

      setPendingRaces(races);
    } catch (error) {
      console.error("資料讀取失敗:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectRace = (race) => {
    // 👉 修復：改用 JUMP 或 BALL 來精準判斷田賽，避免被 男子(M) 誤導
    const isFieldEvent = race.eventId.includes('JUMP') || race.eventId.includes('BALL');
    
    const raceWithInputState = {
      ...race,
      isFieldEvent,
      entries: race.entries.map(entry => ({
        ...entry,
        attempts: isFieldEvent ? ['', '', ''] : undefined, 
        performanceValue: '', 
        entryStatus: 'VALID'
      }))
    };
    setSelectedRace(raceWithInputState);
  };

  const handleFieldScoreChange = (laneOrOrder, attemptIndex, value) => {
    if (!selectedRace) return;
    
    const newEntries = selectedRace.entries.map(entry => {
      if (entry.lane === laneOrOrder) {
        const newAttempts = [...entry.attempts];
        newAttempts[attemptIndex] = value;
        
        const validScores = newAttempts.map(v => parseFloat(v)).filter(v => !isNaN(v));
        const bestScore = validScores.length > 0 ? Math.max(...validScores).toString() : '';

        return { ...entry, attempts: newAttempts, performanceValue: bestScore };
      }
      return entry;
    });
    setSelectedRace({ ...selectedRace, entries: newEntries });
  };

  const handleTrackScoreChange = (lane, value) => {
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
          performanceValue: newStatus !== 'VALID' ? '' : entry.performanceValue,
          attempts: selectedRace.isFieldEvent && newStatus !== 'VALID' ? ['', '', ''] : entry.attempts
        };
      }
      return entry;
    });
    setSelectedRace({ ...selectedRace, entries: newEntries });
  };

  const handleSubmitResults = async () => {
    if (!selectedRace) return;

    const safeRaceId = selectedRace.id || `${selectedRace.eventId}_FINAL`;
    if (!safeRaceId || safeRaceId === "undefined_FINAL") {
      alert("❌ 嚴重的系統錯誤：無法取得賽事的有效 ID！這場賽事無法發佈。");
      return;
    }

    const missingScores = selectedRace.entries.some(e => e.entryStatus === 'VALID' && e.performanceValue === '');
    if (missingScores) {
      const confirmSubmit = window.confirm("⚠️ 有參賽者尚未輸入成績！確定要發佈嗎？(未輸入者將被視為無成績)");
      if (!confirmSubmit) return;
    }

    setIsSubmitting(true);
    try {
      const batch = writeBatch(db); 
      
      let finalizedEntries = selectedRace.entries.map(entry => ({
        ...entry,
        performanceValue: entry.entryStatus === 'VALID' ? parseFloat(entry.performanceValue) || null : null,
        displayMark: entry.entryStatus === 'VALID' && entry.performanceValue 
          ? `${entry.performanceValue}${selectedRace.isFieldEvent ? 'm' : 's'}` 
          : entry.entryStatus
      }));

      if (selectedRace.stage === 'FINAL') {
        const validEntries = finalizedEntries.filter(e => e.entryStatus === 'VALID' && e.performanceValue !== null);
        
        if (selectedRace.isFieldEvent) {
          validEntries.sort((a, b) => b.performanceValue - a.performanceValue); 
        } else {
          validEntries.sort((a, b) => a.performanceValue - b.performanceValue); 
        }

        const pointsRule = scoringSettings.points;
        const isRelay = selectedRace.eventId.includes('RELAY');
        const multiplier = isRelay ? (scoringSettings.relayMultiplier || 1) : 1;

        validEntries.forEach((entry, index) => {
          entry.rank = index + 1;
          entry.points = (pointsRule[index] || 0) * multiplier; 
          
          const originalEntry = finalizedEntries.find(e => e.lane === entry.lane);
          if (originalEntry) {
            originalEntry.rank = entry.rank;
            originalEntry.points = entry.points;
          }

          const rawLogData = {
            class: entry.class || "未知",
            studentName: entry.name || "未知",
            eventId: selectedRace.eventId || "未知",
            points: entry.points || 0,
            rank: entry.rank || 0,
            timestamp: new Date().toISOString()
          };

          const safeLogData = JSON.parse(JSON.stringify(rawLogData));
          const scoreRecordRef = doc(collection(db, 'score_logs'));
          batch.set(scoreRecordRef, safeLogData);
        });
      }

      const rawUpdateData = {
        entries: finalizedEntries,
        status: "OFFICIAL", 
        updatedAt: new Date().toISOString()
      };

      const safeUpdateData = JSON.parse(JSON.stringify(rawUpdateData));
      const raceRef = doc(db, 'races', safeRaceId);
      batch.update(raceRef, safeUpdateData);

      await batch.commit();

      alert("✅ 官方成績已發佈！" + (selectedRace.stage === 'FINAL' ? "班際積分已同步派發。" : "大屏幕即將同步。"));
      setSelectedRace(null); 
      fetchData(); 
    } catch (error) {
      console.error("成績發佈失敗:", error);
      alert(`❌ 發佈失敗: ${error.message}`); 
    } finally {
      setIsSubmitting(false);
    }
  };

  const getLivePreviewRankings = () => {
    if (!selectedRace || selectedRace.stage !== 'FINAL') return [];
    
    const validEntries = selectedRace.entries
      .filter(e => e.entryStatus === 'VALID' && e.performanceValue !== '')
      .map(e => ({ ...e, tempScore: parseFloat(e.performanceValue) }));
    
    if (selectedRace.isFieldEvent) {
      validEntries.sort((a, b) => b.tempScore - a.tempScore);
    } else {
      validEntries.sort((a, b) => a.tempScore - b.tempScore);
    }
    
    const pointsRule = scoringSettings.points;
    const isRelay = selectedRace.eventId.includes('RELAY');
    const multiplier = isRelay ? (scoringSettings.relayMultiplier || 1) : 1;
    
    return validEntries.map((entry, index) => ({
      ...entry,
      previewRank: index + 1,
      previewPoints: (pointsRule[index] || 0) * multiplier
    }));
  };

  const previewRankings = getLivePreviewRankings();

  return (
    <div className="p-8 pb-32">
      <div className="flex justify-between items-end border-b border-gray-800 pb-4 mb-8">
        <div>
          <h1 className="text-4xl font-bold text-amber-400">⏱️ 官方裁判終端機</h1>
          <p className="text-gray-400 mt-2">點選賽事進行成績輸入。自動支援田賽(三次試擲)與徑賽介面。</p>
        </div>
        <button onClick={fetchData} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
          🔄 重新整理賽事
        </button>
      </div>

      <div className="flex flex-col xl:flex-row gap-8">
        
        {/* 左側列表 */}
        <div className="w-full xl:w-1/3 bg-gray-900 border border-gray-800 rounded-xl p-5 h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar shadow-xl">
          <h2 className="text-xl font-bold text-gray-200 mb-4 sticky top-0 bg-gray-900 pb-2">📋 待處理賽事 ({pendingRaces.length})</h2>
          
          {isLoading ? (
            <div className="text-center text-gray-500 py-10 animate-pulse">正在同步賽程...</div>
          ) : pendingRaces.length === 0 ? (
            <div className="text-center text-emerald-500 py-10 font-bold bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              🎉 所有預定賽事皆已完成計時。
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRaces.map(race => {
                // 👉 修復：改用 JUMP 或 BALL 來判斷是否為田賽
                const isField = race.eventId.includes('JUMP') || race.eventId.includes('BALL');
                return (
                  <button
                    key={race.id}
                    onClick={() => handleSelectRace(race)}
                    className={`w-full text-left p-4 rounded-xl transition-all border ${
                      selectedRace?.id === race.id 
                        ? race.stage === 'FINAL' 
                            ? 'bg-purple-500/20 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.2)]' 
                            : 'bg-amber-500/20 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)]'  
                        : 'bg-gray-800 border-gray-700 hover:border-gray-500 hover:bg-gray-750'
                    }`}
                  >
                    <div className={`text-xs font-bold mb-1 flex items-center gap-2 ${race.stage === 'FINAL' ? 'text-purple-400' : 'text-amber-400'}`}>
                      {isField ? '【田項】' : '【徑項】'} 
                      {race.stage === 'FINAL' ? '🏆 決賽 (FINAL)' : `初賽 (HEAT) - 第 ${race.groupNo} 組`}
                      {race.eventId.includes('RELAY') && <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-[10px]">接力 x{scoringSettings.relayMultiplier}</span>}
                    </div>
                    <div className="text-lg font-bold text-white">{race.eventId}</div>
                    <div className="text-sm text-gray-400 mt-2 flex justify-between">
                      <span>參賽人數: {race.entries.length}</span>
                      <span className="text-blue-400">點擊輸入 ➔</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* 右側輸入面板 */}
        <div className="w-full xl:w-2/3">
          {!selectedRace ? (
             <div className="h-full flex flex-col items-center justify-center bg-gray-900/50 border-2 border-dashed border-gray-700 rounded-xl p-10 text-gray-500">
               <svg className="w-20 h-20 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
               <h2 className="text-2xl font-bold">請從左側選擇一場賽事</h2>
             </div>
          ) : (
            <div className={`border rounded-xl p-6 shadow-2xl bg-gray-900 flex flex-col ${selectedRace.stage === 'FINAL' ? 'border-purple-500/30' : 'border-amber-500/30'}`}>
              
              <div className="flex justify-between items-center mb-8 bg-gray-950 p-4 rounded-lg border border-gray-800">
                <div>
                  <div className={`font-bold text-sm ${selectedRace.stage === 'FINAL' ? 'text-purple-400' : 'text-amber-400'}`}>
                    正在輸入 {selectedRace.isFieldEvent ? '田賽 (距離)' : '徑賽 (秒數)'}
                  </div>
                  <h2 className="text-3xl font-black tracking-wide">{selectedRace.eventId}</h2>
                  <div className="text-gray-400 mt-1">
                    {selectedRace.stage === 'FINAL' ? '🏆 決賽' : `初賽 - 第 ${selectedRace.groupNo} 組`}
                    {selectedRace.eventId.includes('RELAY') && <span className="ml-2 text-blue-400 font-bold">(接力賽雙倍積分)</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 mb-1">系統狀態</div>
                  <div className="text-emerald-400 font-bold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                    雲端連線正常
                  </div>
                </div>
              </div>

              <div className="flex flex-col lg:flex-row gap-6 mb-8">
                
                {/* 輸入區塊 */}
                <div className={`space-y-4 ${selectedRace.stage === 'FINAL' ? 'lg:w-2/3' : 'w-full'}`}>
                  {selectedRace.entries.map((entry) => (
                    <div 
                      key={entry.lane} 
                      className={`flex flex-col p-4 rounded-xl border transition-colors gap-3 ${
                        entry.entryStatus === 'VALID' 
                          ? 'bg-gray-800 border-gray-700' 
                          : 'bg-red-950/30 border-red-500/30 opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-gray-700/50 pb-3">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-gray-900 border border-gray-700 flex flex-col items-center justify-center shrink-0">
                            <span className="text-[9px] text-gray-500 font-bold">{selectedRace.isFieldEvent ? 'ORDER' : 'LANE'}</span>
                            <span className="text-lg font-black text-white leading-none">{entry.lane}</span>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-gray-100 flex items-center gap-2">
                              {entry.name}
                              {entry.qualification && (
                                <span className="text-xs bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30 shrink-0">
                                  {entry.qualification}
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded mt-1 inline-block">
                              {entry.class}
                            </div>
                          </div>
                        </div>

                        <div className="flex bg-gray-950 rounded-lg p-1 border border-gray-800 shrink-0">
                           <button onClick={() => handleStatusChange(entry.lane, 'VALID')} className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${entry.entryStatus === 'VALID' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-white'}`}>正常</button>
                          <button onClick={() => handleStatusChange(entry.lane, 'ABS')} className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${entry.entryStatus === 'ABS' ? 'bg-orange-600 text-white' : 'text-gray-500 hover:text-white'}`}>ABS</button>
                          <button onClick={() => handleStatusChange(entry.lane, 'DQ')} className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${entry.entryStatus === 'DQ' ? 'bg-red-600 text-white' : 'text-gray-500 hover:text-white'}`}>DQ</button>
                        </div>
                      </div>

                      <div className="flex items-center justify-end w-full">
                        {selectedRace.isFieldEvent ? (
                          <div className="flex flex-wrap items-center justify-end gap-2 w-full">
                            {[0, 1, 2].map(attemptIdx => (
                              <div key={attemptIdx} className="relative">
                                <input 
                                  type="number" step="0.01" placeholder={`第${attemptIdx+1}次`}
                                  value={entry.attempts[attemptIdx]}
                                  onChange={(e) => handleFieldScoreChange(entry.lane, attemptIdx, e.target.value)}
                                  disabled={entry.entryStatus !== 'VALID'}
                                  className="w-20 text-center text-lg font-bold font-mono py-2 px-1 rounded bg-gray-950 border border-gray-700 text-white focus:border-emerald-500 focus:outline-none placeholder-gray-600"
                                />
                              </div>
                            ))}
                            <div className="w-24 ml-2 bg-emerald-900/20 border-2 border-emerald-500/50 rounded-lg p-2 text-center shadow-inner">
                              <div className="text-[10px] text-emerald-500 font-black mb-1 uppercase tracking-widest">最佳(m)</div>
                              <div className="text-xl font-black font-mono text-emerald-400 leading-none">{entry.performanceValue || '-'}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="relative">
                            <input 
                              type="number" step="0.01" placeholder="00.00" value={entry.performanceValue}
                              onChange={(e) => handleTrackScoreChange(entry.lane, e.target.value)}
                              disabled={entry.entryStatus !== 'VALID'}
                              className="w-32 text-right text-3xl font-black font-mono p-2 rounded-lg bg-gray-950 border border-gray-700 text-white focus:border-blue-500 focus:outline-none"
                            />
                            <span className="absolute right-3 bottom-1 text-xs font-bold text-gray-600">s</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {selectedRace.stage === 'FINAL' && (
                  <div className="lg:w-1/3 bg-gray-950 rounded-xl border border-purple-500/30 p-4">
                    <h3 className="text-purple-400 font-bold mb-4 flex items-center gap-2">
                      <span>🏆</span> 即時班際積分試算
                    </h3>
                    
                    {previewRankings.length === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-10 border border-dashed border-gray-800 rounded-lg">
                        輸入成績後，此處將即時顯示各班可獲得的積分。
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {previewRankings.map((student) => (
                          <div key={student.lane} className="flex justify-between items-center bg-gray-900 p-2 rounded border border-gray-800">
                            <div className="flex items-center gap-2">
                              <span className={`w-6 h-6 flex items-center justify-center rounded text-xs font-bold ${
                                student.previewRank === 1 ? 'bg-amber-500 text-amber-950' :
                                student.previewRank === 2 ? 'bg-gray-300 text-gray-900' :
                                student.previewRank === 3 ? 'bg-orange-700 text-orange-100' :
                                'bg-gray-800 text-gray-400'
                              }`}>
                                {student.previewRank}
                              </span>
                              <span className="text-sm font-bold text-gray-200">{student.class}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-xs text-emerald-400">{student.performanceValue}{selectedRace.isFieldEvent ? 'm' : 's'}</span>
                              <span className="font-bold text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded text-sm">
                                +{student.previewPoints}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
