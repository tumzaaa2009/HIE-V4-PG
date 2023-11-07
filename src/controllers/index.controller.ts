import { NextFunction, Request, Response } from 'express';

class IndexController {
  public index = (req: Request, res: Response, next: NextFunction): void => {
    res.send('<h1>Rh4cloudcenter!</h1>');
  };
}

export default IndexController;
