// src/pages/StartListPrint.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs } from 'firebase/firestore';

const StartListPrint = () => {
  const [groupedEvents, setGroupedEvents] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAndGroupRaces = async () => {
      setIsLoading(true);
      try {
        const querySnapshot = await getDocs(collection(db, 'races'));
        const races = [];
        querySnapshot.forEach((doc) => {
          races.push({ id: doc.id, ...doc.data() });
        });

        // 將賽事依照 eventId 進行分組 (例如把 M_A_100M 的 Heat 1, 2, 3 歸類在一起)
        const grouped = races.reduce((acc, race) => {
          if (!acc[race.eventId]) {
            acc[race.eventId] = {
              eventName: race.eventId === 'M_A_100M' ? '男子甲組 100米' : race.eventId, // 這裡之後可以對應真實項目名稱
              stage: race.stage === 'HEAT' ? '初賽' : '決賽',
              category: '徑項', // 根據你的邏輯判斷
              races: []
            };
          }
          acc[race.eventId].races.push(race);
          return acc;
        }, {});

        // 將每組內的 Heat 依照 groupNo 排序
        Object.keys(grouped).forEach(key => {
          grouped[key].races.sort((a, b) => a.groupNo - b.groupNo);
        });

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
    // 使用 bg-white 和 text-black 確保列印出來是白底黑字，並隱藏滾動條
    <div className="min-h-screen bg-white text-black p-8 font-sans print:p-0">
      
      {/* 隱藏於列印畫面，只在螢幕顯示的控制列 */}
      <div className="print:hidden mb-8 flex justify-between items-center bg-gray-100 p-4 rounded-lg border border-gray-300">
        <p className="text-gray-600">💡 提示：點擊右側按鈕，或按下 Ctrl+P (Windows) / Cmd+P (Mac)，選擇「另存為 PDF」。</p>
        <button 
          onClick={() => window.print()}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded shadow"
        >
          🖨️ 匯出 PDF (列印)
        </button>
      </div>

      {/* 大會標題 (這部分會被印出來) */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold">香海正覺蓮社佛教正覺蓮社學校</h1>
        <h2 className="text-xl font-bold mt-1">第18屆周年運動會 (2025-2026)</h2>
        <h3 className="text-lg mt-2">線道分配及運動員名錄</h3>
      </div>

      {/* 遍歷每一個項目並渲染 EDB 格式的表格 */}
      {Object.keys(groupedEvents).map((eventId, index) => {
        const eventData = groupedEvents[eventId];
        return (
          <div key={eventId} className="mb-10 page-break-inside-avoid">
            
            {/* 項目標題列 (仿照 EDB 格式) */}
            <div className="flex justify-between items-end border-b-2 border-black pb-2 mb-2 font-bold">
              <div>項目 ({index + 1})</div>
              <div>{eventData.eventName}</div>
              <div>{eventData.category}</div>
              <div className="border border-black px-4 py-1">{eventData.stage}</div>
            </div>

            {/* 八線道表格 */}
            <table className="w-full border-collapse border border-black text-sm text-center">
              <thead>
                <tr className="bg-gray-100 print:bg-transparent">
                  <th className="border border-black py-2 w-16">組別</th>
                  <th className="border border-black py-2">線道一</th>
                  <th className="border border-black py-2">線道二</th>
                  <th className="border border-black py-2">線道三</th>
                  <th className="border border-black py-2">線道四</th>
                  <th className="border border-black py-2">線道五</th>
                  <th className="border border-black py-2">線道六</th>
                  <th className="border border-black py-2">線道七</th>
                  <th className="border border-black py-2">線道八</th>
                </tr>
              </thead>
              <tbody>
                {eventData.races.map((race) => {
                  // 建立 1 到 8 線道的陣列
                  const lanes = [1, 2, 3, 4, 5, 6, 7, 8];
                  return (
                    <tr key={race.id}>
                      <td className="border border-black py-3 font-bold">
                        {race.groupNo}
                      </td>
                      {lanes.map(laneNum => {
                        // 尋找該線道是否有學生
                        const student = race.entries.find(e => e.lane === laneNum);
                        return (
                          <td key={laneNum} className="border border-black py-2 px-1 align-top h-16">
                            {student ? (
                              <div className="flex flex-col items-center justify-center h-full">
                                <span className="font-semibold">{student.name}</span>
                                <span className="text-xs text-gray-700 mt-1">
                                  {student.class}({student.classNo || ' '})
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};

export default StartListPrint;