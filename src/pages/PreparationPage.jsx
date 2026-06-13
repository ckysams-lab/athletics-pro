// src/pages/PreparationPage.jsx
import React, { useState, useEffect } from 'react';
import { generateTrackRaces } from '../utils/scheduler';
import { db } from '../firebase/config';
import { writeBatch, doc, collection, getDocs, setDoc } from 'firebase/firestore';
import CSVUploader from '../components/CSVUploader'; 
import { GRADES, GENDERS, MASTER_EVENTS, EVENT_CATEGORIES } from '../utils/constants';

const PreparationPage = () => {
  const [realStudents, setRealStudents] = useState([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  
  // 儲存目前選擇要檢視/編排的項目
  const [selectedGender, setSelectedGender] = useState('M');
  const [selectedGrade, setSelectedGrade] = useState('A');
  
  // 儲存目前正在編輯的賽事排程
  const [currentSchedule, setCurrentSchedule] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

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
          gender: data.gender,
          grade: data.grade
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
  }, []);

  // 根據選擇的性別和組別，過濾出該項目的潛在參賽者
  // (實務上這裡應該讀取另一張「報名表 registrations」，但目前我們先用隨機模擬報名)
  const getEligibleStudents = () => {
    return realStudents.filter(s => {
      // 假設班級數字代表年級 (例如 6A -> 六年級 -> 甲組)
      // 這裡是一個簡易的模擬分配邏輯，讓測試資料能動起來
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

  // 生成特定項目的賽程
  const handleGenerateEvent = (eventDef) => {
    const eligibleStudents = getEligibleStudents();
    
    if (eligibleStudents.length === 0) {
      alert(`找不到符合 ${selectedGender === 'M'?'男子':'女子'}${selectedGrade}組 條件的學生！\n(系統目前假設6年級=甲組, 5年級=乙組...)`);
      return;
    }

    const eventId = `${selectedGender}_${selectedGrade}_${eventDef.id}`;
    let result = [];

    if (eventDef.category === EVENT_CATEGORIES.TRACK) {
      // 徑賽使用線道編排演算法
      result = generateTrackRaces(eventId, eligibleStudents, eventDef.lanes);
    } else {
      // 田賽不需要分組，直接給出場序 (Order)
      result = [{
        id: `${eventId}_FINAL`,
        eventId: eventId,
        stage: "FINAL",
        groupNo: 1,
        status: "PENDING",
        entries: eligibleStudents.map((student, i) => ({ ...student, lane: i + 1 })) // 這裡的 lane 其實代表出場序
      }];
    }

    setCurrentSchedule({
      eventId: eventId,
      eventName: `${selectedGender === 'M'?'男子':'女子'}${selectedGrade}組 ${eventDef.name}`,
      category: eventDef.category,
      races: result
    });
  };

  // 儲存目前檢視的賽程到 Firebase
  const handleSaveToFirebase = async () => {
    if (!currentSchedule || currentSchedule.races.length === 0) return;

    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      
      // 1. 寫入或更新 events 集合 (項目設定檔)
      const eventRef = doc(db, 'events', currentSchedule.eventId);
      batch.set(eventRef, {
        id: currentSchedule.eventId,
        name: currentSchedule.eventName,
        category: currentSchedule.category,
        status: 'PREPARATION'
      });

      // 2. 寫入具體的比賽場次到 races 集合
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
          陸運會賽事管理大廳 (Event Hub)
        </h1>
        <span className="text-gray-400 font-mono bg-gray-900 px-4 py-2 rounded-lg border border-gray-700">
          全校學生庫: {isLoadingStudents ? "載入中..." : `${realStudents.length} 人`}
        </span>
      </div>
      
      {/* 區塊 1：匯入真實學生資料 */}
      <CSVUploader onUploadSuccess={fetchStudentsFromFirebase} />

      {/* 區塊 2：賽事項目矩陣 */}
      <div className="mb-10 bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl">
        <h2 className="text-2xl font-bold text-blue-400 mb-6 flex items-center gap-2">
          <span>📋</span> 選擇編排組別與項目
        </h2>
        
        {/* 組別過濾器 */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
            {GENDERS.map(g => (
              <button 
                key={g.id} 
                onClick={() => setSelectedGender(g.id)}
                className={`px-6 py-2 rounded-md font-bold transition-colors ${selectedGender === g.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {g.name}
              </button>
            ))}
          </div>
          <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
            {GRADES.map(g => (
              <button 
                key={g.id} 
                onClick={() => setSelectedGrade(g.id)}
                className={`px-4 py-2 rounded-md font-bold transition-colors ${selectedGrade === g.id ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>

        {/* 項目按鈕列表 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {MASTER_EVENTS.map(event => (
            <button
              key={event.id}
              onClick={() => handleGenerateEvent(event)}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-emerald-500 rounded-lg p-4 text-left transition-all hover:-translate-y-1"
            >
              <div className="text-sm text-gray-400 mb-1">{event.category}</div>
              <div className="font-bold text-lg">{event.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 區塊 3：預覽與儲存區 */}
      {currentSchedule && (
        <div className="bg-gray-900 border border-emerald-900/50 rounded-xl p-6 shadow-2xl shadow-emerald-900/20">
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 pb-4 border-b border-gray-800">
            <div>
              <h3 className="text-2xl font-bold text-amber-400">
                預覽：{currentSchedule.eventName}
              </h3>
              <p className="text-gray-400 mt-1">
                共 {currentSchedule.races.length} 組 {currentSchedule.category === EVENT_CATEGORIES.TRACK ? '初賽' : '決賽'}
              </p>
            </div>
            
            <button 
              onClick={handleSaveToFirebase}
              disabled={isSaving}
              className={`mt-4 md:mt-0 font-bold py-3 px-8 text-xl rounded-xl transition-all shadow-xl hover:-translate-y-1 ${
                isSaving 
                  ? 'bg-amber-600 hover:bg-amber-500 animate-pulse text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-white border border-amber-400/30'
              }`}
            >
              {isSaving ? "寫入中..." : "☁️ 確定儲存此項目至資料庫"}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {currentSchedule.races.map((race) => (
              <div key={race.id} className="bg-gray-950 border border-gray-800 rounded-xl p-4">
                <h4 className="text-lg font-bold text-blue-300 mb-3">{race.stage} - 第 {race.groupNo} 組</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                  {race.entries.map(entry => (
                    <div key={entry.lane} className="flex justify-between items-center bg-gray-800 p-2 rounded">
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500 font-mono text-xs w-6 text-center">{entry.lane}</span>
                        <span className="font-bold text-gray-200">{entry.name}</span> 
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
