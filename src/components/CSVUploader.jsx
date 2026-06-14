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

        // 尋找標題行
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const rowString = rows[i].join('').replace(/\s+/g, '');
          if (rowString.includes('班別代碼') || rowString.includes('班別') || rowString.includes('姓名')) {
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
        const headers = headerRowIndex !== -1 ? rows[headerRowIndex].map(h => h?.trim()) : [];

        for (let i = dataStartIndex; i < rows.length; i++) {
          const rowData = rows[i];
          if (rowData.length < 2) continue;

          const studentObj = {};
          const rawCheckedEvents = [];

          if (headerRowIndex !== -1) {
             headers.forEach((headerName, index) => {
                if (!headerName) return;
                
                const cellValue = rowData[index] ? rowData[index].trim() : '';
                studentObj[headerName] = cellValue;

                // 👉 終極寬鬆判斷：只要格子裡有東西，且不是 0、N、False，就當作有報名！
                const isChecked = cellValue !== '' && !['0', 'n', 'no', 'false', 'f'].includes(cellValue.toLowerCase());
                
                const isBasicInfoField = ['班別', '班號', '姓名', '性別', '電話', '聯絡', '學號'].some(keyword => headerName.includes(keyword));
                
                if (isChecked && !isBasicInfoField) {
                  let cleanEventName = headerName.replace(/\s+/g, '').replace('跑', '');
                  rawCheckedEvents.push(cleanEventName);
                }
             });
          } else {
             studentObj['班別代碼'] = rowData[0]?.trim();
             studentObj['班號'] = rowData[1]?.trim();
             studentObj['英文姓名'] = rowData[2]?.trim();
             studentObj['中文姓名'] = rowData[3]?.trim();
             studentObj['性別'] = rowData[4]?.trim();
          }
          
          studentObj.rawCheckedEvents = rawCheckedEvents;
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
        const phone = student['聯絡電話'] || student['家長聯絡電話'] || '';

        if (classCode && classNo) {
          const studentId = `${classCode}_${String(classNo).padStart(2, '0')}`;
          
          const gradePrefix = classCode.charAt(0);
          let gradeCode = 'C'; 
          let gradeName = '丙組';
          if (gradePrefix === '6') { gradeCode = 'A'; gradeName = '甲組'; }
          if (gradePrefix === '5') { gradeCode = 'B'; gradeName = '乙組'; }
          if (gradePrefix === '4') { gradeCode = 'C'; gradeName = '丙組'; }
          if (gradePrefix === '3') { gradeCode = 'D'; gradeName = '丁組'; }

          const isMale = gender.toUpperCase() === 'M' || gender === '男';
          const genderName = isMale ? '男子' : '女子';

          const finalRegisteredEvents = student.rawCheckedEvents.map(rawEventName => {
            if (rawEventName.includes('男') || rawEventName.includes('女') || rawEventName.includes('組')) {
              return rawEventName;
            }
            return `${genderName}${gradeName}${rawEventName}`;
          });

          const studentRef = doc(db, 'students', studentId);
          batch.set(studentRef, {
            class: classCode,
            classNo: Number(classNo),
            name: chiName || engName, 
            englishName: engName,
            gender: gender.toUpperCase(), // 確保大小寫統一
            phone: phone,
            grade: gradeCode, 
            registeredEvents: finalRegisteredEvents, 
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
      <h2 className="text-xl font-bold text-emerald-400 mb-4">📂 匯入 WebSAMS 學生名單 (智能組別判斷)</h2>
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
              <span className="font-semibold">{isUploading ? "處理中..." : "點擊上傳 WebSAMS 打勾表格"}</span>
            </p>
          </div>
          <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
        </label>

        <div className="w-full md:w-1/2 p-4 bg-gray-800 rounded-lg">
          <h3 className="text-amber-400 font-bold mb-1">💡 智能解析格式：</h3>
          <p className="text-xs text-gray-400 mb-2">系統將根據學生的「班別與性別」，自動把打勾項目加上組別前綴 (例如: 100米跑 $\rightarrow$ 男子甲組100米)。</p>
          <code className="text-xs bg-gray-950 p-2 rounded block text-emerald-300 overflow-x-auto whitespace-nowrap">
            [基本資料] ..., <span className="text-purple-400 font-bold">60米跑, 100米跑, 跳遠, 擲壘球</span> <br/>
            <span className="text-gray-500">6A, M, ... , ✔️ , , ✔️, ✔️</span>
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
