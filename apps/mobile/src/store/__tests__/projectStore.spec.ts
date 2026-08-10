jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import * as SecureStore from 'expo-secure-store';
import { useProjectStore, type ActiveProject } from '../projectStore';

const SKYLINE: ActiveProject = {
  projectId: '11111111-1111-1111-1111-111111111111',
  projectCode: 'SKV45',
  projectName: 'The Sukhumvit 45 Residences',
  buildingName: 'Tower A',
};

describe('projectStore (the site worker’s active project)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProjectStore.setState({ active: null });
  });

  it('starts with nothing chosen, which is what sends the worker to the picker', () => {
    expect(useProjectStore.getState().active).toBeNull();
  });

  it('select() sets the project and remembers it across launches', async () => {
    await useProjectStore.getState().select(SKYLINE);
    expect(useProjectStore.getState().active).toEqual(SKYLINE);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'cos_active_project',
      JSON.stringify(SKYLINE),
    );
  });

  it('hydrate() restores what was remembered', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(SKYLINE));
    await useProjectStore.getState().hydrate();
    expect(useProjectStore.getState().active).toEqual(SKYLINE);
  });

  it('hydrate() leaves the choice unmade when nothing was stored', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);
    await useProjectStore.getState().hydrate();
    expect(useProjectStore.getState().active).toBeNull();
  });

  it('keeps a project with no building — not every site has one recorded', async () => {
    const noBuilding = { ...SKYLINE, buildingName: null };
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(noBuilding));
    await useProjectStore.getState().hydrate();
    expect(useProjectStore.getState().active).toEqual(noBuilding);
  });

  it('drops a stored building that is not a string, rather than printing it', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({ ...SKYLINE, buildingName: 42 }),
    );
    await useProjectStore.getState().hydrate();
    expect(useProjectStore.getState().active?.buildingName).toBeNull();
  });

  it('starts clean rather than throwing when storage holds something unreadable', async () => {
    // A build that changed this shape must not brick the launch: no project chosen sends the worker
    // through the picker, which is a working app.
    for (const junk of [
      'not json',
      '"a string"',
      'null',
      '{}',
      JSON.stringify({ projectId: '' }),
    ]) {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(junk);
      useProjectStore.setState({ active: null });
      await useProjectStore.getState().hydrate();
      expect(useProjectStore.getState().active).toBeNull();
    }
  });

  it('hydrate() does not wipe a choice already made in this session', async () => {
    useProjectStore.setState({ active: SKYLINE });
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null);
    await useProjectStore.getState().hydrate();
    expect(useProjectStore.getState().active).toEqual(SKYLINE);
  });

  it('clear() forgets it, so the next person on the handset picks their own', async () => {
    useProjectStore.setState({ active: SKYLINE });
    await useProjectStore.getState().clear();
    expect(useProjectStore.getState().active).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('cos_active_project');
  });
});
