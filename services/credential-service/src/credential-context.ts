// COS credentials JSON-LD @context (ADR-067; CS-7). Defines the four credential types + their claim
// terms so custom fields survive JSON-LD processing (safe mode drops undefined terms). Registered in the
// document loader (offline, no HTTP fetch) — see vc-service.createDocumentLoader.
export const COS_CREDENTIALS_CONTEXT_URL = 'https://cos.dev/credentials/v1';

const NS = 'https://cos.dev/credentials#';

export const COS_CREDENTIALS_CONTEXT = {
  '@context': {
    '@version': 1.1,
    '@protected': true,
    // credential types
    ContractSignatureVC: `${NS}ContractSignatureVC`,
    LicenceVC: `${NS}LicenceVC`,
    EquipmentCertVC: `${NS}EquipmentCertVC`,
    TrainingRecordVC: `${NS}TrainingRecordVC`,
    // ContractSignatureVC claims
    documentHash: `${NS}documentHash`,
    contractId: `${NS}contractId`,
    signerParty: `${NS}signerParty`,
    // LicenceVC claims
    licenceNumber: `${NS}licenceNumber`,
    licenceType: `${NS}licenceType`,
    issuingAuthority: `${NS}issuingAuthority`,
    // EquipmentCertVC claims
    equipmentId: `${NS}equipmentId`,
    certificationType: `${NS}certificationType`,
    certifiedUntil: `${NS}certifiedUntil`,
    // TrainingRecordVC claims
    courseName: `${NS}courseName`,
    completedAt: `${NS}completedAt`,
    trainingProvider: `${NS}trainingProvider`,
  },
} as const;

export const CREDENTIAL_TYPES = {
  CONTRACT_SIGNATURE: 'ContractSignatureVC',
  LICENCE: 'LicenceVC',
  EQUIPMENT_CERT: 'EquipmentCertVC',
  TRAINING_RECORD: 'TrainingRecordVC',
} as const;
