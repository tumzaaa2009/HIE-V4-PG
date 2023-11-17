import sql from "@/dbconfig";
const batchSize: number = 2000; // จำนวนรายการที่จะส่งในแต่ละครั้ง
import axios from "axios";
import moment from "moment";
import { Token_DrugAllgy, END_POINT, hospCodeEnv, hospNameEnv } from "@config";
const { Client } = require('pg');
const client = new Client()
const cron = require('node-cron');
//ยาdrugAllgy
function formatResult(queryResult) {
  const formattedResult = [];
  const groupedData = new Map();

  queryResult.forEach((row) => {
    const key = `${row.cid}_${row.hospcode}`;

    if (!groupedData.has(key)) {
      groupedData.set(key, {
        cid: row.cid,
        hospcode: row.hospcode,
        drugallergy: [],
      });
    }
    const existingGroup = groupedData.get(key);
    if (
      !existingGroup.drugallergy.some((drug) => drug.drugItemcode === row.icode)
    ) {
      existingGroup.drugallergy.push({
        drugItemcode: row.icode,
        drugallergy: row.agent,
        drugsystom: row.drugsymptom,
      });
    }
  });

  // Convert the map to an array
  groupedData.forEach((group) => {
    const uniqueDrugAllergies = new Set();
    const drugAllergyArray = group.drugallergy.reduce((result, allergy) => {
      if (!uniqueDrugAllergies.has(allergy.drugallergy)) {
        uniqueDrugAllergies.add(allergy.drugallergy);

        result.push({
          drugcode: allergy.drugItemcode,
          drugallergy: allergy.drugallergy,
          drugsystom: allergy.drugsystom,
        });
      }
      return result;
    }, []);

    formattedResult.push({
      cid: group.cid,
      hospcode: group.hospcode,
      drugallergy: drugAllergyArray,
    });
  });

  return formattedResult;
}
//สร้างชุดข้อมูลตามจำนวน //ยา
function splitDataIntoChunks(data, chunkSize) {
  const chunks = [];

  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);

    //   // แตก Object drugAllergy และกำหนดรูปแบบ
    const modifiedChunk = chunk.map((item) => {
      return item;
    });
    chunks.push(modifiedChunk);
  }

  return chunks;
}
function splitDataVisit(data, chunkSize) {
  const chunks = [];

  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    // แตก Object drugAllergy และกำหนดรูปแบบ
    const modifiedChunk = chunk.map(item => {

      return {
        Cid: item.cid,
        hospCode: item.hospcode,
        lastVisit: item.vstdate,
        provinceCode: item.provincecode,
      };
    });

    chunks.push(modifiedChunk);
  }

  return chunks;
}

