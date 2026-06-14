// src/pages/UmpireConsole.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, doc, writeBatch, getDoc } from 'firebase/firestore';

const UmpireConsole = () => {
  const [pendingRaces, setPendingRaces] = useState([]);
  const [officialRaces, setOfficialRaces] = useState([]);
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

      const qPending = query(collection(db, "races"), where("status", "==", "PENDING"));
      const qOfficial = query(collection(db, "races"), where("status", "==", "OFFICIAL"));
      
      const [snapPending, snapOfficial] = await Promise.all([getDocs(qPending), getDocs(qOfficial)]);
      
      const formatRaces = (snapshot) => {
        const races = [];
        snapshot.forEach((doc) => races.push({ id: doc.id, ...doc.data() }));
        races.sort((a, b) => {
          if (a.eventId !== b.eventId) return a.eventId.localeCompare(b.eventId);
          if (a.stage !== b.stage) return a.stage === 'FINAL' ? 1 : -1;
          return a.groupNo - b.groupNo;
        });
        return races;
      };

      setPendingRaces(formatRaces(snapPending));
      setOfficialRaces(formatRaces(snapOfficial));
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
    const isFieldEvent = race.eventId.includes('JUMP') || race.eventId.includes('BALL');
    
    const raceWithInputState = {
      ...race,
      isFieldEvent,
      entries: race.entries.map(entry => ({
        ...entry,
        attempts: entry.attempts || (isFieldEvent ? ['', '', ''] : undefined), 
        performanceValue: entry.performanceValue || '', 
        entryStatus: entry.entryStatus || 'VALID'
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
      alert("❌ 系統錯誤：無法取得賽事的有效 ID！"); return;
    }

    const missingScores = selectedRace.entries.some(e => e.entryStatus === 'VALID' && e.performanceValue === '');
    if (missingScores) {
      if (!window.confirm("⚠️ 有參賽者尚未輸入成績！確定要發佈嗎？(未輸入者將被視為無成績)")) return;
    }

    if (selectedRace.status === 'OFFICIAL') {
      if (!window.confirm("⚠️ 這場比賽已經發佈過了。確定要「覆蓋舊成績」並重新發佈嗎？")) return;
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
        const multiplier = selectedRace.eventId.includes('RELAY') ? (scoringSettings.relayMultiplier || 1) : 1;

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

          batch.set(doc(collection(db, 'score_logs')), JSON.parse(JSON.stringify(rawLogData)));
        });
      }

      const rawUpdateData = {
        entries: finalizedEntries,
        status: "OFFICIAL", 
        updatedAt: new Date().toISOString()
      };

      batch.update(doc(db, 'races', safeRaceId), JSON.parse(JSON.stringify(rawUpdateData)));
      await batch.commit();

      alert("✅ 官方成績已發佈！");
      setSelectedRace(null); 
      fetchData(); 
    } catch (error) {
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
    
    const multiplier = selectedRace.eventId.includes('RELAY') ? (scoringSettings.relayMultiplier || 1) : 1;
    return validEntries.map((entry, index) => ({
      ...entry,
      previewRank: index + 1,
      previewPoints: (scoringSettings.points[index] || 0) * multiplier
    }));
  };

  const previewRankings = getLivePreviewRankings();

  return (
    <div className="p-4 md:p-8 pb-32">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-gray-800 pb-4 mb-8 gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-amber-400">⏱️ 官方裁判終端機</h1>
        </div>
        <button onClick={fetchData} className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2">
          🔄 重新整理賽事
        </button>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        
        {/* 左側列表區塊 - 👉 把寬度鎖定，並讓字體適應 */}
        <div className="w-full xl:w-[35%] flex flex-col gap-6 h-[calc(100vh-200px)]">
          <div className="bg-gray-900 border border-amber-500/30 rounded-xl flex-1 flex flex-col overflow-hidden shadow-xl">
            <div className="p-4 border-b border-gray-800 bg-gray-900 z-10 shadow-sm">
              <h2 className="text-xl font-black text-amber-400 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse"></span> 
                待處理 ({pendingRaces.length})
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
              {isLoading ? (
                <div className="text-center text-gray-500 py-10 animate-pulse">同步中...</div>
              ) : pendingRaces.length === 0 ? (
                <div className="text-center text-emerald-500 py-10 font-bold">🎉 無待處理賽事。</div>
              ) : (
                <div className="space-y-3">
                  {pendingRaces.map(race => {
                    const isField = race.eventId.includes('JUMP') || race.eventId.includes('BALL');
                    return (
                      <button
                        key={race.id}
                        onClick={() => handleSelectRace(race)}
                        className={`w-full text-left p-4 rounded-xl transition-all border-2 ${
                          selectedRace?.id === race.id 
                            ? 'bg-amber-500/20 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]'  
                            : 'bg-gray-800 border-gray-700 hover:border-amber-500/50'
                        }`}
                      >
                        <div className="text-xs font-bold mb-1 text-amber-400">
                          {isField ? '【田項】' : '【徑項】'} {race.stage === 'FINAL' ? '🏆決賽' : `初賽-第${race.groupNo}組`}
                        </div>
                        <div className="text-xl font-black text-white">{race.eventId}</div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 已完成的賽事區塊 */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl flex-[0.5] flex flex-col overflow-hidden shadow-xl">
            <div className="p-4 border-b border-gray-800 bg-gray-900 z-10 shadow-sm">
              <h2 className="text-lg font-bold text-gray-400">✅ 已公佈賽事 ({officialRaces.length})</h2>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
              <div className="space-y-2">
                {officialRaces.map(race => (
                  <button
                    key={race.id}
                    onClick={() => handleSelectRace(race)}
                    className={`w-full text-left p-3 rounded-lg transition-all border-2 ${
                      selectedRace?.id === race.id ? 'bg-gray-700 border-gray-400' : 'bg-gray-800/50 border-gray-800'
                    }`}
                  >
                    <div className="text-base font-bold text-gray-300 flex justify-between items-center">
                      {race.eventId} <span className="text-[10px] text-blue-500 bg-blue-900/30 px-2 py-1 rounded">修改</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 右側輸入面板 */}
        <div className="w-full xl:w-[65%]">
          {!selectedRace ? (
             <div className="h-full flex flex-col items-center justify-center bg-gray-900/50 border-2 border-dashed border-gray-700 rounded-xl p-10 text-gray-500">
               <h2 className="text-3xl font-bold">請從左側選擇一場賽事</h2>
             </div>
          ) : (
            <div className={`border-2 rounded-xl p-4 md:p-8 shadow-2xl bg-gray-900 flex flex-col ${selectedRace.stage === 'FINAL' ? 'border-purple-500/30' : 'border-amber-500/30'}`}>
              
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 bg-gray-950 p-5 rounded-xl border border-gray-800">
                <div>
                  <div className={`font-bold text-base flex items-center gap-2 ${selectedRace.status === 'OFFICIAL' ? 'text-red-400 animate-pulse' : (selectedRace.stage === 'FINAL' ? 'text-purple-400' : 'text-amber-400')}`}>
                    {selectedRace.status === 'OFFICIAL' ? '⚠️ 重新編輯模式' : `正在輸入 ${selectedRace.isFieldEvent ? '田賽 (距離)' : '徑賽 (秒數)'}`}
                  </div>
                  <h2 className="text-3xl md:text-5xl font-black tracking-wide mt-1">{selectedRace.eventId}</h2>
                  <div className="text-gray-400 mt-2 text-lg">
                    {selectedRace.stage === 'FINAL' ? '🏆 決賽' : `初賽 - 第 ${selectedRace.groupNo} 組`}
                  </div>
                </div>
              </div>

              <div className="flex flex-col xl:flex-row gap-6 mb-8">
                
                {/* 👉 全新的強制垂直 (Stacking) 卡片排版 */}
                <div className={`space-y-4 ${selectedRace.stage === 'FINAL' ? 'xl:w-[60%]' : 'w-full'}`}>
                  {selectedRace.entries.map((entry) => (
                    <div 
                      key={entry.lane} 
                      className={`flex flex-col p-5 rounded-xl border-2 transition-colors gap-4 shadow-lg ${
                        entry.entryStatus === 'VALID' 
                          ? 'bg-gray-800 border-gray-700' 
                          : 'bg-red-950/30 border-red-500/30 opacity-75'
                      }`}
                    >
                      {/* 上半部：名字與班級 */}
                      <div className="flex items-center gap-4 border-b border-gray-700/50 pb-4">
                        <div className="w-14 h-14 rounded-xl bg-gray-900 border border-gray-700 flex flex-col items-center justify-center shrink-0">
                          <span className="text-[10px] text-gray-500 font-bold">{selectedRace.isFieldEvent ? 'ORDER' : 'LANE'}</span>
                          <span className="text-2xl font-black text-white leading-none">{entry.lane}</span>
                        </div>
                        <div className="flex-1">
                          <div className="text-2xl font-black text-white">{entry.name}</div>
                          <div className="text-sm font-mono text-blue-400 bg-blue-400/10 px-2 py-1 rounded mt-1 inline-block">
                            {entry.class}
                          </div>
                          {entry.qualification && (
                            <span className="ml-2 text-xs bg-purple-900/50 text-purple-300 px-2 py-1 rounded border border-purple-500/30">
                              晉級成績: {entry.qualification}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 下半部：狀態切換 + 成績輸入框 */}
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        
                        {/* 狀態切換器 */}
                        <div className="flex w-full sm:w-auto bg-gray-950 rounded-lg p-1 border border-gray-800">
                           <button onClick={() => handleStatusChange(entry.lane, 'VALID')} className={`flex-1 px-4 py-3 text-sm font-black rounded-md transition-colors ${entry.entryStatus === 'VALID' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-800'}`}>正常</button>
                          <button onClick={() => handleStatusChange(entry.lane, 'ABS')} className={`flex-1 px-4 py-3 text-sm font-black rounded-md transition-colors ${entry.entryStatus === 'ABS' ? 'bg-orange-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-800'}`}>缺席 (ABS)</button>
                          <button onClick={() => handleStatusChange(entry.lane, 'DQ')} className={`flex-1 px-4 py-3 text-sm font-black rounded-md transition-colors ${entry.entryStatus === 'DQ' ? 'bg-red-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-800'}`}>犯規 (DQ)</button>
                        </div>

                        {/* 超大成績輸入框 */}
                        <div className="w-full sm:w-auto flex justify-end">
                          {selectedRace.isFieldEvent ? (
                            <div className="flex flex-wrap items-center justify-end gap-2 w-full">
                              {[0, 1, 2].map(attemptIdx => (
                                <div key={attemptIdx} className="relative">
                                  <input 
                                    type="number" step="0.01" placeholder={`第${attemptIdx+1}次`}
                                    value={entry.attempts?.[attemptIdx] || ''}
                                    onChange={(e) => handleFieldScoreChange(entry.lane, attemptIdx, e.target.value)}
                                    disabled={entry.entryStatus !== 'VALID'}
                                    className="w-24 text-center text-xl font-bold font-mono py-3 rounded-lg bg-gray-950 border border-gray-700 text-white focus:border-emerald-500 focus:outline-none"
                                  />
                                </div>
                              ))}
                              <div className="w-24 ml-2 bg-emerald-900/20 border-2 border-emerald-500/50 rounded-xl p-2 text-center shadow-inner">
                                <div className="text-[10px] text-emerald-500 font-black mb-1">最佳(m)</div>
                                <div className="text-xl font-black font-mono text-emerald-400">{entry.performanceValue || '-'}</div>
                              </div>
                            </div>
                          ) : (
                            <div className="relative w-full sm:w-auto">
                              <input 
                                type="number" step="0.01" placeholder="00.00" value={entry.performanceValue}
                                onChange={(e) => handleTrackScoreChange(entry.lane, e.target.value)}
                                disabled={entry.entryStatus !== 'VALID'}
                                className="w-full sm:w-48 text-center sm:text-right text-4xl font-black font-mono p-4 rounded-xl bg-gray-950 border-2 border-gray-700 text-white focus:border-blue-500 focus:outline-none focus:bg-gray-900"
                              />
                              <span className="absolute right-4 bottom-2 text-sm font-bold text-gray-600 hidden sm:block">s</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 積分預覽表 */}
                {selectedRace.stage === 'FINAL' && (
                  <div className="xl:w-[40%] bg-gray-950 rounded-xl border border-purple-500/30 p-5 h-fit sticky top-4">
                    <h3 className="text-purple-400 font-bold text-xl mb-6 flex items-center gap-2">
                      <span>🏆</span> 即時班際積分試算
                    </h3>
                    
                    {previewRankings.length === 0 ? (
                      <div className="text-base text-gray-500 text-center py-10 border border-dashed border-gray-800 rounded-xl">
                        輸入成績後，此處將即時顯示。
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {previewRankings.map((student) => (
                          <div key={student.lane} className="flex justify-between items-center bg-gray-900 p-3 rounded-lg border border-gray-800">
                            <div className="flex items-center gap-3">
                              <span className={`w-8 h-8 flex items-center justify-center rounded-md text-sm font-black ${
                                student.previewRank === 1 ? 'bg-amber-500 text-amber-950' :
                                student.previewRank === 2 ? 'bg-gray-300 text-gray-900' :
                                student.previewRank === 3 ? 'bg-orange-700 text-orange-100' :
                                'bg-gray-800 text-gray-400'
                              }`}>
                                {student.previewRank}
                              </span>
                              <span className="text-lg font-bold text-gray-200">{student.class}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-sm font-bold text-emerald-400">{student.performanceValue}{selectedRace.isFieldEvent ? 'm' : 's'}</span>
                              <span className="font-black text-purple-400 bg-purple-400/10 px-3 py-1 rounded-md text-base">
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

              <div className="pt-8 border-t border-gray-800 flex justify-between items-center">
                <button onClick={handleSubmitResults} disabled={isSubmitting} className="w-full bg-gradient-to-r from-emerald-500 to-emerald-400 text-white px-10 py-6 rounded-2xl font-black text-2xl hover:-translate-y-1 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                  {isSubmitting ? "上傳中..." : (selectedRace.status === 'OFFICIAL' ? "💾 儲存修改並重新發佈" : "🚀 發佈官方成績")}
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
