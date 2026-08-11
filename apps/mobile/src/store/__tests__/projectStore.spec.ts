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
    useProjectStore.setState({ active: null, pickerOpen: false });
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

  describe('the picker overlay', () => {
    // The sheet is opened from the context bar on every screen AND from inside the quick-actions
    // overlay, and is forced open by the shell when no site is chosen. Those three share no parent
    // but this store, which is why the flag lives here rather than in a screen.
    it('starts closed — the shell forces it open from `active` being null, not from this', () => {
      expect(useProjectStore.getState().pickerOpen).toBe(false);
    });

    it('openPicker() raises it and closePicker() drops it', () => {
      useProjectStore.getState().openPicker();
      expect(useProjectStore.getState().pickerOpen).toBe(true);
      useProjectStore.getState().closePicker();
      expect(useProjectStore.getState().pickerOpen).toBe(false);
    });

    it('closing mid-session KEEPS the site already chosen', async () => {
      // The whole point of the dismissible case: closing is "never mind", not "choose nothing".
      await useProjectStore.getState().select(SKYLINE);
      useProjectStore.getState().openPicker();
      useProjectStore.getState().closePicker();
      expect(useProjectStore.getState().active).toEqual(SKYLINE);
    });

    it('choosing closes it — the sheet asked one question and has its answer', async () => {
      useProjectStore.getState().openPicker();
      await useProjectStore.getState().select(SKYLINE);
      expect(useProjectStore.getState().pickerOpen).toBe(false);
    });

    it('clear() closes it too, so signing out does not leave a sheet over the login', async () => {
      useProjectStore.setState({ active: SKYLINE, pickerOpen: true });
      await useProjectStore.getState().clear();
      expect(useProjectStore.getState().pickerOpen).toBe(false);
    });
  });

  it('clear() forgets it, so the next person on the handset picks their own', async () => {
    useProjectStore.setState({ active: SKYLINE });
    await useProjectStore.getState().clear();
    expect(useProjectStore.getState().active).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('cos_active_project');
  });
});
