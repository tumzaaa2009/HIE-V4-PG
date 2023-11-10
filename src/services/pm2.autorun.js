const axios = require('axios');
const moment = require('moment');
const https = require('https')
const { config } = require('dotenv');
config({ path: '.env.production.local' });
const cron = require('node-cron');
const { END_POINT, URL_Hos, Token_DrugAllgy } = process.env;

const checkAndRun = async () => {
  try {
    const response = await axios.get(`${END_POINT}/checkvisitcahedrugaligy`, {
      headers: {
        'x-api-key': `${Token_DrugAllgy}`
      }

    });
    const dateEvent = response.data.dateEvent;
    if (moment().format("YYYY-MM-DD HH:mm:ss") >= dateEvent) {
      // หากเราอยู่หรือเกินวันและเวลาที่กำหนด
      axios.post(`${URL_Hos}/hie/drugallgycashe`, null, {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      })
        .then((response) => {
          console.log('HTTP request to http://localhost:3000/hie/drugallgycashe has been made.');
          // ใส่โค้ดเพิ่มเติมที่คุณต้องการทำหลังจากการเรียก HTTP นี้
        })
        .catch((error) => {
          console.error('HTTP request to http://localhost:3000/hie/drugallgycashe failed:', error);
        });
    } else {
      console.log('Not yet time to make the HTTP request.');
    }

  } catch (error) {

  }


};

// เรียกฟังก์ชัน checkAndRun เพื่อเริ่มต้นตรวจสอบและการรัน
cron.schedule('08 11 * * *', () => {
  console.log('Running checkAndRun at 11:30 AM every day');
  checkAndRun();
});