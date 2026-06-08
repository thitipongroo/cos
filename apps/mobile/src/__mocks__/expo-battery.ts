export enum BatteryState {
  Unknown = 0,
  Unplugged = 1,
  Charging = 2,
  Full = 3,
}

export const getBatteryLevelAsync = jest.fn().mockResolvedValue(1.0);
export const getBatteryStateAsync = jest.fn().mockResolvedValue(BatteryState.Charging);
