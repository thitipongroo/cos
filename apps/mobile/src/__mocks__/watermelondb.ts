export class Model {
  id = 'mock-id';
  static table = '';
  update = jest.fn();
  markAsDeleted = jest.fn();
}

export const appSchema = (args: unknown) => args;
export const tableSchema = (args: unknown) => args;
export class Database {}

export const field = () => (_proto: unknown, _key: string) => {};
export const writer = (_proto: unknown, _key: string, descriptor: PropertyDescriptor) => descriptor;
