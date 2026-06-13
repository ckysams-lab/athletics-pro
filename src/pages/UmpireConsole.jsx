// src/utils/scheduler.js

const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export const generateTrackRaces = (eventId, entries, maxLanes = 8) => {
  const totalEntries = entries.length;
  if (totalEntries === 0) return [];
  const randomizedEntries = shuffleArray(entries);

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

export const generateFinalFromHeats = (eventId, completedHeats, finalLanes = 8) => {
  if (!completedHeats || completedHeats.length === 0) return null;

  const allOfficial = completedHeats.every(heat => heat.status === 'OFFICIAL');
  if (!allOfficial) {
    throw new Error("⚠️ 尚有初賽未發佈官方成績，無法產生決賽名單！");
  }

  let allResults = [];
  completedHeats.forEach(heat => {
    heat.entries.forEach(entry => {
      // 確保排除沒有成績或未填寫的資料
      if (entry.entryStatus === 'VALID' && entry.performanceValue !== null && entry.performanceValue !== '') {
        allResults.push(entry);
      }
    });
  });

  if (allResults.length === 0) {
    throw new Error("❌ 所有初賽都沒有有效的成績紀錄！");
  }

  allResults.sort((a, b) => a.performanceValue - b.performanceValue);

  const finalists = allResults.slice(0, finalLanes);
  const laneAssignmentOrder = [4, 5, 3, 6, 2, 7, 1, 8];
  
  const entriesWithLanes = finalists.map((student, index) => {
    const assignedLane = laneAssignmentOrder[index] || (index + 1); 
    return {
      // 👉 治本：給予所有潛在的 undefined 預設值
      studentRef: student.studentRef || null,
      name: student.name || "未知",
      class: student.class || "未知",
      classNo: student.classNo || null,
      lane: assignedLane,
      performanceValue: '',
      entryStatus: 'PENDING',
      displayMark: '',
      qualification: `q (${student.displayMark || ''})`
    };
  });

  entriesWithLanes.sort((a, b) => a.lane - b.lane);

  return {
    id: `${eventId}_FINAL`,
    eventId: eventId,
    stage: "FINAL",
    groupNo: 1,
    status: "PENDING",
    entries: entriesWithLanes
  };
};
