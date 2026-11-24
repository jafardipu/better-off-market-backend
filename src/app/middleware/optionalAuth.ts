import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import config from '../config/index';

// Sets req.user when the request carries a valid Bearer token. With no token,
// or an invalid or expired one, the request simply continues as a guest.
// Unlike auth(), this never rejects a request.
const optionalAuth = () => (req: Request, _res: Response, next: NextFunction) => {
  const token = req.headers?.authorization?.split(' ')[1];
  if (token) {
    try {
      req.user = jwt.verify(token, config.jwt_access_secret as string) as JwtPayload;
    } catch {
      // Invalid or expired token: treat the request as a guest.
    }
  }
  next();
};

export default optionalAuth;
