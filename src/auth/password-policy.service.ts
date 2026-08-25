import { BadRequestException, Injectable } from '@nestjs/common';

interface PasswordContext {
  email: string;
  name: string;
}

@Injectable()
export class PasswordPolicyService {
  validate(password: string, context: PasswordContext): void {
    const normalizedPassword = password.toLowerCase();

    const emailLocalPart = context.email.split('@')[0].trim().toLowerCase();

    const emailParts = emailLocalPart
      .split(/[._+-]+/)
      .filter((part) => part.length >= 3);

    const nameParts = context.name
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((part) => part.length >= 3);

    for (const emailPart of emailParts) {
      if (normalizedPassword.includes(emailPart)) {
        throw new BadRequestException(
          'Password must not contain your email address identifier',
        );
      }
    }

    for (const namePart of nameParts) {
      if (normalizedPassword.includes(namePart)) {
        throw new BadRequestException('Password must not contain your name');
      }
    }
  }
}
