// src/components/CSVUploader.jsx
import React, { useState } from 'react';
import Papa from 'papaparse';
import { db } from '../firebase/config';
import { writeBatch, doc } from 'firebase/firestore';

const CSVUploader = ({ onUploadSuccess }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStats, setUploadStats] = useState(null);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);

    Papa.parse(file, {
      header: false,
      skipEmptyLines: 'greedy',
      encoding: "Big5",
      complete: async (results) => {
        const rows = results.data;
        let headerRowIndex = -1;
        let dataStartIndex = -1;

        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const rowString = rows[i].join('').replace(/\s+/g, '');
          if (rowString.includes('班別代碼') || rowString.includes('班別')) {
            headerRowIndex = i;
            dataStartIndex = i + 1;
            break;
          }
        }

        if (headerRowIndex === -1) {
             for (let i = 0; i < Math.min(rows.length, 10); i++) {
                 const firstCol = rows[i][0]?.trim();
                 const secondCol = rows[i][1]?.trim();
                 if (firstCol && /^\d+$/.test(secondCol)) {
                     dataStartIndex = i;
                     break;
                 }
             }
        }

        if (dataStartIndex === -1) {
           alert("❌ 找不到符合格式的學生資料！");
           setIsUploading(false);
           return;
        }

        const students = [];
        // 👉 加入了三個參與項目的預設標題
        const expectedHeaders = ['班別代碼', '班號', '英文姓名', '中文姓名', '性別代碼', '聯絡電話', '參與項目一', '參與項目二', '參與項目三'];
        const actualHeaders = headerRowIndex !== -1 ? rows[headerRowIndex].map(h => h?.trim()) : expectedHeaders;

        for (let i = dataStartIndex; i < rows.length; i++) {
          const rowData = rows[i];
          if (rowData.length < 2) continue;

          const studentObj = {};
          
          if (headerRowIndex !== -1) {
             actualHeaders.forEach((headerName, index) => {
                if (headerName) studentObj[headerName] = rowData[index] ? rowData[index].trim() : '';
             });
          } else {
             studentObj['班別代碼'] = rowData[0]?.trim();
             studentObj['班號'] = rowData[1]?.trim();
             studentObj['英文姓名'] = rowData[2]?.trim();
             studentObj['中文姓名'] = rowData[3]?.trim();
             studentObj['性別代碼'] = rowData[4]?.trim();
             studentObj['聯絡電話'] = rowData[5]?.trim();
             studentObj['參與項目一'] = rowData[6]?.trim();
             studentObj['參與項目二'] = rowData[7]?.trim();
             studentObj['參與項目三'] = rowData[8]?.trim();
          }
          
          students.push(studentObj);
        }

        await saveStudentsToFirebase(students);
      },
      error: (error) => {
        console.error("解析 CSV 發生錯誤:", error);
        alert("❌ 解析 CSV 失敗！");
        setIsUploading(false);
      }
    });
  };

  const saveStudentsToFirebase = async (students) => {
    try {
      const batch = writeBatch(db);
      let count = 0;

      students.forEach((student) => {
        const classCode = student['班別代碼'] || student['班別'];
        const classNo = student['班號'] || student['學號'];
        const chiName = student['中文姓名'] || student['姓名'];
        const engName = student['英文姓名'] || '';
        const gender = student['性別代碼'] || student['性別'] || '';
        const phone = student['聯絡電話'] || '';
        
        // 👉 抓取報名項目 (過濾掉空白的)
        const events = [student['參與項目一'], student['參與項目二'], student['參與項目三']]
          .filter(e => e && e.trim() !== '');

        if (classCode && classNo) {
          const studentId = `${classCode}_${String(classNo).padStart(2, '0')}`;
          
          // 根據班別字首決定年級/組別 (例如 6A -> 6年級 -> 甲組)
          const gradePrefix = classCode.charAt(0);
          let gradeCode = 'C'; 
          if (gradePrefix === '6') gradeCode = 'A';
          if (gradePrefix === '5') gradeCode = 'B';
          if (gradePrefix === '4') gradeCode = 'C';
          if (gradePrefix === '3') gradeCode = 'D';

          const studentRef = doc(db, 'students', studentId);
          batch.set(studentRef, {
            class: classCode,
            classNo: Number(classNo),
            name: chiName || engName, 
            englishName: engName,
            gender: gender,
            phone: phone,
            grade: gradeCode,
            registeredEvents: events, // 👉 將報名項目陣列存入 Firebase
            updatedAt: new Date().toISOString()
          });
          count++;
        }
      });

      if (count === 0) {
        alert("⚠️ 沒有讀取到任何有效的學生資料。");
        setIsUploading(false);
        return;
      }

      await batch.commit();
      setUploadStats(count);
      alert(`✅ 成功匯入 ${count} 名學生資料與報名紀錄！`);
      
      if (onUploadSuccess) onUploadSuccess();
      
    } catch (error) {
      console.error("寫入 Firebase 失敗:", error);
      alert("❌ 寫入資料庫失敗，請開啟 F12 Console 查看。");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl mb-8">
      <h2 className="text-xl font-bold text-emerald-400 mb-4">📂 匯入 WebSAMS 學生名單 (含報名紀錄)</h2>
      <div className="flex flex-col md:flex-row gap-4 items-center">
        
        <label className="flex flex-col items-center justify-center w-full md:w-1/2 h-24 border-2 border-dashed border-gray-600 hover:border-emerald-500 rounded-lg cursor-pointer transition-colors bg-gray-800 hover:bg-gray-800/50">
          <div className="flex flex-col items-center justify-center pt-3 pb-4">
            <svg 
              className="mb-2 text-gray-400" 
              style={{ width: '24px', height: '24px' }}
              aria-hidden="true" 
              xmlns="http://www.w3.org/2000/svg" 
              fill="none" 
              viewBox="0 0 20 16"
            >
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
            </svg>
            <p className="mb-0 text-sm text-gray-400">
              <span className="font-semibold">{isUploading ? "處理中..." : "點擊上傳 WebSAMS 匯出的 CSV"}</span>
            </p>
          </div>
          <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
        </label>

        <div className="w-full md:w-1/2 p-4 bg-gray-800 rounded-lg">
          <h3 className="text-amber-400 font-bold mb-1">💡 支援的欄位格式：</h3>
          <code className="text-xs bg-gray-950 p-2 rounded block text-emerald-300 overflow-x-auto whitespace-nowrap">
            [0]班別, [1]班號, [2]英文, [3]中文, [4]性別, [5]電話, <span className="text-purple-400 font-bold">[6]項目一, [7]項目二, [8]項目三</span>
          </code>
          {uploadStats !== null && (
            <p className="mt-2 text-sm text-emerald-400 font-bold animate-pulse">🎉 上次成功匯入：{uploadStats} 筆資料</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CSVUploader;