async function DrugAxios(dataMap) {
  try {
    const { data, status } = await axios.post(
      `${END_POINT}/eventdrugaligy/`,
      dataMap, // Use the passed dataDrug
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": `${Token_DrugAllgy}`,
        },
      }
    );
    console.log(data)
    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log("error message: ", error.message);
      return error.message;
    } else {
      console.log("unexpected error: ", error);
      return "An unexpected error occurred";
    }
  }
}
class HieService {
  public async ServiceVisitCashe(
    token: string,
  ): Promise<void> {
    try {
      let date = "";
      const checkVisitListDate = await new Promise((resolve, reject) => {
        axios
          .get(`${END_POINT}/checkvisitcashe`, {
            headers: {
              "x-api-key": `${Token_DrugAllgy}`,
              "Content-Type": "application/json",
            },
          })
          .then((result) => {
            date = result.data;
            if (moment(date.date).format("YYYY-MM-DD") != "Invalid date") {
              resolve(moment(date.date).format("YYYY-MM-DD"));
            } else {
              resolve("");
            }
          });
      });

      let maxDate = "";

      const formattedResult = await new Promise((resolve, reject) => {
        async function fetchRecords(checkVisitListDate) {
          const query = sql`
            SELECT 
              a.cid AS cid,
              10690 AS hospcode,
              16 AS provinceCode,
              MAX(a.vstdate) AS vstdate 
            FROM vn_stat a 
            WHERE CHAR_LENGTH(a.cid) = 13 
              AND a.cid NOT LIKE '0%' 
              AND a.vstdate <= NOW()
              AND a.vstdate BETWEEN ${checkVisitListDate} AND NOW()
            GROUP BY a.cid;
          `;
          const records = await query;
          maxDate = moment(records[0].vstdate).format("YYYY-MM-DD")
          console.log(maxDate)
          resolve(records); // รีเทิร์นค่า queryResult ดังกล่าว
        }
        fetchRecords(checkVisitListDate)
      });
      console.log("gggg")
      const dataChunksVisitList = await splitDataVisit(formattedResult, batchSize);
      const responsesArray = [];
      for (const chunk of dataChunksVisitList) {
        for (const item of chunk) {
          const reqbodyVisit = {
            Cid: item.Cid,
            hospCode: item.hospCode,
            lastVisit: moment(item.lastVisit).format('YYYY-MM-DD'),
            provinceCode: item.provinceCode,
          };
       
          try {
            const response = await axios.post(
              `${END_POINT}/eventvisitcashe/`,
              reqbodyVisit,
              {
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': `${Token_DrugAllgy}`,
                },
              }
            );
            console.log(response.data.msg);
            responsesArray.push(response.data.msg);
          } catch (error) {
            console.log(error);
          }
        }
      }
      if (responsesArray) {
        const today = new Date();
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate()+1);
        nextWeek.setHours(0, 0, 0, 0);
        nextWeek.setHours(23, 59, 0, 0);
        const axiosConfig = {
          baseURL: `${END_POINT}/eventvisitcashe/`,
          headers: {
            'X-API-KEY': `${Token_DrugAllgy}`,
            'Content-Type': 'application/json',
          },
        };
        // จัดรูปแบบวันที่ในรูปแบบ "yyyy-MM-dd"
        const formattedDate = today.toISOString().slice(0, 10);
        const formattedNextWeek = nextWeek.toISOString().slice(0, 10);
        await axios.post('/', { date: maxDate, dateUpdate: formattedNextWeek + ' 19.59.00' }, axiosConfig);
        return responsesArray;
      }
    } catch (error) {
      console.log(error);
    }
  }


 public async ServiceDrugAllgyCashe(
    token: string,
    visitList: string
  ): Promise<void> {

    try {
      let date = "";
      const checkVisitCaheResult = await new Promise((resolve, reject) => {
        axios
          .get(`${END_POINT}/checkvisitcahedrugaligy`, {
            headers: {
              "x-api-key": `${Token_DrugAllgy}`,
              "Content-Type": "application/json",
            },
          })
          .then((result) => {
            date = result.data;
            if (moment(date.date).format("YYYY-MM-DD") != "Invalid date") {
              resolve(moment(date.date).format("YYYY-MM-DD"));
            } else {
              resolve("");
            }
            // เรียก result.data เพื่อเข้าถึงข้อมูลที่รับกลับมา
          });
      });

      let maxDate = "";

      const formattedResult = await new Promise((resolve, reject) => {
        sql`
        SELECT 
                  pa.cid AS cid,
                  10690 AS hospcode,
                  DATE(a.report_date) AS update_date,
                  a.agent AS agent,
                  a.agent_code24 AS icode,
                  a.symptom AS drugsymptom
          FROM opd_allergy a
          LEFT JOIN patient pa ON pa.hn = a.hn
          LEFT JOIN drugitems aitem ON aitem.name = a.agent
          WHERE pa.cid != '' 
                AND LENGTH(pa.cid) = 13
                AND pa.cid NOT LIKE '0%'
                AND report_date IS NOT NULL
                AND DATE(a.report_date) BETWEEN ${checkVisitCaheResult} AND NOW()
          ORDER BY a.report_date DESC; `
          .then((queryResult) => {
            const originalDate = moment(
              queryResult[0].update_date,
              "YYYY-MM-DD"
            );
            const previousDate = originalDate
              .subtract("days")
              .format("YYYY-MM-DD");
            maxDate = previousDate;
            const formattedResult = formatResult(queryResult);
            resolve(formattedResult);
          })
          .catch((error) => {
            reject(error);
          });
      });

      const dataChunks = await splitDataIntoChunks(formattedResult, batchSize);
      let chunkResponses = [];
      //   สร้าง Promise สำหรับทุก chunk และรอจนกว่าทุกอย่างจะเสร็จสิ้น
      const responsesArray = await Promise.all(
        dataChunks.map(async (chunk) => {
          for (const item of chunk) {
            const reqbody = {
              Cid: item.cid,
              hospCode: `${hospCodeEnv}`,
              drugAllergy: item.drugallergy.map((allergy) => ({
                drugcode: allergy.drugcode,
                drugallergy: allergy.drugallergy,
                drugsymptom: allergy.drugsystom,
              })),
            };
            // Use await to get the response from DrugAxios
            const response = await DrugAxios(reqbody);
            // Push the response to the chunkResponses array
            chunkResponses.push(response);
            // console.log(response);
          }
        })
      );
      if (chunkResponses) {
        const today = new Date();
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate()+1);
        nextWeek.setHours(0, 0, 0, 0);

        // เปลี่ยนเวลาให้เป็น 23:59:00
        nextWeek.setHours(23, 59, 0, 0);
        const axiosConfig = {
          baseURL: `${END_POINT}/eventdrugaligy/`,
          headers: {
            "X-API-KEY": `${Token_DrugAllgy}`,
            "Content-Type": "application/json",
          },
        };
        // จัดรูปแบบวันที่ในรูปแบบ "yyyy-MM-dd"
        const formattedDate = today.toISOString().slice(0, 10);
        const formattedNextWeek = nextWeek.toISOString().slice(0, 10);
        console.log(nextWeek)
        await axios.post(
          "/",
          { date: maxDate, dateUpdate: formattedNextWeek + " 19.59.00" },
          axiosConfig
        );

        return chunkResponses;
      }
      
    } catch (error) {
      console.error(error);
    }
  }


  public async ServiceCheckVisitTicket(
    ticketCheckPassCode: string
  ): Promise<void> {
    const checkToken = await new Promise((reslove, reject) => {
      try {
        const { data, status } = axios
          .post(
            `${END_POINT}/checkticketid/`,
            { ticket: ticketCheckPassCode }, // Use the passed dataDrug
            {
              headers: {
                "Content-Type": "application/json",
                "x-api-key": `${Token_DrugAllgy}`,
              },
            }
          )
          .then((result) => {
            return reslove(result.data);
          });
      } catch (error) { }
    });
    const checkNewDate = new Date();
    //เช็ค ticket ว่าหมดอายุรึยัง
    if (
      checkToken.msg.expireTicket >=
      moment(checkNewDate).format("YYYY-MM-DD HH:mm:ss")
    ) {
      const callGetVisit = new Promise((resolve, reject) => {

        // ส่งค่า listdate ชองคนไข้
        sql`
            SELECT 10690 as hcode, (SELECT name FROM hospcode WHERE hospcode = '10690') AS hospname, p.cid, p.hn, p.pname, p.fname, p.lname, sex.name AS sex, date_part('year', age(p.birthday)) AS age, p.birthday, v.vstdate,
            STRING_AGG(DISTINCT dt.name, ', ') AS diagtype,
            STRING_AGG(DISTINCT ov.icd10, ', ') AS diagcode,
            STRING_AGG(DISTINCT icd.name, ', ') AS diagname,
            STRING_AGG(DISTINCT pr.icd9cm, ', ') AS icd9cm,
            STRING_AGG(DISTINCT cm.name, ', ') AS name
            FROM vn_stat v
            LEFT OUTER JOIN patient p ON p.hn = v.hn
            LEFT OUTER JOIN sex sex ON sex.code = p.sex
            LEFT OUTER JOIN opdscreen sc ON sc.vn = v.vn
            LEFT OUTER JOIN opdscreen_cc_list scl ON scl.vn = v.vn
            LEFT OUTER JOIN ovstdiag ov ON ov.vn = v.vn
            LEFT OUTER JOIN diagtype dt ON dt.diagtype = ov.diagtype
            LEFT OUTER JOIN icd101 icd ON icd.code = ov.icd10
            LEFT OUTER JOIN opitemrece op ON op.vn = v.vn AND op.income IN ('03', '04', '17')
            LEFT OUTER JOIN drugitems drug ON drug.icode = op.icode
            LEFT OUTER JOIN drugusage dr ON dr.drugusage = op.drugusage
            LEFT OUTER JOIN ovstoprt pr ON pr.vn = v.vn
            LEFT OUTER JOIN icd9cm1 cm ON cm.code = pr.icd9cm
            WHERE p.cid =  ${checkToken.msg.cidPatient}
            GROUP BY p.hcode, hospname, p.cid, p.hn, p.pname, p.fname, p.lname, sex.name, age, p.birthday, v.vstdate
            ORDER BY v.vstdate DESC; `
          .then((queryResult) => {
            let visitListArray = { visit: [] };
            for (let index = 0; index < queryResult.length; index++) {
              visitListArray.visit.push({
                date_serv: `${moment(queryResult[index].vstdate).format('YYYY-MM-DD')}`,
                diag_opd: [
                  {
                    diagtype: `${queryResult[index].diagtype}`,
                    diagcode: `${queryResult[index].diagcode}`,
                    diagname: `${queryResult[index].diagname}`,
                  },
                ],
              });
            }
            const data = {
              status: "200",
              message: "OK",
              person: {
                hospcode: `${hospCodeEnv}`,
                hospname: `${hospNameEnv}`,
                cid: `${queryResult[0].cid}`,
                hn: `${queryResult[0].hn}`,
                prename: `${queryResult[0].pname}`,
                name: `${queryResult[0].fname}`,
                lname: `${queryResult[0].lname}`,
                sex: `${queryResult[0].sex}`,
                birth: `${moment(queryResult[0].birthday).format("YYYY-MM-DD")}`,
                age: `${queryResult[0].age}`,
              },
              visit: [{ date_serv: "2020-12-17", diag_opd: "" }],

            };
            const patientWithVisits = {
              ...data,
              visit: visitListArray.visit,
            };
            resolve(patientWithVisits)
          })
          .catch((error) => {
            reject(error);
          });
      });
      return callGetVisit;
    } else {
      return { status: 400, msg: "ticket หมดอายุ" };
    }
  }

  public async ServiceGetVisitListDate(
    ticketCheckPassCode: string,
    date_serv: string
  ): Promise<void> {
    const checkToken = await new Promise((reslove, reject) => {
      try {
        const { data, status } = axios
          .post(
            `${END_POINT}/checkticketid/`,
            { ticket: ticketCheckPassCode }, // Use the passed dataDrug
            {
              headers: {
                "Content-Type": "application/json",
                "x-api-key": `${Token_DrugAllgy}`,
              },
            }
          )
          .then((result) => {
            return reslove(result.data);
          });
      } catch (error) { }
    });
    const checkNewDate = new Date();


    //เช็ค ticket ว่าหมดอายุรึยัง
    if (
      checkToken.msg.expireTicket >=
      moment(checkNewDate).format("YYYY-MM-DD HH:mm:ss")
    ) {
      const callGetVisit = new Promise((resovle, reject) => {
        //  ส่งค่า listdate ชองคนไข้

        sql`select p.hcode as hospcode,hosp.name as hosname,p.cid,v.hn,p.pname,p.fname,p.lname,sex.name as sex,p.birthday,date_part('year',age(p.birthday)) age,
        v.vstdate as date_serv,sc.temperature as btemp,sc.bps as systolic,sc.bpd as diastolic,sc.pulse,sc.rr as respiratory,sc.height as height,sc.waist as weight,sc.bmi
        ,concat(sc.cc,',',sc.hpi,',',p.clinic) as chiefcomp,ov.icd10 as diagcode,icd.name as diagname,v.dx_doctor,doc.name as doctor,dt.name as diagtype ,op.icode,
        drug.did,concat(drug.name,' ',drug.strength) as drugname,op.qty as amount,drug.units,dr.code as drugusage,opr.icd9 as procedcode,cm.name as procedname
        ,lo.lab_items_code as labtest,li.lab_items_name as labname,lo.lab_order_result as labresult,li.lab_items_normal_value as labnormal  
        from vn_stat v
        LEFT OUTER JOIN patient p ON p.hn = v.hn
        LEFT OUTER JOIN sex sex ON sex.code = p.sex
        LEFT OUTER JOIN hospcode hosp ON hosp.hospcode = p.hcode
        LEFT OUTER JOIN opdscreen sc ON sc.vn = v.vn
        LEFT OUTER JOIN opdscreen_cc_list scl ON scl.vn = v.vn
        LEFT OUTER JOIN ovstdiag ov ON ov.vn = v.vn
        LEFT OUTER JOIN diagtype dt ON dt.diagtype = ov.diagtype
        LEFT OUTER JOIN icd101  icd ON icd.code =  ov.icd10
        LEFT OUTER JOIN opitemrece op On op.vn = v.vn  --AND op.income IN ('03','04','17')
        LEFT OUTER JOIN drugitems drug ON drug.icode = op.icode
        LEFT OUTER JOIN drugusage dr ON dr.drugusage = op.drugusage
        LEFT OUTER JOIN ovstoprt pr ON pr.vn = v.vn
        LEFT OUTER JOIN doctor doc ON doc.code = v.dx_doctor
        LEFT OUTER JOIN icd9cm1 cm ON cm.code = pr.icd9cm
        LEFT OUTER JOIN doctor_operation opr ON opr.vn = sc.vn
        LEFT OUTER JOIN lab_head lh on lh.vn = sc.vn
        LEFT OUTER JOIN lab_order lo on lo.lab_order_number = lh.lab_order_number
        LEFT OUTER JOIN lab_items li on li.lab_items_code = lo.lab_items_code
        where p.cid = ${checkToken.msg.cidPatient}   and v.vstdate = ${date_serv};
      `   .then((result) => {
          let daigOpd = { diag_opd: [] };
          let drugOpd = { drug_opd: [] };
          let procudureOpd = { procudure_opd: [] };
          let labOpd = { labfu: [] };
          let currentDiagCode = null;
          let currentDidstd = null;
          let currentProcedCode = null;
          let curretLabsFull = null;
          for (let index = 0; index < result.length; index++) {
            // lab
            const labtest = result[index].labtest;
            if (labtest != null) {
              if (curretLabsFull === null || curretLabsFull !== labtest) {
                labOpd.labfu.push({
                  labtest: result[index].labtest,
                  labname: result[index].labname,
                  labresult: result[index].labresult,
                  labnormal: result[index].labnormal,
                });
              }
            }
            // diageOPd
            const icodeDiag = result[index].icode;
            if (icodeDiag != null) {
              if (currentDiagCode === null || currentDiagCode !== icodeDiag) {
                daigOpd.diag_opd.push({
                  diagtype: result[index].diagtype,
                  diagcode: result[index].icode,
                  diagname: result[index].diagname
                });
              }
            }
            // หัตถการ
            const procedcode = result[index].procedcode;
            if (procedcode != null) {
              if (currentProcedCode === null || currentProcedCode !== procedcode) {
                procudureOpd.procudure_opd.push({
                  procedcode: procedcode,
                  procedname: result[index].procedname,
                });
              }
            }
            // รายการยา
            const did = result[index].did;
            if (did != null) {
              if (currentDidstd === null || currentDidstd !== did) {
                currentDidstd = did;
                drugOpd.drug_opd.push({
                  didstd: did,
                  drugname: result[index].drugname,
                  amount: result[index].amount,
                  unit: result[index].units,
                  usage: result[index].drugusage,
                });
              }
            }

          }

          const getDatePatient: any = {
            status: '200',
            message: 'OK',
            person: {
              hospcode: `${hospCodeEnv}`,
              hospname: `${hospNameEnv}`,
              cid: result[0].cid,
              hn: result[0].hn,
              prename: result[0].pname,
              name: result[0].fname,
              lname: result[0].lname,
              sex: result[0].sex,
              birth: moment(result[0].birthday).format('YYYY-MM-DD'),
              age: result[0].age,
            },
            visit: {
              date_serv: moment(result[0].date_serv).format('YYYY-MM-DD'),
              btemp: result[0].btemp,
              systolic: result[0].systolic,
              diastolic: result[0].diastolic,
              pulse: result[0].pulse,
              respiratory: result[0].respiratory,
              height: result[0].height,
              weight: result[0].weight,
              bmi: result[0].bmi,
              chiefcomp: result[0].chiefcomp,
              doctor: result[0].doctor,
              diag_opd: daigOpd.diag_opd,
              drug_opd: drugOpd.drug_opd,
              procudure_opd: procudureOpd.procudure_opd,
              labfu: labOpd.labfu,
            },
          };
          resovle(getDatePatient);
        })
          .catch((error) => {
            reject(error);
          });

      });
      return callGetVisit;
    } else {
      return { status: 400, msg: "ticket หมดอายุ" };
    }
  }
}

export default HieService;
