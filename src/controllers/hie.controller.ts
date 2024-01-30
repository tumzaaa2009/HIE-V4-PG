import { NextFunction, Request, Response } from 'express';
import HieService from '@/services/hie.service';
import sql from '@/dbconfig'
import { resolve } from 'path';
import { Token_DrugAllgy} from '@config';
class HieControlers {
  public hieService = new HieService();
  constructor() {}
  public GetTestHie = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result: {} = await new Promise((resolve, reject) => {
        sql`SELECT cid FROM vn_stat limit 1 `
          .then((queryResult) => {
            console.log(queryResult)
            // Resolve with the query result
        
            resolve(queryResult);
          })
          .catch((error) => {
            // Reject with the error
            resolve(error);
          });

      })
      res.send(result);
    } catch (error) {
      res.status(400);
    }
  };
  public VisitCahse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
   
    const restDrugAllgy =  await this.hieService.ServiceVisitCashe(Token_DrugAllgy); 
      
     res.send(restDrugAllgy)
   };


// ส่ง ข้อมูล visitCahse ตาม ***last Update*** เช่นเขตเก็บ วันที่ แล้วเอา วันที่ ที่เขตเก็บมา bettween 
  public PostDrugAllgy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
 
   const restDrugAllgy =  await this.hieService.ServiceDrugAllgyCashe(Token_DrugAllgy,req.body.visitList); 
     
    res.send(restDrugAllgy)
  };

  
  public GetVisitList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const restCheckVisitTicket =  await this.hieService.ServiceCheckVisitTicket(req.headers['x-api-key']); 
 
     res.send(restCheckVisitTicket)
   };
   public GetVisitDate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const restCheckVisitTicket =  await this.hieService.ServiceGetVisitListDate(req.headers['x-api-key'],req.body.date_serv); 

   res.send(restCheckVisitTicket)
 };


 public GetAdmitList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const visitListIpd = await this.hieService.ServiceCheckVisitTicketIpd(req.headers['x-api-key']);
  
  res.send(visitListIpd);
};

public GetAdmitAn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
 
 const visitAdmitAn = await this.hieService.ServiceAdmitAn(req.headers['x-api-key'], req.body.date_serv, req.body.an);

  res.send(visitAdmitAn);
};

}

export default HieControlers;
