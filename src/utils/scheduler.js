// src/utils/scheduler.js

// 輔助函數：打亂陣列順序 (Fisher-Yates Shuffle)
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// 👉 請特別注意這一行，前面必須要有 'export' 關鍵字！
export const generateTrackRaces = (eventId, entries, maxLanes = 8) => {
  const totalEntries = entries.length;
  
  if (totalEntries === 0) return [];

  const randomizedEntries = shuffleArray(entries);

  // 情況 1：直接決賽
  if (totalEntries <= maxLanes) {
    const entriesWithLanes = randomizedEntries.map((student, index) => ({
      ...student, 
      lane: index + 1
    }));

    return [{
      id: `${eventId}_FINAL`,
      eventId: eventId, 
      stage: "FINAL", 
      groupNo: 1, 
      status: "PENDING", 
      entries: entriesWithLanes
    }];
  }

  // 情況 2：需要分組初賽
  const numHeats = Math.ceil(totalEntries / maxLanes);
  const heats = Array.from({ length: numHeats }, () => []);

  randomizedEntries.forEach((student, index) => {
    heats[index % numHeats].push(student);
  });

  return heats.map((heatEntries, index) => {
    const entriesWithLanes = heatEntries.map((student, i) => ({
      ...student, 
      lane: i + 1
    }));

    return {
      id: `${eventId}_HEAT_${index + 1}`,
      eventId: eventId, 
      stage: "HEAT", 
      groupNo: index + 1, 
      status: "PENDING", 
      entries: entriesWithLanes
    };
  });
};

// src/utils/scheduler.js
// ... (保留原本上方的程式碼) ...

/**
 * 從多組初賽成績中，自動篩選最快的選手晉級決賽並分配線道
 * @param {string} eventId - 賽事ID (例: "M_A_100M")
 * @param {Array} completedHeats - 狀態為 OFFICIAL 的初賽資料陣列
 * @param {number} finalLanes - 決賽最大線道數 (預設為 8)
 * @returns {Object|null} - 準備寫入 Firebase 的決賽資料 (如果成績未出齊則回傳 null)
 */
export const generateFinalFromHeats = (eventId, completedHeats, finalLanes = 8) => {
  if (!completedHeats || completedHeats.length === 0) return null;

  // 1. 確保所有初賽都已經完成 (OFFICIAL)
  const allOfficial = completedHeats.every(heat => heat.status === 'OFFICIAL');
  if (!allOfficial) {
    throw new Error("⚠️ 尚有初賽未發佈官方成績，無法產生決賽名單！");
  }

  // 2. 收集並攤平所有有成績的選手
  let allResults = [];
  completedHeats.forEach(heat => {
    heat.entries.forEach(entry => {
      if (entry.entryStatus === 'VALID' && entry.performanceValue !== null) {
        allResults.push(entry);
      }
    });
  });

  // 防呆：如果沒有人有成績
  if (allResults.length === 0) {
    throw new Error("❌ 所有初賽都沒有有效的成績紀錄！");
  }

  // 3. 排序成績 (徑賽時間越短越好)
  allResults.sort((a, b) => a.performanceValue - b.performanceValue);

  // 4. 抓取前 8 名晉級
  const finalists = allResults.slice(0, finalLanes);

  // 5. 分配決賽線道 (黃金編排法則：最快的在中間)
  // 標準分配順序 (依速度名次)：4, 5, 3, 6, 2, 7, 1, 8
  const laneAssignmentOrder = [4, 5, 3, 6, 2, 7, 1, 8];
  
  const entriesWithLanes = finalists.map((student, index) => {
    // 如果晉級人數少於 8 人，多出的線道順序就不取用
    const assignedLane = laneAssignmentOrder[index] || (index + 1); 
    return {
      studentRef: student.studentRef,
      name: student.name,
      class: student.class,
      classNo: student.classNo,
      lane: assignedLane,
      // 清除他們在初賽的成績與狀態，準備決賽
      performanceValue: '',
      entryStatus: 'PENDING',
      displayMark: '',
      qualification: `q (${student.displayMark})` // 標註他是以什麼成績晉級的 (q = qualified by time)
    };
  });

  // 根據線道重新排序，讓顯示時比較好看
  entriesWithLanes.sort((a, b) => a.lane - b.lane);

  // 6. 產出決賽資料包
  return {
    id: `${eventId}_FINAL`,
    eventId: eventId,
    stage: "FINAL",
    groupNo: 1,
    status: "PENDING", // 決賽剛產生，等待裁判輸入
    entries: entriesWithLanes
  };
};
