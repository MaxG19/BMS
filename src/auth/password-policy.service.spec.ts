import { BadRequestException } from '@nestjs/common';
import { PasswordPolicyService } from './password-policy.service';

describe('PasswordPolicyService', () => {
  let service: PasswordPolicyService;

  beforeEach(() => {
    service = new PasswordPolicyService();
  });

  it('should accept a password that does not contain contextual identifiers', () => {
    expect(() =>
      service.validate('X9!secureRandomPassword', {
        email: 'john.doe@example.com',
        name: 'John Doe',
      }),
    ).not.toThrow();
  });

  it('should reject a password containing the email local-part identifier', () => {
    expect(() =>
      service.validate('JohnDoe!2026Secure', {
        email: 'john.doe@example.com',
        name: 'Someone Else',
      }),
    ).toThrow(BadRequestException);
  });

  it('should reject a password containing a name component', () => {
    expect(() =>
      service.validate('WelcomeJohn!2026', {
        email: 'different@example.com',
        name: 'John Doe',
      }),
    ).toThrow(BadRequestException);
  });

  it('should perform contextual checks case-insensitively', () => {
    expect(() =>
      service.validate('SECUREJOHN123!', {
        email: 'john@example.com',
        name: 'John Smith',
      }),
    ).toThrow(BadRequestException);
  });

  it('should ignore email/name fragments shorter than three characters', () => {
    expect(() =>
      service.validate('SecurePassword123!', {
        email: 'ab.cd@example.com',
        name: 'Ab Cd',
      }),
    ).not.toThrow();
  });

  it('should handle separators in the email local-part', () => {
    expect(() =>
      service.validate('johnsmith!2026', {
        email: 'john.smith@example.com',
        name: 'Different Person',
      }),
    ).toThrow(BadRequestException);
  });
});
