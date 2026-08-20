// Behaviour of the permit request form.
//
// Three rules here are about not making a claim nobody made.
//
// EMPTY STRINGS ARE DROPPED, not sent. `contractor_name: ''` stores a blank contractor, which is a
// different statement from "not recorded" — and on a permit, who the contractor is may be the whole
// point of the record.
//
// PHOTOS ARE RE-KEYED BEFORE NAVIGATING. Captures hang on a draft id until the permit is real; the
// upload queue can run the moment it sees those rows, and a photo uploaded under the draft id
// attaches to nothing. So the re-key has to finish before the screen leaves.
//
// A FAILURE IS INLINE, not an alert. The form and its draft photos stay exactly as they were, so
// the message belongs beside the button that is about to be pressed again.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import { useProjectStore } from '../../../store/projectStore';
import PermitRequestScreen from '../permit-request';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
}));

jest.mock('../../../api/safety', () => ({
  ...jest.requireActual('../../../api/safety'),
  createPermit: jest.fn(),
}));
jest.mock('../../../db/photoRepo', () => ({ reassignPhotoEntity: jest.fn() }));
// <PhotoCapture /> runs a live query and mounts a Skia canvas; neither is what this form's rules are.
jest.mock('../../../components/PhotoCapture', () => ({ PhotoCapture: () => null }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/safety') as { createPermit: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const photos = require('../../../db/photoRepo') as { reassignPhotoEntity: jest.Mock };

const PROJECT_ID = 'proj-1';

const CREATED = {
  permit_id: 'pm-1',
  permit_number: 'PN-001',
  permit_type: 'WORK_PERMIT',
  status: 'PENDING',
};

function renderScreen() {
  return render(
    <I18nProvider>
      <PermitRequestScreen />
    </I18nProvider>,
  );
}

describe('PermitRequestScreen', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    api.createPermit.mockReset();
    api.createPermit.mockResolvedValue(CREATED);
    photos.reassignPhotoEntity.mockReset();
    photos.reassignPhotoEntity.mockResolvedValue(undefined);
    useProjectStore.setState({
      active: { projectId: PROJECT_ID, projectName: 'Riverside Tower' },
    } as never);
  });

  it('opens with submit off until a permit number is entered', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('submit-permit-request').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(getByTestId('permit-number-input'), 'PN-001');

    await waitFor(() =>
      expect(getByTestId('submit-permit-request').props.accessibilityState.disabled).toBe(false),
    );
  });

  it('says a site must be chosen, and will not submit without one', async () => {
    useProjectStore.setState({ active: null } as never);

    const { getByTestId } = await renderScreen();
    await fireEvent.changeText(getByTestId('permit-number-input'), 'PN-001');
    await fireEvent.press(getByTestId('submit-permit-request'));

    expect(getByTestId('permit-request-needs-project')).toBeTruthy();
    expect(api.createPermit).not.toHaveBeenCalled();
  });

  // The four optional fields are OMITTED when blank — see the note at the top of this file.
  it('sends only the fields that were filled in', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('permit-number-input'), '  PN-001  ');
    await fireEvent.press(getByTestId('submit-permit-request'));

    await waitFor(() => expect(api.createPermit).toHaveBeenCalledTimes(1));
    expect(api.createPermit.mock.calls[0][0]).toEqual({
      project_id: PROJECT_ID,
      permit_type: 'WORK_PERMIT',
      permit_number: 'PN-001',
    });
  });

  it('sends a contractor and a description once they are given', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('permit-number-input'), 'PN-001');
    await fireEvent.changeText(getByTestId('permit-contractor-input'), 'Sino-Thai');
    await fireEvent.changeText(getByTestId('permit-description-input'), 'Hot work, level 4');
    await fireEvent.press(getByTestId('submit-permit-request'));

    await waitFor(() => expect(api.createPermit).toHaveBeenCalledTimes(1));
    expect(api.createPermit.mock.calls[0][0]).toMatchObject({
      contractor_name: 'Sino-Thai',
      description: 'Hot work, level 4',
    });
  });

  it('carries the permit type that was chosen', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('permit-type-ENTRY_PERMIT'));
    await fireEvent.changeText(getByTestId('permit-number-input'), 'PN-001');
    await fireEvent.press(getByTestId('submit-permit-request'));

    await waitFor(() => expect(api.createPermit).toHaveBeenCalledTimes(1));
    expect(api.createPermit.mock.calls[0][0].permit_type).toBe('ENTRY_PERMIT');
  });

  it('offers both validity dates', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('permit-valid-from')).toBeTruthy();
    expect(getByTestId('permit-valid-until')).toBeTruthy();
  });

  // A photo uploaded under the draft id attaches to nothing, and the queue can run the moment it
  // sees the rows — so the re-key happens before the screen leaves.
  it('re-keys the draft photos onto the real permit before navigating', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('permit-number-input'), 'PN-001');
    await fireEvent.press(getByTestId('submit-permit-request'));

    await waitFor(() => expect(photos.reassignPhotoEntity).toHaveBeenCalledTimes(1));
    expect(photos.reassignPhotoEntity.mock.calls[0][1]).toBe('pm-1');
    expect(mockReplace).toHaveBeenCalled();
  });

  it('hands the receipt what the server actually created', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('permit-number-input'), 'PN-001');
    await fireEvent.press(getByTestId('submit-permit-request'));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/permit-submitted',
        params: { permitNumber: 'PN-001', permitType: 'WORK_PERMIT', status: 'PENDING' },
      }),
    );
  });

  // Inline, and the form survives — the draft photos are still hanging on the draft id.
  it('reports a failure beside the button and keeps the form', async () => {
    api.createPermit.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('permit-number-input'), 'PN-001');
    await fireEvent.press(getByTestId('submit-permit-request'));

    await waitFor(() => expect(getByTestId('permit-request-error')).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
    expect(getByTestId('permit-number-input').props.value).toBe('PN-001');
  });

  it('lets the request be retried after a failure', async () => {
    api.createPermit.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('permit-number-input'), 'PN-001');
    await fireEvent.press(getByTestId('submit-permit-request'));
    await waitFor(() => expect(getByTestId('permit-request-error')).toBeTruthy());

    expect(getByTestId('submit-permit-request').props.accessibilityState.disabled).toBe(false);
  });
});
