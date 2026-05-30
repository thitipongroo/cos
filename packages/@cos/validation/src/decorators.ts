import { registerDecorator, ValidationOptions } from 'class-validator';

/** Validates that a string is a valid ISO 4217 currency code (3 uppercase letters). */
export function IsCurrencyCode(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCurrencyCode',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && /^[A-Z]{3}$/.test(value);
        },
        defaultMessage() {
          return '$property must be a valid ISO 4217 currency code (e.g. THB, USD)';
        },
      },
    });
  };
}

/** Validates that a string is a valid decimal number (for monetary amounts). */
export function IsDecimalString(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDecimalString',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && /^-?\d+(\.\d{1,4})?$/.test(value);
        },
        defaultMessage() {
          return '$property must be a decimal number string with up to 4 decimal places';
        },
      },
    });
  };
}
