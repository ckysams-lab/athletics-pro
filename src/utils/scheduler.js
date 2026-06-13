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
