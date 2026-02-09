import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';

type JwtPayload = {
  sub: string;
  email: string;
  role: string;
  tenant_id: string;
  company_id?: string | null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      throw new Error('JWT_SECRET must be defined in environment variables');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          if (req?.cookies?.access_token) {
            return req.cookies.access_token as string;
          }

          const authHeader = req?.headers?.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.split(' ')[1];
          }

          return null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  validate(payload: JwtPayload) {
    if (!payload) throw new UnauthorizedException('Invalid token payload');

    return {
      user_id: payload.sub,
      email: payload.email,
      role: payload.role,
      tenant_id: payload.tenant_id,
      company_id: payload.company_id ?? null,
    };
  }
}
