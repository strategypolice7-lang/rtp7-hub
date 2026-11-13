/**
 * ตั้งค่าที่อยู่ระบบหลังบ้าน (Google Apps Script)
 *
 * วิธีใส่ค่า:
 *   1) ใน Apps Script กด Deploy > Manage deployments แล้วคัดลอก "Web app URL"
 *   2) วางลงในเครื่องหมายคำพูดด้านล่าง ต้องขึ้นต้น https://script.google.com/ และลงท้ายด้วย /exec
 *      ตัวอย่าง:  API_URL: 'https://script.google.com/macros/s/xxxxxxxx/exec'
 *
 * หมายเหตุ: ห้ามใส่รหัส PIN หรือรหัสลับใดๆ ในไฟล์นี้ (ไฟล์นี้เป็นสาธารณะ)
 * ถ้าปล่อยว่าง หน้าเว็บจะแสดงข้อความ "ยังไม่ได้ตั้งค่าที่อยู่ระบบหลังบ้าน"
 */
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbx0uJ9ZtpTb05OSqBGK51QmhZvjFP-MIOv9-8ZsBKJO66dW9-LODR12X7AobQk1BRn87w/exec'
};
