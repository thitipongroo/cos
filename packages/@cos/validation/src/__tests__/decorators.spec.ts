// Unit tests for @cos/validation custom decorators

import 'reflect-metadata';
import { validate } from 'class-validator';
import { IsCurrencyCode, IsDecimalString } from '../decorators';

class TestDto {
  @IsCurrencyCode()
  currency!: string;
}

class TestDecimalDto {
  @IsDecimalString()
  amount!: string;
}

describe('IsCurrencyCode', () => {
  it('accepts valid ISO 4217 codes', async () => {
    const dto = Object.assign(new TestDto(), { currency: 'THB' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts USD, EUR, JPY', async () => {
    for (const code of ['USD', 'EUR', 'JPY']) {
      const dto = Object.assign(new TestDto(), { currency: code });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects lowercase code', async () => {
    const dto = Object.assign(new TestDto(), { currency: 'thb' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects code longer than 3 chars', async () => {
    const dto = Object.assign(new TestDto(), { currency: 'THBB' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects code shorter than 3 chars', async () => {
    const dto = Object.assign(new TestDto(), { currency: 'TH' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects numeric string', async () => {
    const dto = Object.assign(new TestDto(), { currency: '123' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('IsDecimalString', () => {
  it('accepts valid decimal strings', async () => {
    for (const val of ['100', '100.50', '0.1234', '-50.99']) {
      const dto = Object.assign(new TestDecimalDto(), { amount: val });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('accepts integer string', async () => {
    const dto = Object.assign(new TestDecimalDto(), { amount: '1000' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects more than 4 decimal places', async () => {
    const dto = Object.assign(new TestDecimalDto(), { amount: '1.12345' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects non-numeric string', async () => {
    const dto = Object.assign(new TestDecimalDto(), { amount: 'abc' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects empty string', async () => {
    const dto = Object.assign(new TestDecimalDto(), { amount: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
