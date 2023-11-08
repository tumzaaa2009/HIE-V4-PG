import { Router } from 'express';
import  HieControlers  from '@/controllers/hie.controller';

import { Routes } from '@interfaces/routes.interface';

export class HieRouter implements Routes {
  public path = '/hie';
  public router = Router();
  public HieControler = new HieControlers();
  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(`${this.path}/gettest`, this.HieControler.GetTestHie);
    this.router.post(`${this.path}/drugallgycashe`, this.HieControler.PostDrugAllgy);
    //  เช็ค checkid // ฝั่ง rh4 ไม่ได้ hie
    this.router.post(`${this.path}/visitcashe`, this.HieControler.VisitCahse);



    // ฝั่ง api
    this.router.get(`/get_visit_list`,this.HieControler.GetVisitList)
    this.router.get(`/get_visit_date`,this.HieControler.GetVisitDate)
  }
}
export default  HieRouter
