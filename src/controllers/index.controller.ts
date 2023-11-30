import { NextFunction, Request, Response } from 'express';
import {  hospCodeEnv } from "@config";
class IndexController {
  public index = (req: Request, res: Response, next: NextFunction): void => {
    res.send({hospCode:hospCodeEnv,value : "Rh4cloudcenter!"})
  };
}

export default IndexController;
