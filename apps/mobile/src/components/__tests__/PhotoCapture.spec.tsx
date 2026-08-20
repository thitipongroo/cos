// Behaviour of <PhotoCapture /> — the camera, the queue and the three chromes it wears.
//
// §17.7 CAPS THE PENDING QUEUE AT 100, warns at 80, and the cap is enforced BEFORE the shutter, not
// after: a photo taken and then refused is work the worker did for nothing, and on a site that means
// walking back to the thing they photographed. At the warning threshold the capture still happens —
// a warning that blocked would be a cap by another name.
//
// THE STRIP LAYOUT DOES NOT ASK FOR THE CAMERA ON MOUNT. The report form is not a live camera the
// whole time it is being filled in, and the thumbnails, delete and annotate all work without the
// permission — so the prompt comes when the UPLOAD tile is tapped, which is the moment the user
// invited it. The other two layouts DO need it up front, because their viewfinder is the screen.
//
// A CAPTURE IS A LOCAL ROW, PENDING. Nothing is uploaded here; the row is what the upload queue
// later finds, which is why a capture with no URI must write nothing rather than a row pointing at
// a file that does not exist.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { PhotoCapture } from '../PhotoCapture';

const mockInsert = jest.fn();
const mockTakePicture = jest.fn();
let mockGranted = true;
let mockPermissionLoaded = true;
let mockPending = 0;
let mockPhotos: unknown[] = [];

jest.mock('expo-camera', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { forwardRef, useImperativeHandle } = require('react') as typeof import('react');
  return {
    useCameraPermissions: () => [
      mockPermissionLoaded ? { granted: mockGranted } : null,
      jest.fn(() => Promise.resolve({ granted: mockGranted })),
    ],
    CameraView: forwardRef((props: Record<string, unknown>, ref: unknown) => {
      useImperativeHandle(ref as never, () => ({ takePictureAsync: mockTakePicture }));
      return <View {...props} />;
    }),
  };
});

// Mocked WHOLE, without requireActual: the real module opens a SQLite handle and runs its DDL at
// import time. Only the three things this component reaches for are needed.
jest.mock('../../db/database', () => ({
  db: {
    insert: () => ({ values: mockInsert }),
    select: () => ({ from: () => ({ where: () => ({}) }) }),
  },
  newLocalId: () => 'local-new',
  pendingPhotoCount: () => mockPending,
}));

// Spread the real module: `drizzle` itself is still needed by anything else that loads it.
jest.mock('drizzle-orm/expo-sqlite', () => ({
  ...jest.requireActual('drizzle-orm/expo-sqlite'),
  useLiveQuery: () => ({ data: mockPhotos }),
}));

jest.mock('../../db/photoRepo', () => ({
  getAnnotation: jest.fn(() => Promise.resolve(null)),
  upsertAnnotation: jest.fn(() => Promise.resolve()),
  reassignPhotoEntity: jest.fn(),
}));

function renderCapture(props: Record<string, unknown> = {}) {
  return render(
    <I18nProvider>
      <PhotoCapture entityType="issue" entityId="e-1" {...props} />
    </I18nProvider>,
  );
}

