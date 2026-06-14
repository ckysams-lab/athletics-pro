// src/pages/StartListPrint.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore'; // 👉 引入 getDoc

const StartListPrint = () => {
  const [groupedEvents, setGroupedEvents] = useState({});
  const [eventOrderKeys, setEventOrderKeys] = useState([]); // 👉 用來控制渲染順序的陣列
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAndGroupRaces = async () => {
      setIsLoading(true);
      try {
        // 👉 1. 先去抓大會設定裡的排序
        let customOrderArray = [];
        const settingsSnap = await getDoc(doc(db, 'settings', 'scoring'));
        if (settingsSnap.exists() && settingsSnap.data().customSortOrder) {
          // 將逗號分隔的字串轉成陣列，並清理空白
          customOrderArray = settingsSnap.data().customSortOrder.split(',').map(s => s.trim()).filter(s => s);
        }

        // 👉 2. 抓取賽程
        const querySnapshot = await getDocs(collection(db, 'races'));
        const races = [];
        querySnapshot.forEach((doc) => {
          races.push({ id: doc.id, ...doc.data() });
        });

        const grouped = races.reduce((acc, race) => {
          if (!acc[race.eventId]) {
            const isFieldEvent = race.eventId.includes('JUMP') || race.eventId.includes('BALL');
            let eventName = race.eventId;
            if (race.eventId.includes('100M')) eventName = '100米';
            if (race.eventId.includes('60M')) eventName = '60米';
            if (race.eventId.includes('RELAY')) eventName = '4x100米接力';
            if (race.eventId.includes('LONG_JUMP')) eventName = '跳遠';
            if (race.eventId.includes('SOFTBALL')) eventName = '擲壘球';
            if (race.eventId.includes('WOODBALL')) eventName = '擲木球';

            const genderMap = { 'M': '男子', 'F': '女子' };
            const gradeMap = { 'A': '甲組', 'B': '乙組', 'C': '丙組', 'D': '丁組' };
            const parts = race.eventId.split('_');
            const fullEventName = `${genderMap[parts[0]] || ''}${gradeMap[parts[1]] || ''}${eventName}`;

            acc[race.eventId] = {
              eventName: fullEventName,
              category: isFieldEvent ? '田項' : '徑項',
              isFieldEvent: isFieldEvent,
              races: []
            };
          }
          acc[race.eventId].races.push(race);
          return acc;
        }, {});

        // 內部組別排序
        Object.keys(grouped).forEach(key => {
          grouped[key].races.sort((a, b) => a.groupNo - b.groupNo);
        });

        // 👉 3. 根據自訂排序清單來決定 Object Keys 的順序
        const allEventIds = Object.keys(grouped);
        
        allEventIds.sort((a, b) => {
          const indexA = customOrderArray.indexOf(a);
          const indexB = customOrderArray.indexOf(b);
          
          // 如果兩個都在自訂清單裡，照清單順序排
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          // 如果只有 A 在清單裡，A 排前面
          if (indexA !== -1) return -1;
          // 如果只有 B 在清單裡，B 排前面
          if (indexB !== -1) return 1;
          // 如果都不在清單裡，照英文字母排
          return a.localeCompare(b);
        });

        setEventOrderKeys(allEventIds); // 存入排序好的 Key 陣列
        setGroupedEvents(grouped);
      } catch (error) {
        console.error("讀取賽程失敗:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndGroupRaces();
  }, []);

  if (isLoading) {
    return <div className="p-10 text-center text-xl">載入賽程中，準備產生 PDF...</div>;
  }

  return (
    <div className="min-h-screen bg-white text-black p-8 font-sans print:p-0">
      
      <div className="print:hidden mb-8 flex justify-between items-center bg-gray-100 p-4 rounded-lg border border-gray-300">
        <p className="text-gray-600">💡 提示：點擊右側按鈕，或按下 Ctrl+P (Windows) / Cmd+P (Mac)，選擇「另存為 PDF」。</p>
        <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded shadow">
          🖨️ 匯出 PDF (列印)
        </button>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold">香海正覺蓮社佛教正覺蓮社學校</h1>
        <h2 className="text-xl font-bold mt-1">第18屆周年運動會 (2025-2026)</h2>
        <h3 className="text-lg mt-2 font-bold border-b border-black inline-block pb-1">所有項目參賽者總表</h3>
      </div>

      <div className="space-y-6">
        {/* 👉 這裡改用排好序的 eventOrderKeys 來做 Map 渲染 */}
        {eventOrderKeys.map((eventId, index) => {
          const eventData = groupedEvents[eventId];
          
          return (
            <div key={eventId} className="mb-6"> 
              
              {eventData.isFieldEvent ? (
                // 田賽排版
                <div className="page-break-inside-avoid border border-black mb-4">
                  <div className="flex justify-between items-center px-4 py-2 border-b border-black font-bold">
                    <span>項目 ({index + 1})</span>
                    <span>{eventData.eventName}</span>
                    <span>{eventData.category}</span>
                    <span>決賽</span>
                  </div>
                  
                  <div className="grid grid-cols-8 text-center text-sm">
                    <div className="border-r border-black py-1 font-bold bg-gray-100 print:bg-transparent col-span-1">出場序</div>
                    <div className="border-b border-black py-1 col-span-7 flex flex-wrap">
                       {eventData.races[0]?.entries.map((student, idx) => (
                         <div key={student.lane} className="w-1/8 border-r border-gray-300 p-1 flex flex-col items-center justify-center min-h-[3rem]">
                            <span className="font-semibold">{student.name}</span>
                            <span className="text-[10px] text-gray-700">{student.class}({student.classNo})</span>
                         </div>
                       ))}
                    </div>
                  </div>
                </div>
              ) : (
                // 徑賽排版
                <div className="page-break-inside-avoid border border-black mb-4">
                  {eventData.races.map((race, raceIdx) => (
                    <div key={race.id} className={raceIdx > 0 ? "border-t-2 border-black" : ""}>
                      
                      <div className="flex justify-between items-center px-2 py-1 border-b border-black font-bold text-sm bg-gray-100 print:bg-transparent">
                        <span className="w-1/6">{raceIdx === 0 ? `項目 (${index + 1})` : ''}</span>
                        <span className="w-2/6 text-center">{raceIdx === 0 ? eventData.eventName : ''}</span>
                        <span className="w-1/6 text-center">{raceIdx === 0 ? eventData.category : ''}</span>
                        <span className="w-1/6 text-right">{race.stage === 'FINAL' ? '決賽' : `初賽`}</span>
                      </div>

                      <table className="w-full border-collapse text-sm text-center">
                        <thead>
                          <tr>
                            <th className="border-r border-b border-black py-1 w-[10%] font-normal">組別</th>
                            {['一', '二', '三', '四', '五', '六', '七', '八'].map(num => (
                              <th key={num} className="border-r border-b border-black py-1 font-normal last:border-r-0">線道{num}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="border-r border-black py-2 font-bold align-middle">
                              {race.stage === 'FINAL' ? '1' : race.groupNo}
                            </td>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(laneNum => {
                              const student = race.entries.find(e => e.lane === laneNum);
                              return (
                                <td key={`content-${laneNum}`} className="border-r border-black py-2 px-1 align-top h-12 last:border-r-0">
                                  {student ? (
                                    <div className="flex flex-col items-center justify-center h-full leading-snug">
                                      <span className="font-semibold">{student.name}</span>
                                      <span className="text-[11px] text-gray-800 mt-0.5">
                                        {student.class}({student.classNo})
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StartListPrint;
