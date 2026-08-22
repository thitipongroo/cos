import { KafkaService } from '../services/kafka.service';

const mockPublish = jest.fn();
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('@cos/kafka', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    publish: mockPublish,
    disconnect: mockDisconnect,
  })),
}));

describe('KafkaService', () => {
  let svc: KafkaService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockPublish.mockResolvedValue(undefined);
    mockDisconnect.mockResolvedValue(undefined);
    svc = new KafkaService();
  });

  describe('connect', () => {
    it('calls producer.connect() on first call', async () => {
      await svc.connect();
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('is idempotent — does not reconnect if already connected', async () => {
      await svc.connect();
      await svc.connect();
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('publishFileUploaded', () => {
    it('publishes file.document.uploaded.v1 event', async () => {
      await svc.publishFileUploaded({
        tenantId: 'tid-1',
        actorId: 'uid-1',
        traceId: 'trace-1',
        payload: {
          file_id: 'fid-1',
          tenant_id: 'tid-1',
          entity_type: null,
          entity_id: null,
          mime_type: 'image/jpeg',
        },
      });
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: 'file.document.uploaded.v1', tenant_id: 'tid-1' }),
        expect.objectContaining({ traceId: 'trace-1' }),
      );
    });
  });

  describe('publishFileQuarantined', () => {
    it('publishes file.document.quarantined.v1 event', async () => {
      await svc.publishFileQuarantined({
        tenantId: 'tid-1',
        actorId: 'uid-1',
        traceId: 'trace-1',
        payload: { file_id: 'fid-1', tenant_id: 'tid-1', threat_type: 'Eicar' },
      });
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: 'file.document.quarantined.v1' }),
        expect.any(Object),
      );
    });
  });

  describe('disconnect', () => {
    it('calls producer.disconnect() and resets connected flag', async () => {
      await svc.connect();
      await svc.disconnect();
      expect(mockDisconnect).toHaveBeenCalledTimes(1);
      // After disconnect, connect() should be callable again
      await svc.connect();
      expect(mockConnect).toHaveBeenCalledTimes(2);
    });
  });
});