describe('PhotoCapture', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockInsert.mockResolvedValue(undefined);
    mockTakePicture.mockReset();
    mockTakePicture.mockResolvedValue({ uri: 'file:///photo.jpg' });
    mockGranted = true;
    mockPermissionLoaded = true;
    mockPending = 0;
    mockPhotos = [];
  });

  it('renders the capture surface once the permission is granted', async () => {
    const { getByTestId } = await renderCapture();

    expect(getByTestId('photo-capture')).toBeTruthy();
    expect(getByTestId('capture-photo-button')).toBeTruthy();
  });

  // Nothing is drawn while the permission answer is still in flight — a permission prompt that
  // flashes up and disappears is worse than a beat of nothing.
  it('draws nothing while the permission is still being read', async () => {
    mockPermissionLoaded = false;

    const { toJSON } = await renderCapture();

    expect(toJSON()).toBeNull();
  });

  it('offers to enable the camera when the permission was refused', async () => {
    mockGranted = false;

    const { getByTestId, queryByTestId } = await renderCapture();

    expect(getByTestId('photo-permission-button')).toBeTruthy();
    expect(queryByTestId('capture-photo-button')).toBeNull();
  });

  // THE STRIP IS DIFFERENT: a report form is not a live camera the whole time it is filled in.
  it('renders the strip without asking for the camera at all', async () => {
    mockGranted = false;
    mockPermissionLoaded = false;

    const { getByTestId, queryByTestId } = await renderCapture({ layout: 'strip' });

    expect(getByTestId('photo-strip')).toBeTruthy();
    expect(queryByTestId('photo-permission-button')).toBeNull();
  });

  it('writes a pending local row for a capture, not an upload', async () => {
    const { getByTestId } = await renderCapture();

    await fireEvent.press(getByTestId('capture-photo-button'));

    await waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(1));
    expect(mockInsert.mock.calls[0][0]).toMatchObject({
      entityType: 'issue',
      entityId: 'e-1',
      localPath: 'file:///photo.jpg',
      uploadStatus: 'PENDING',
      serverFileId: null,
    });
  });

  it('tells its caller how many have been taken', async () => {
    const onCaptured = jest.fn();

    const { getByTestId } = await renderCapture({ onCaptured });

    await fireEvent.press(getByTestId('capture-photo-button'));

    await waitFor(() => expect(onCaptured).toHaveBeenCalledWith(1));
  });

  // A row pointing at a file that does not exist is a row the upload queue retries forever.
  it('writes nothing when the camera returned no file', async () => {
    mockTakePicture.mockResolvedValue({ uri: undefined });

    const { getByTestId } = await renderCapture();

    await fireEvent.press(getByTestId('capture-photo-button'));

    await waitFor(() => expect(mockTakePicture).toHaveBeenCalled());
    expect(mockInsert).not.toHaveBeenCalled();
  });

  // §17.7 — BEFORE the shutter. A photo taken and then refused is a walk back to the subject.
  it('refuses the capture when the queue is full', async () => {
    mockPending = 100;

    const { getByTestId } = await renderCapture();

    await fireEvent.press(getByTestId('capture-photo-button'));

    await waitFor(() => expect(getByTestId('photo-queue-notice')).toBeTruthy());
    expect(mockTakePicture).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  // A warning that blocked would be a cap by another name.
  it('warns near the cap but still takes the photo', async () => {
    mockPending = 80;

    const { getByTestId } = await renderCapture();

    await fireEvent.press(getByTestId('capture-photo-button'));

    await waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(1));
    expect(getByTestId('photo-queue-notice')).toBeTruthy();
  });

  it('says nothing about the queue while it is comfortable', async () => {
    const { getByTestId, queryByTestId } = await renderCapture();

    await fireEvent.press(getByTestId('capture-photo-button'));

    await waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(1));
    expect(queryByTestId('photo-queue-notice')).toBeNull();
  });

  it('shows a thumbnail per photo already taken', async () => {
    mockPhotos = [
      { id: 'p-1', localPath: 'file:///a.jpg', uploadStatus: 'PENDING' },
      { id: 'p-2', localPath: 'file:///b.jpg', uploadStatus: 'UPLOADED' },
    ];

    const { getByTestId } = await renderCapture();

    expect(getByTestId('gallery-photo-p-1')).toBeTruthy();
    expect(getByTestId('gallery-photo-p-2')).toBeTruthy();
  });

  it('renders the viewfinder layout with its own shutter', async () => {
    const { getByTestId } = await renderCapture({ layout: 'viewfinder' });

    expect(getByTestId('photo-capture')).toBeTruthy();
    expect(getByTestId('capture-photo-button')).toBeTruthy();
  });
});
