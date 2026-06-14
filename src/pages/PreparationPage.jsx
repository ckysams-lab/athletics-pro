// src/pages/PreparationPage.jsx
import React, { useState, useEffect } from 'react';
import { generateTrackRaces, generateFinalFromHeats, generateFieldEvent } from '../utils/scheduler';
import { db } from '../firebase/config';
import { writeBatch, doc, collection, getDocs, query, onSnapshot } from 'firebase/firestore';
import CSVUploader from '../components/CSVUploader'; 
import { MASTER_EVENTS, EVENT_CATEGORIES } from '../utils/constants';

const PreparationPage = () => {
  const [realStudents, setRealStudents] = useState([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [allRaces, setAllRaces] = useState([]);
  
  // 👉 用來顯示自動編排結果的預覽視窗
  const [autoSchedulePreview, setAutoSchedulePreview] = useState(null);

  const fetchStudentsFromFirebase = async () => {
    setIsLoadingStudents(true);
    try {
      const querySnapshot = await getDocs(collection(db, "students"));
      const studentsList = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        studentsList.push({ 
          studentRef: doc.id, 
          name: data.name || data.englishName, 
          class: data.class, 
          classNo: data.classNo, 
          gender: data.gender, 
          grade: data.grade,
          registeredEvents: data.registeredEvents || [] // 👉 把報名紀錄抓下來
        });
      });
      setRealStudents(studentsList);
    } catch (error) {
      console.error("抓取學生資料失敗:", error);
    } finally {
      setIsLoadingStudents(false);
    }
  };

  useEffect(() => {
    fetchStudentsFromFirebase();

    const q = query(collection(db, "races"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const racesData = [];
      snapshot.forEach(doc => racesData.push({ id: doc.id, ...doc.data() }));
      
      racesData.sort((a, b) => {
        if (a.eventId !== b.eventId) return a.eventId.localeCompare(b.eventId);
        if (a.stage !== b.stage) return a.stage === 'HEAT' ? -1 : 1;
        return a.groupNo - b.groupNo;
      });
      
      setAllRaces(racesData);
    });

    return () => unsubscribe();
  }, []);

  // 👉 核心魔法：全自動掃描報名表並編排
  const handleAutoMagicSchedule = () => {
    if (realStudents.length === 0) {
      alert("請先匯入學生名單！");
      return;
    }

    setIsLoadingStudents(true); // 借用 loading state 當作處理中的 UI
    
    // 準備一個大陣列來裝所有的 races
    let allGeneratedRaces = [];
    let summaryLog = [];

    // 遍歷我們系統設定的四個組別 (A, B, C, D) 與性別 (M, F)
    const genders = ['M', 'F'];
    const grades = ['A', 'B', 'C', 'D'];

    genders.forEach(gender => {
      grades.forEach(grade => {
        
        // 遍歷所有大會項目 (60m, 100m, 跳遠...)
        MASTER_EVENTS.forEach(eventDef => {
          const eventId = `${gender}_${grade}_${eventDef.id}`;
          
          // 找尋所有有報名這個項目的學生
          const eligibleStudents = realStudents.filter(s => {
            const isMatchGender = (gender === 'M' && (s.gender === 'M' || s.gender === '男')) || 
                                  (gender === 'F' && (s.gender === 'F' || s.gender === '女'));
            const isMatchGrade = s.grade === grade;
            
            // 檢查他的 registeredEvents 陣列裡，有沒有包含這個項目的名稱 (例如 '100米')
            const hasRegistered = s.registeredEvents.some(regName => 
              regName.includes(eventDef.name) || eventDef.name.includes(regName)
            );

            return isMatchGender && isMatchGrade && hasRegistered;
          });

          // 如果有人報名，就產生賽事
          if (eligibleStudents.length > 0) {
            let races = [];
            if (eventDef.category === EVENT_CATEGORIES.FIELD) {
              races = generateFieldEvent(eventId, eligibleStudents);
            } else {
              races = generateTrackRaces(eventId, eligibleStudents, eventDef.lanes);
            }
            allGeneratedRaces = [...allGeneratedRaces, ...races];
            summaryLog.push(`${gender === 'M'?'男':'女'}${grade} ${eventDef.name}: 共 ${eligibleStudents.length} 人 (${races.length}組)`);
          }
        });

      });
    });

    setIsLoadingStudents(false);

    if (allGeneratedRaces.length === 0) {
      alert("❌ 無法編排：在學生的報名紀錄中，找不到與大會項目名稱相符的資料！(請檢查 CSV 的項目名稱是否為 60米, 100米, 跳遠...)");
      return;
    }

    setAutoSchedulePreview({
      races: allGeneratedRaces,
      log: summaryLog
    });
  };

  // 將所有全自動編排的賽事寫入 Firebase
  const handleSaveMagicSchedule = async () => {
    if (!autoSchedulePreview) return;
    
    const confirmSave = window.confirm(`⚠️ 將會覆蓋並寫入 ${autoSchedulePreview.races.length} 場賽事，確定要執行嗎？`);
    if (!confirmSave) return;

    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      
      const safeRaces = JSON.parse(JSON.stringify(autoSchedulePreview.races));
      safeRaces.forEach((race) => {
        const raceRef = doc(db, 'races', race.id);
        batch.set(raceRef, race); 
      });

      await batch.commit();
      alert(`✅ 魔術編排大成功！已寫入 ${safeRaces.length} 場賽程。`);
      setAutoSchedulePreview(null);
    } catch (error) {
      console.error("寫入 Firebase 發生錯誤:", error);
      alert(`❌ 寫入失敗: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRace = async (raceId) => {
    const confirmDelete = window.confirm("⚠️ 確定要刪除這場賽事嗎？");
    if (!confirmDelete) return;
    try {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, "races", raceId));
    } catch(err) {
      alert("刪除失敗！");
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8 font-sans print:hidden">
      <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
          陸運會賽事管理大廳
        </h1>
        <span className="text-gray-400 font-mono bg-gray-900 px-4 py-2 rounded-lg border border-gray-700">
          全校學生庫: {isLoadingStudents ? "載入中..." : `${realStudents.length} 人`}
        </span>
      </div>
      
      <CSVUploader onUploadSuccess={fetchStudentsFromFirebase} />

      {/* 👉 全新的魔術編排按鈕區塊 */}
      <div className="mb-10 bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-purple-500/30 rounded-xl p-8 shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <h2 className="text-3xl font-black text-purple-400 mb-2 flex items-center gap-2">
              <span>🪄</span> 全自動魔術編排引擎
            </h2>
            <p className="text-gray-300">
              系統將自動掃描所有學生的「參與項目」，一鍵為全校建立所有初賽與田賽名單。
            </p>
          </div>
          
          <button 
            onClick={handleAutoMagicSchedule}
            className="w-full md:w-auto bg-purple-600 hover:bg-purple-500 text-white font-black py-4 px-8 rounded-xl shadow-[0_0_20px_rgba(147,51,234,0.4)] hover:-translate-y-1 transition-all text-xl"
          >
            🚀 一鍵解析並編排全校賽程
          </button>
        </div>

        {/* 預覽視窗 */}
        {autoSchedulePreview && (
          <div className="mt-8 bg-gray-950 border border-gray-800 rounded-lg p-6">
            <h3 className="text-emerald-400 font-bold text-xl mb-4">✅ 成功解析以下項目 ({autoSchedulePreview.races.length} 組比賽)：</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {autoSchedulePreview.log.map((logItem, idx) => (
                <div key={idx} className="bg-gray-900 border border-gray-800 p-2 rounded text-sm text-gray-300">
                  {logItem}
                </div>
              ))}
            </div>
            <button 
              onClick={handleSaveMagicSchedule}
              disabled={isSaving}
              className={`w-full font-bold py-4 rounded-xl text-xl transition-all ${
                isSaving ? 'bg-amber-600 animate-pulse' : 'bg-emerald-600 hover:bg-emerald-500 shadow-xl shadow-emerald-500/20'
              }`}
            >
              {isSaving ? "大量寫入中..." : "💾 確認無誤，儲存所有賽程至大會資料庫"}
            </button>
          </div>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl">
        <h2 className="text-2xl font-bold text-emerald-400 mb-6 flex items-center gap-2">
          <span>📅</span> 已排定賽事總覽
        </h2>
        
        {allRaces.length === 0 ? (
          <div className="text-center text-gray-500 py-10 border border-dashed border-gray-700 rounded-xl">
            目前資料庫中尚無任何排定的賽事
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400 text-sm">
                  <th className="p-3">賽事代碼</th>
                  <th className="p-3">階段</th>
                  <th className="p-3">人數</th>
                  <th className="p-3">狀態</th>
                  <th className="p-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {allRaces.map(race => (
                  <tr key={race.id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="p-3 font-bold text-gray-200">{race.eventId}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        race.stage === 'FINAL' ? 'bg-purple-900/50 text-purple-400 border border-purple-500/30' : 'bg-blue-900/50 text-blue-400 border border-blue-500/30'
                      }`}>
                        {race.stage === 'FINAL' ? '🏆 決賽' : `初賽 (組${race.groupNo})`}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-gray-400">{race.entries?.length || 0} 人</td>
                    <td className="p-3">
                      <span className={`flex items-center gap-2 text-sm font-bold ${
                        race.status === 'OFFICIAL' ? 'text-emerald-400' : 'text-amber-500'
                      }`}>
                        {race.status === 'OFFICIAL' ? '✅ 已公佈' : '⏳ 等待裁判'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button 
                        onClick={() => handleDeleteRace(race.id)}
                        className="text-gray-500 hover:text-red-400 transition-colors text-sm px-2 py-1 bg-gray-950 rounded border border-gray-800"
                      >
                        🗑️ 刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PreparationPage;
