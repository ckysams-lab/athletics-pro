// src/pages/PreparationPage.jsx
import React, { useState, useEffect } from 'react';
import { generateTrackRaces, generateFinalFromHeats } from '../utils/scheduler';
import { db } from '../firebase/config';
import { writeBatch, doc, collection, getDocs, query, where } from 'firebase/firestore';
import CSVUploader from '../components/CSVUploader'; 
import { GRADES, GENDERS, MASTER_EVENTS, EVENT_CATEGORIES } from '../utils/constants';

const PreparationPage = () => {
  const [realStudents, setRealStudents] = useState([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  
  const [selectedGender, setSelectedGender] = useState('M');
  const [selectedGrade, setSelectedGrade] = useState('A');
  
  const [currentSchedule, setCurrentSchedule] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // 新增：儲存從資料庫抓取的已完成初賽，用來產生決賽
  const [existingHeats, setExistingHeats] = useState([]);

  const fetchStudentsFromFirebase = async () => {
    setIsLoadingStudents(true);
    try {
      const querySnapshot = await getDocs(collection(db, "students"));
      const studentsList = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        studentsList.push({ studentRef: doc.id, name: data.name || data.englishName, class: data.class, classNo: data.classNo, gender: data.gender, grade: data.grade });
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
  }, []);

  const getEligibleStudents = () => {
    return realStudents.filter(s => {
      const isMale = (selectedGender === 'M' && (s.gender === 'M' || s.gender === '男'));
      const isFemale = (selectedGender === 'F' && (s.gender === 'F' || s.gender === '女'));
      const gradeChar = String(s.class).charAt(0);
      let matchesGrade = false;
      if (selectedGrade === 'A' && gradeChar === '6') matchesGrade = true;
      if (selectedGrade === 'B' && gradeChar === '5') matchesGrade = true;
      if (selectedGrade === 'C' && gradeChar === '4') matchesGrade = true;
      if (selectedGrade === 'D' && gradeChar === '3') matchesGrade = true;
      return (isMale || isFemale) && matchesGrade;
    });
  };

  // 當點擊項目按鈕時，除了檢查能不能排初賽，也去資料庫找有沒有已完成的初賽
  const handleSelectEvent = async (eventDef) => {
    const eventId = `${selectedGender}_${selectedGrade}_${eventDef.id}`;
    const eventName = `${selectedGender === 'M'?'男子':'女子'}${selectedGrade}組 ${eventDef.name}`;
    
    setCurrentSchedule({
      eventId, eventName, category: eventDef.category, races: [], def: eventDef
    });

    // 去 Firebase 找這個項目的所有 HEAT
    try {
      const q = query(collection(db, "races"), where("eventId", "==", eventId), where("stage", "==", "HEAT"));
      const querySnapshot = await getDocs(q);
      const heats = [];
      querySnapshot.forEach((doc) => heats.push({ id: doc.id, ...doc.data() }));
      setExistingHeats(heats);
    } catch (error) {
      console.error("檢查已存在賽事失敗:", error);
    }
  };

  // 產生初賽 (Heats) 或直接決賽
  const handleGenerateHeats = () => {
    const eligibleStudents = getEligibleStudents();
    if (eligibleStudents.length === 0) {
      alert(`找不到符合條件的學生！`); return;
    }

    let result = [];
    if (currentSchedule.category === EVENT_CATEGORIES.TRACK) {
      result = generateTrackRaces(currentSchedule.eventId, eligibleStudents, currentSchedule.def.lanes);
    } else {
      result = [{
        id: `${currentSchedule.eventId}_FINAL`, eventId: currentSchedule.eventId, stage: "FINAL", groupNo: 1, status: "PENDING",
        entries: eligibleStudents.map((student, i) => ({ ...student, lane: i + 1 }))
      }];
    }

    setCurrentSchedule(prev => ({ ...prev, races: result }));
  };

  // 👉 新增：自動整合初賽產生決賽 (Final)
  const handleGenerateFinal = () => {
    try {
      // 呼叫我們剛剛在 scheduler.js 寫好的晉級引擎
      const finalRace = generateFinalFromHeats(currentSchedule.eventId, existingHeats, currentSchedule.def.lanes);
      if (finalRace) {
        setCurrentSchedule(prev => ({ ...prev, races: [finalRace] }));
      }
    } catch (error) {
      alert(error.message); // 顯示錯誤 (例如：初賽還沒比完)
    }
  };

  const handleSaveToFirebase = async () => {
    if (!currentSchedule || currentSchedule.races.length === 0) return;
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const eventRef = doc(db, 'events', currentSchedule.eventId);
      batch.set(eventRef, { id: currentSchedule.eventId, name: currentSchedule.eventName, category: currentSchedule.category, status: 'PREPARATION' });

      currentSchedule.races.forEach((race) => {
        const raceRef = doc(db, 'races', race.id);
        batch.set(raceRef, race);
      });

      await batch.commit();
      alert(`✅ 成功！${currentSchedule.eventName} 的賽程已寫入。`);
    } catch (error) {
      console.error("寫入 Firebase 發生錯誤:", error);
      alert("❌ 寫入失敗，請看 Console。");
    } finally {
      setIsSaving(false);
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

      <div className="mb-10 bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl">
        <h2 className="text-2xl font-bold text-blue-400 mb-6 flex items-center gap-2"><span>📋</span> 選擇編排組別與項目</h2>
        
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
            {GENDERS.map(g => (
              <button key={g.id} onClick={() => setSelectedGender(g.id)} className={`px-6 py-2 rounded-md font-bold transition-colors ${selectedGender === g.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>{g.name}</button>
            ))}
          </div>
          <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
            {GRADES.map(g => (
              <button key={g.id} onClick={() => setSelectedGrade(g.id)} className={`px-4 py-2 rounded-md font-bold transition-colors ${selectedGrade === g.id ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}>{g.name}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {MASTER_EVENTS.map(event => (
            <button key={event.id} onClick={() => handleSelectEvent(event)} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-emerald-500 rounded-lg p-4 text-left transition-all hover:-translate-y-1">
              <div className="text-sm text-gray-400 mb-1">{event.category}</div>
              <div className="font-bold text-lg">{event.name}</div>
            </button>
          ))}
        </div>
      </div>

      {currentSchedule && (
        <div className="bg-gray-900 border border-emerald-900/50 rounded-xl p-6 shadow-2xl shadow-emerald-900/20">
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 pb-4 border-b border-gray-800">
            <div>
              <h3 className="text-2xl font-bold text-amber-400">目前項目：{currentSchedule.eventName}</h3>
              
              {/* 顯示資料庫中初賽的狀態 */}
              <div className="mt-2 text-sm text-gray-400">
                資料庫狀態：已存在 {existingHeats.length} 組初賽資料。
                {existingHeats.length > 0 && (
                   <span className={existingHeats.every(h => h.status === 'OFFICIAL') ? "text-emerald-400 ml-2" : "text-amber-500 ml-2"}>
                     ({existingHeats.every(h => h.status === 'OFFICIAL') ? "所有初賽皆已完成，可產生決賽！" : "尚有初賽未完成計時"})
                   </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mb-8">
            <button onClick={handleGenerateHeats} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-lg transition-colors">
              1. ⚡ 自動編排初賽名單
            </button>

            {/* 👉 新增的產生決賽按鈕 */}
            <button 
              onClick={handleGenerateFinal} 
              disabled={existingHeats.length === 0}
              className={`font-bold py-3 px-6 rounded-lg transition-colors ${existingHeats.length === 0 ? 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700' : 'bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_15px_rgba(147,51,234,0.3)]'}`}
            >
              {/* 👑 整合初賽成績 ➔ 產生決賽名單 */}
            </button>

            <button onClick={handleSaveToFirebase} disabled={currentSchedule.races.length === 0 || isSaving} className={`font-bold py-3 px-6 rounded-lg transition-colors ${currentSchedule.races.length === 0 ? 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700' : isSaving ? 'bg-amber-600 hover:bg-amber-500 animate-pulse text-white' : 'bg-amber-500 hover:bg-amber-400 text-white'}`}>
              {isSaving ? "寫入中..." : "☁️ 確定儲存預覽賽程至資料庫"}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {currentSchedule.races.map((race) => (
              <div key={race.id} className="bg-gray-950 border border-gray-800 rounded-xl p-4">
                <h4 className="text-lg font-bold text-blue-300 mb-3">{race.stage} - 第 {race.groupNo} 組</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                  {race.entries.map(entry => (
                    <div key={entry.lane} className="flex justify-between items-center bg-gray-800 p-2 rounded border border-gray-700">
                      <div className="flex items-center gap-3">
                        <span className="text-amber-500 font-mono text-xs w-6 text-center">L{entry.lane}</span>
                        <span className="font-bold text-gray-200">{entry.name}</span> 
                        {/* 如果是決賽，顯示他是用什麼成績晉級的 (例如 q(12.05s)) */}
                        {entry.qualification && <span className="text-xs text-purple-400 ml-1">{entry.qualification}</span>}
                      </div>
                      <span className="font-mono text-xs text-blue-400 bg-blue-400/10 px-2 py-1 rounded">{entry.class}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PreparationPage;
