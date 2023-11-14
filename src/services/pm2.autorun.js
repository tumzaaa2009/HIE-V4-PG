const axios = require('axios');
const moment = require('moment');
const https = require('https')
const { config } = require('dotenv');
config({ path: '.env.production.local' });
const cron = require('node-cron');
const { END_POINT, URL_Hos, Token_DrugAllgy } = process.env;
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomTime() {
  const randomHour = getRandomInt(20, 23);
  const randomMinute = getRandomInt(0, 59);

  // แปลงให้อยู่ในรูปแบบ HH:mm
  const formattedTime = `${String(randomMinute).padStart(2, '0')} ${String(randomHour).padStart(2, '0')}  * * *`;

  return formattedTime;
}

const checkAndRun = async () => {
 
    try {
      await axios.post(`${URL_Hos}/hie/drugallgycashe`, null, {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      })
      console.log('HTTP request to ' + URL_Hos + '/hie/visitcashe has been made.');
      // เพิ่มโค้ดเพิ่มเติมที่คุณต้องการจากการเรียก HTTP นี้
    } catch (error) {
      console.error('HTTP request to ' + URL_Hos + '/hie/visitcashe failed:', error);
    }




    }  


 
const genTime = generateRandomTime(); 
 
console.log(genTime);
 
// เรียกฟังก์ชัน checkAndRun เพื่อเริ่มต้นตรวจสอบและการรัน
cron.schedule(`${genTime}`, () => {
  console.log(`ว่งเวลา${genTime}`);
  checkAndRun();
});