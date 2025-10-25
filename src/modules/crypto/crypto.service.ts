import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class CryptoService {
  async hash(value: string): Promise<string> {
    return argon2.hash(value);
  }

  async verify(value: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, value);
  }
}
