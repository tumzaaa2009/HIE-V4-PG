import sql from "@/dbconfig";
const batchSize: number = 2000; // จำนวนรายการที่จะส่งในแต่ละครั้ง
import axios from "axios";
import moment from "moment";
import { Token_DrugAllgy, END_POINT, hospCodeEnv, hospNameEnv, provinceCode } from "@config";
import { queryResult } from "pg-promise";
import { resolve } from "path";
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

        const query = {
          text: `
            SELECT 
              a.cid AS cid,
              $1 AS hospcode,
              $3 AS provinceCode,
              MAX(a.vstdate) AS vstdate 
            FROM vn_stat a 
            WHERE CHAR_LENGTH(a.cid) = 13 
              AND a.cid NOT LIKE '0%' 
              AND a.vstdate <= NOW()
              AND a.vstdate BETWEEN $2 AND NOW()
            GROUP BY a.cid
            ORDER BY vstdate DESC;
          `, values: [hospCodeEnv, checkVisitListDate, provinceCode],
        };
        sql.query(query).then(queryResult => {
          console.log(queryResult.rows)
          maxDate = moment(queryResult.rows[0].vstdate).format("YYYY-MM-DD")
          resolve(queryResult.rows); // รีเทิร์นค่า queryResult ดังกล่าว
        })

      });
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
        nextWeek.setDate(today.getDate() + 1);
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
        const query = {
          text: `   SELECT 
          pa.cid AS cid,
          $1 AS hospcode,
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
          AND DATE(a.report_date) BETWEEN $2 AND NOW()
        ORDER BY a.report_date DESC; `, values: [hospCodeEnv, checkVisitCaheResult],
        }
        sql.query(query)
          .then(queryResult => {
            console.log(queryResult.rows)
            const originalDate = moment(
              queryResult.rows[0].update_date,
              "YYYY-MM-DD")
            const previousDate = originalDate
              .subtract("days")
              .format("YYYY-MM-DD");
            maxDate = previousDate;
            const formattedResult = formatResult(queryResult.rows);
            resolve(formattedResult);
          }).catch(error => {
            console.error('Error executing query', error);
          })
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
        nextWeek.setDate(today.getDate() + 1);
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
      let visitListArray = { visit: [] };
      const callGetVisit = new Promise((resolve, reject) => {
        const query = {
          text: ` SELECT
          $1 AS hospcode,
          (SELECT hospital_thai_name FROM hospital_profile) AS hosname,
          p.cid,
          p.hn,
          p.pname,
          p.fname,
          p.lname,
          sex.name AS sex, date_part('year', age(p.birthday)) AS age,
			  p.birthday
        FROM
          patient p
        LEFT OUTER JOIN sex sex ON sex.code = p.sex
        WHERE
          p.cid = $2
            ;
          `,
          values: [hospCodeEnv, checkToken.msg.cidPatient],
        };

        sql.query(query)
          .then(queryResult => {

            resolve({
              status: "200",
              message: "OK",
              person: {
                hospcode: `${hospCodeEnv}`,
                hospname: `${hospNameEnv}`,
                cid: `${queryResult.rows[0].cid}`,
                hn: `${queryResult.rows[0].hn}`,
                prename: `${queryResult.rows[0].pname}`,
                name: `${queryResult.rows[0].fname}`,
                lname: `${queryResult.rows[0].lname}`,
                sex: `${queryResult.rows[0].sex}`,
                birth: `${moment(queryResult.rows[0].birthday).format("YYYY-MM-DD")}`,
                age: `${queryResult.rows[0].age}`,
              },
            })

          })
          .catch(error => {
            console.error('Error executing query', error);
          })

      });
      const resolvedPatientWithVisits = await callGetVisit
        .then(async (result) => {
          console.log('Resolved result:', result.person.cid);
          const query = {
            text: `SELECT v.vstdate,
          dt.name AS diagtype,
          ov.icd10 AS diagcode,
          icd.name AS diagname,
          pr.icd9cm AS icd9cm,
          cm.name AS name
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
          WHERE p.cid= $1
          ORDER BY ov.vstdate DESC
            ;
          `,
            values: [result.person.cid],
          };

          // ใช้ async/await เพื่อรอคำตอบจาก Promise
          const resQueryVisitList = await sql.query(query);

          for (let index = 0; index < resQueryVisitList.rows.length; index++) {
            const currentDate = moment(resQueryVisitList.rows[index].vstdate).format('YYYY-MM-DD');
            const existingDateIndex = visitListArray.visit.findIndex(item => item.date_serv === currentDate);
            const newDiag = {
              diagtype: `${resQueryVisitList.rows[index].diagtype}`,
              diagcode: `${resQueryVisitList.rows[index].diagcode}`,
              diagname: `${resQueryVisitList.rows[index].diagname}`,
            };

            // ตรวจสอบว่า diagcode ไม่เท่ากับค่าว่างหรือ null
            if (newDiag.diagcode !== '' && newDiag.diagcode !== "null") {
              if (existingDateIndex !== -1) {
                // ตรวจสอบว่า diagcode นี้มีอยู่ใน diag_opd แล้วหรือไม่
                const existingDiagIndex = visitListArray.visit[existingDateIndex].diag_opd.findIndex(item => item.diagcode === newDiag.diagcode);

                if (existingDiagIndex === -1) {
                  // ถ้ายังไม่มีให้เพิ่มเฉพาะถ้าไม่ซ้ำ
                  visitListArray.visit[existingDateIndex].diag_opd.push(newDiag);
                }
              } else {
                // ถ้าไม่มีวันที่นี้ใน visitListArray ให้สร้างใหม่
                visitListArray.visit.push({
                  date_serv: currentDate,
                  diag_opd: [newDiag],
                });
              }
            }
          }

          const patientWithVisits = {
            ...result,
            visit: visitListArray.visit,
          };


          return patientWithVisits;
        })
        .catch((error) => {
          console.error('Error:', error);
          throw error;
        })

      return resolvedPatientWithVisits


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


        const queryGetVisitDate = {
          text: `
          SELECT p.hcode as hospcode, hosp.name as hosname, p.cid, v.hn, p.pname, p.fname, p.lname, sex.name as sex, p.birthday,
          date_part('year', age(p.birthday)) as age, v.vstdate as date_serv, sc.temperature as btemp, sc.bps as systolic, 
          sc.bpd as diastolic, sc.pulse, sc.rr as respiratory, sc.height as height, sc.waist as weight, sc.bmi,
          concat(sc.cc, ',', sc.hpi, ',', p.clinic) as chiefcomp, ov.icd10 as diagcode, icd.name as diagname, v.dx_doctor,
          doc.name as doctor, dt.name as diagtype, op.icode, drug.did, concat(drug.name, ' ', drug.strength) as drugname,
          op.qty as amount, drug.units, dr.code as drugusage, opr.icd9 as procedcode, cm.name as procedname, lo.lab_items_code as labtest,
          li.lab_items_name as labname, lo.lab_order_result as labresult, li.lab_items_normal_value as labnormal,sc.pe
          FROM vn_stat v
          LEFT OUTER JOIN patient p ON p.hn = v.hn
          LEFT OUTER JOIN sex sex ON sex.code = p.sex
          LEFT OUTER JOIN hospcode hosp ON hosp.hospcode = p.hcode
          LEFT OUTER JOIN opdscreen sc ON sc.vn = v.vn
          LEFT OUTER JOIN opdscreen_cc_list scl ON scl.vn = v.vn
          LEFT OUTER JOIN ovstdiag ov ON ov.vn = v.vn
          LEFT OUTER JOIN diagtype dt ON dt.diagtype = ov.diagtype
          LEFT OUTER JOIN icd101 icd ON icd.code = ov.icd10
          LEFT OUTER JOIN opitemrece op ON op.vn = v.vn
          LEFT OUTER JOIN drugitems drug ON drug.icode = op.icode
          LEFT OUTER JOIN drugusage dr ON dr.drugusage = op.drugusage
          LEFT OUTER JOIN ovstoprt pr ON pr.vn = v.vn
          LEFT OUTER JOIN doctor doc ON doc.code = v.dx_doctor
          LEFT OUTER JOIN icd9cm1 cm ON cm.code = pr.icd9cm
          LEFT OUTER JOIN doctor_operation opr ON opr.vn = sc.vn
          LEFT OUTER JOIN lab_head lh ON lh.vn = sc.vn
          LEFT OUTER JOIN lab_order lo ON lo.lab_order_number = lh.lab_order_number
          LEFT OUTER JOIN lab_items li ON li.lab_items_code = lo.lab_items_code
          WHERE p.cid = $1 AND v.vstdate = $2;
        `,
          values: [checkToken.msg.cidPatient, date_serv],
        };

        sql.query(queryGetVisitDate)
          .then(queryResult => {
            console.log(queryResult.rows);
            let daigOpd = { diag_opd: [] };
            let drugOpd = { drug_opd: [] };
            let procudureOpd = { procudure_opd: [] };
            let labOpd = { labfu: [] };
            let currentDiagCode = null;
            let currentDidstd = null;
            let currentProcedCode = null;
            let curretLabsFull = null;
            for (let index = 0; index < queryResult.rows.length; index++) {
              // lab
              const labtest = queryResult.rows[index].labtest;
              if (labtest != null) {
                const existingLabsIndex = labOpd.labfu.findIndex(item => item.labtest === labtest);
                if (existingLabsIndex === -1) {
                  if (curretLabsFull === null || curretLabsFull !== labtest) {
                    labOpd.labfu.push({
                      labtest: queryResult.rows[index].labtest,
                      labname: queryResult.rows[index].labname,
                      labresult: queryResult.rows[index].labresult,
                      labnormal: queryResult.rows[index].labnormal,
                    });
                  }
                }
              }
              // diageOPd
              const icodeDiag = queryResult.rows[index].icode;
              if (icodeDiag != null) {
                if (currentDiagCode === null || currentDiagCode !== icodeDiag) {
                  const existingLabsIndex = daigOpd.diag_opd.findIndex(item => item.icode === icodeDiag);
                  daigOpd.diag_opd.push({
                    diagtype: queryResult.rows[index].diagtype,
                    diagcode: queryResult.rows[index].icode,
                    diagname: queryResult.rows[index].diagname,
                  });
                }
              }
              // หัตถการ
              const procedcode = queryResult.rows[index].procedcode;
              if (procedcode != null) {
                if (currentProcedCode === null || currentProcedCode !== procedcode) {
                  const existingProcedIndex = procudureOpd.procudure_opd.findIndex(item => item.procedcode === procedcode);

                  if (existingProcedIndex === -1) {
                    procudureOpd.procudure_opd.push({
                      procedcode: procedcode,
                      procedname: queryResult.rows[index].procedname,
                    });
                  }
                }
              }
              // รายการยา
              const did = queryResult.rows[index].did;
              if (did != null) {
                if (currentDidstd === null || currentDidstd !== did) {
                  currentDidstd = did;
                  const existingDidIndex = drugOpd.drug_opd.findIndex(item => item.didstd === did);
                  if (existingDidIndex === -1) {
                    drugOpd.drug_opd.push({
                      didstd: did,
                      drugname: queryResult.rows[index].drugname,
                      amount: queryResult.rows[index].amount,
                      unit: queryResult.rows[index].units,
                      usage: queryResult.rows[index].drugusage,
                    });
                  }
                }
              }
            }
            const getDatePatient: any = {
              status: '200',
              message: 'OK',
              person: {
                hospcode: `${hospCodeEnv}`,
                hospname: `${hospNameEnv}`,
                cid: queryResult.rows[0].cid,
                hn: queryResult.rows[0].hn,
                prename: queryResult.rows[0].pname,
                name: queryResult.rows[0].fname,
                lname: queryResult.rows[0].lname,
                sex: queryResult.rows[0].sex,
                birth: moment(queryResult.rows[0].birthday).format('YYYY-MM-DD'),
                age: queryResult.rows[0].age,
              },
              visit: {
                date_serv: moment(queryResult.rows[0].date_serv).format('YYYY-MM-DD'),
                btemp: queryResult.rows[0].btemp,
                systolic: queryResult.rows[0].systolic,
                diastolic: queryResult.rows[0].diastolic,
                pulse: queryResult.rows[0].pulse,
                respiratory: queryResult.rows[0].respiratory,
                height: queryResult.rows[0].height,
                weight: queryResult.rows[0].weight,
                bmi: queryResult.rows[0].bmi,
                chiefcomp: queryResult.rows[0].chiefcomp,
                physical_exam: queryResult.rows[0].pe,
                doctor: queryResult.rows[0].doctor,
                diag_opd: daigOpd.diag_opd,
                drug_opd: drugOpd.drug_opd,
                procudure_opd: procudureOpd.procudure_opd,
                labfu: labOpd.labfu,
              },
            };
            resovle(getDatePatient);
          })
          .catch(error => {
            console.error('Error executing query', error);
          })
      });

      return callGetVisit;
    } else {
      return { status: 400, msg: "ticket หมดอายุ" };
    }
  }

  public async ServiceCheckVisitTicketIpd(ticketCheckPassCode: string): Promise<void> {
    const checkToken = await new Promise((reslove, reject) => {
      try {
        const { data, status } = axios
          .post(
            `${END_POINT}/checkticketid/`,
            { ticket: ticketCheckPassCode }, // Use the passed dataDrug
            {
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': `${Token_DrugAllgy}`,
              },
            },
          )
          .then(result => {
            return reslove(result.data);
          });
      } catch (error) { }
    });
    const checkNewDate = new Date();
    //เช็ค ticket ว่าหมดอายุรึยัง
    if (checkToken.msg.expireTicket >= moment(checkNewDate).format('YYYY-MM-DD HH:mm:ss')) {

      let visitListArray = { visit: [] };
      const callGetVisitPatient = await new Promise((resolve, reject) => {
        //  ส่งค่า listdate ชองคนไข้
        const query = {
          text: ` SELECT
          $1 AS hospcode,
          (SELECT hospital_thai_name FROM hospital_profile) AS hosname,
          p.cid,
          p.hn,
          p.pname,
          p.fname,
          p.lname,
          sex.name AS sex, date_part('year', age(p.birthday)) AS age,
			  p.birthday
        FROM
          patient p
        LEFT OUTER JOIN sex sex ON sex.code = p.sex
        WHERE
          p.cid = $2
            ;
          `,
          values: [hospCodeEnv, checkToken.msg.cidPatient],
        };
        sql.query(query)
          .then(queryResult => {
            resolve({
              status: "200",
              message: "OK",
              person: {
                hospcode: `${hospCodeEnv}`,
                hospname: `${hospNameEnv}`,
                cid: `${queryResult.rows[0].cid}`,
                hn: `${queryResult.rows[0].hn}`,
                prename: `${queryResult.rows[0].pname}`,
                name: `${queryResult.rows[0].fname}`,
                lname: `${queryResult.rows[0].lname}`,
                sex: `${queryResult.rows[0].sex}`,
                birth: `${moment(queryResult.rows[0].birthday).format("YYYY-MM-DD")}`,
                age: `${queryResult.rows[0].age}`,
              },
            })

          })
          .catch(error => {
            console.error('Error executing query', error);
          })
      });

      if (callGetVisitPatient.person.cid != '') {
        const callGetVisitIpd: any = await new Promise((resolve, reject) => {
          const valueHn = callGetVisitPatient.person.hn;
          const queryDetailAdmit = {
            text: `
            SELECT ipt.an, ipt.regdate as admit_date, ipt.regtime as admit_time
              , ipt.dchdate as discharge_date, ds.name as discharge_status
              , dt.name as discharge_type, ans.admdate as los
            FROM ipt 
            LEFT OUTER JOIN dchstts ds ON ds.dchstts = ipt.dchstts
            LEFT OUTER JOIN dchtype dt ON dt.dchtype = ipt.dchtype
            LEFT OUTER JOIN an_stat ans ON ans.an = ipt.an  
            WHERE ipt.hn=$1 
            order by ipt.regdate  DESC
          `, values: [valueHn]
          };
          sql.query(queryDetailAdmit).then(resIpd => {
            resolve(resIpd.rows)
          });
        });
        const promises = callGetVisitIpd.map(visit => {
          const valueAn = visit.an;
          return new Promise((resolve, reject) => {
            const queryDiagIpd = {
              text: `
            SELECT  
            ipt.modify_datetime  as diagtime,
            c1.code as diagcode,
            c1.name as diagname,
            (SELECT name FROM diagtype WHERE diagtype = ipt.diagtype) as diagtype
            FROM
              iptdiag ipt
            RIGHT JOIN
              icd101 c1 ON c1.code = ipt.icd10
            WHERE
              ipt.an = $1`, values: [valueAn]
            }
            sql.query(queryDiagIpd).then(resDiagIpd => {
              resolve({
                ...visit, // Include original visit data
                diag_ipd: resDiagIpd.rows, // Include diagnosis data
              });
            });

          });
        });

        const result = await Promise.all(promises);
        const modifiedResult = result.map(visitData => {
          const modifiedVisitData = { ...visitData };
          modifiedVisitData.admit_date = moment(visitData.admit_date).format('YYYY-MM-DD');
          modifiedVisitData.discharge_date = moment(visitData.discharge_date).format('YYYY-MM-DD');
          return modifiedVisitData;
        });
       
        callGetVisitPatient.admit = modifiedResult;
       
        return callGetVisitPatient;

      } else {
        return { status: 400, msg: 'ticket หมดอายุ' };
      }



    }
  }
  public async ServiceAdmitAn(ticketCheckPassCode: string, dateServe, an): Promise<void> {
    const checkToken = await new Promise((reslove, reject) => {
      try {
        const { data, status } = axios
          .post(
            `${END_POINT}/checkticketid/`,
            { ticket: ticketCheckPassCode }, // Use the passed dataDrug
            {
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': `${Token_DrugAllgy}`,
              },
            },
          )
          .then(result => {
            return reslove(result.data);
          });
      } catch (error) { }
    });
    const checkNewDate = new Date();
    //เช็ค ticket ว่าหมดอายุรึยัง
    if (checkToken.msg.expireTicket >= moment(checkNewDate).format('YYYY-MM-DD HH:mm:ss')) {
      let visitListArray = { visit: [] };
      const callGetVisitPatient = await new Promise((resolve, reject) => {
        //  ส่งค่า listdate ชองคนไข้
        const query = {
          text: `  select 
                  $1 AS hospcode,
                  $2 AS hosname,
                  pt.cid,
                  pt.hn,
                  pt.pname,
                  pt.fname,
                  pt.lname,
                  sex.name AS sex, 
                  date_part('year', age(pt.birthday)) AS AGE,
                  pt.birthday
                  from ipt r
                  left outer join an_stat a on a.an=r.an
                  left outer join patient pt on pt.hn=a.hn
                  left outer join ward w on w.ward=a.ward
                  left outer join iptadm b on b.an=r.an
                  left outer join pttype pty on pty.pttype=a.pttype
                  left outer join opdscreen os on os.vn=a.vn
                  LEFT OUTER JOIN sex sex ON sex.code = pt.sex
                  where r.an = $3
            ;
          `,
          values: [hospCodeEnv, hospNameEnv, an],
        };

        sql.query(query)
          .then(queryResult => {
            resolve({
              status: "200",
              message: "OK",
              person: {
                hospcode: `${hospCodeEnv}`,
                hospname: `${hospNameEnv}`,
                cid: `${queryResult.rows[0].cid}`,
                hn: `${queryResult.rows[0].hn}`,
                prename: `${queryResult.rows[0].pname}`,
                name: `${queryResult.rows[0].fname}`,
                lname: `${queryResult.rows[0].lname}`,
                sex: `${queryResult.rows[0].sex}`,
                birth: `${moment(queryResult.rows[0].birthday).format("YYYY-MM-DD")}`,
                age: `${queryResult.rows[0].age}`,
              },
            })

          })
          .catch(error => {
            console.error('Error executing query', error);
          })
      });

      const callGetAdmit: any = await new Promise((resolve, reject) => {
        const queryDetailAdmit = {
          text: `
        SELECT ipt.an, ipt.regdate as admit_date, ipt.regtime as admit_time
          , ipt.dchdate as discharge_date, ds.name as discharge_status
          , dt.name as discharge_type, ans.admdate as los
        FROM ipt 
        LEFT OUTER JOIN dchstts ds ON ds.dchstts = ipt.dchstts
        LEFT OUTER JOIN dchtype dt ON dt.dchtype = ipt.dchtype
        LEFT OUTER JOIN an_stat ans ON ans.an = ipt.an  
        WHERE ipt.an=$1 
        order by ipt.regdate  DESC
        `, values: [an]
        }
        sql.query(queryDetailAdmit).then(resIpd => {
          resolve(resIpd.rows)
        });
      });

      const resultCallGetAdmit: any = callGetAdmit.map(getModifyAdmit => {
        const modifyCallGetAdmit = { ...getModifyAdmit };
        modifyCallGetAdmit.admit_date = moment(getModifyAdmit.admit_date).format('YYYY-MM-DD');
        modifyCallGetAdmit.discharge_date = moment(getModifyAdmit.discharge_date).format('YYYY-MM-DD');
        return modifyCallGetAdmit;
      });


      const doctorNote: any = await new Promise((resolve, reject) => {
        const querydoctornote: any = {
          text: `SELECT begin_date_time as  note_date ,operation_detail_text as note_detail
        from ipt pt 
        LEFT OUTER JOIN doctor_operation dot on dot.vn = pt.vn
        LEFT OUTER JOIN er_oper_code eoc ON eoc.er_oper_code=dot.er_oper_code
        LEFT OUTER JOIN doctor d ON d.code = dot.doctor
        Where pt.an =$1 
      `, values: [an]
        };
        sql.query(querydoctornote).then(resDoctorNote => {

          resolve(resDoctorNote.rows);

        });
      });






      const nurseNote: any = await new Promise((resolve, reject) => {
        const querynursenote: any = {
          text: `SELECT begin_date_time as note_date, oper_note as detail_note
          FROM ipt_nurse_oper ino
          LEFT OUTER JOIN ipt_oper_code ioc ON ioc.ipt_oper_code = ino.ipt_oper_code
          LEFT OUTER JOIN doctor d ON d.code = ino.doctor
          WHERE ino.an =$1 
      `, values: [an]
        };
        sql.query(querynursenote).then(resNurseNote => {

          resolve(resNurseNote.rows);

        });
      });
      const callGetIpdDiag: any = await new Promise((resolve, reject) => {
        const queryDiagIpd = {
          text: `
        SELECT  
        ipt.modify_datetime  as diagtime,
        c1.code as diagcode,
        c1.name as diagname,
        (SELECT name FROM diagtype WHERE diagtype = ipt.diagtype) as diagtype
        FROM
          iptdiag ipt
        RIGHT JOIN
          icd101 c1 ON c1.code = ipt.icd10
        WHERE
          ipt.an = $1`, values: [an]
        };
        sql.query(queryDiagIpd).then(resDiagIpd => {
          resolve(resDiagIpd.rows);
        })

      });

      const resultIpdDiag: any = callGetIpdDiag.map(visitData => {
        const modifiedVisitData = { ...visitData };
        modifiedVisitData.diagtime = moment(visitData.diagtime).format('YYYY-MM-DD');
        return modifiedVisitData;
      });




      const resQeuryDrug = await new Promise((resolve, reject) => {
        const query = {
          text: `SELECT iptorderno.order_type as home_med,opi.order_no,opi.an,opi.rxdate as date_order ,opi.icode as didstd,concat(dr.name,'  ',dr.strength,'   ',dr.units) as drugname 
          ,opi.qty as amounts
          , dr.units as units
          ,du.code,du.name2 as useage
          from opitemrece opi
          left outer join drugitems dr on dr.icode=opi.icode
          left outer join drugusage du on du.drugusage=dr.drugusage
          left outer join ipt_order_no iptorderno on iptorderno.an = opi.an     
           where opi.an = $1 and dr.name <> '' and opi.qty >0 `, values: [an]
        };
        sql.query(query).then(queryResult => {
          resolve(queryResult.rows)
        });
      })
      const responseDrug = await resQeuryDrug
      const resultIpddrug: any = responseDrug.reduce((accumulator, drugData) => {
        const existingDrug = accumulator.find(item => item.order_no === drugData.order_no && item.home_med === drugData.home_med);
        if (!existingDrug) {
          const modifiedIpdDrug = { ...drugData };
          modifiedIpdDrug.date_order = moment(drugData.date_order).format('YYYY-MM-DD');

          accumulator.push(modifiedIpdDrug);
        }

        return accumulator;
      }, []);


      const callGetProcudue: any = await new Promise((resolve, reject) => {
        const queryProcudue: any = {
          text: ` 
        SELECT oprt.opdate as date_start ,oprt.enddate  as end_date
        , icd9.code as procedcode, icd9.name as procedname
        FROM  ipt 
        LEFT JOIN iptoprt oprt  on oprt.an = ipt.an
        LEFT join icd9cm1 icd9 on icd9.code=oprt.icd9
        where ipt.an =$1`, values: [an]
        };
        sql.query(queryProcudue).then(queryResult => {
          resolve(queryResult.rows)
        });

      });
      const resultIpdOprt: any = callGetProcudue.map(oprtData => {
        const modifiedIpdOprtData = { ...oprtData };
        modifiedIpdOprtData.date_start = moment(modifiedIpdOprtData.date_start).format('YYYY-MM-DD');
        modifiedIpdOprtData.end_date = moment(modifiedIpdOprtData.end_date).format('YYYY-MM-DD');
        return modifiedIpdOprtData;
      });

      const labIpd: any = await new Promise((resolve, rejects) => {
        const queryLabIpd: any = {
          text: `SELECT
          h.order_date AS date_order,
          l.lab_items_code AS labtest,
          i.lab_items_name AS labname,
          i.lab_items_normal_value AS labnormal,
          CASE
            WHEN (i.lab_items_name NOT LIKE '%hiv%' AND i.lab_items_name NOT LIKE '%interpretation%')
            THEN l.lab_order_result
            ELSE 'ปกปิด'
          END AS labresult
        FROM
          lab_head h
          INNER JOIN lab_order l ON h.lab_order_number = l.lab_order_number
          INNER JOIN lab_items i ON i.lab_items_code = l.lab_items_code
        WHERE
          h.vn = $1;
        `, values: [an]
        };
        sql.query(queryLabIpd).then(queryResult => {

          resolve(queryResult.rows);

        });
      });
      const resultIpdLab: any = labIpd.map(LabData => {
        const modifiedIpdLab = { ...LabData };
        modifiedIpdLab.date_order = moment(modifiedIpdLab.date_order).format('YYYY-MM-DD');
        return modifiedIpdLab;
      });
      callGetVisitPatient.admit = resultCallGetAdmit;
      callGetVisitPatient.doctor_note = doctorNote;
      callGetVisitPatient.nurse_note = nurseNote;
      callGetVisitPatient.diag_ipd = resultIpdDiag;
      callGetVisitPatient.drug_ipd = resultIpddrug;
      callGetVisitPatient.procudure_ipd = resultIpdOprt;
      callGetVisitPatient.lab_ipd = resultIpdLab;

      return callGetVisitPatient;

    } else {
      return { status: 400, msg: 'ticket หมดอายุ' };
    }
  }

}

export default HieService;
