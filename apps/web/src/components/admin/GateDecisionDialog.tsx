'use client';

/**
 * Approve / Abort for a provisioning run waiting at the data-migration gate (§34.5).
 *
 * Both ask for the justification §6.7 makes mandatory, and both say what the decision DOES before it
 * is taken: approve migrates the tenant's data, abort deletes the RDS instance the run created. The
 * drawing's banner fires them from bare buttons; a decision that deletes infrastructure does not get
 * to be one click (ADR-085 — composition).
 *
 * A modal dialog (react-aria-components) so focus is trapped and returned, and Escape closes it.
 */

import { adminJustificationSchema } from '@cos/schemas';
import { useState } from 'react';
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useT } from '../../i18n';
import { TextInputField } from '../form/TextInputField';
import { LoadingState } from '../ui/LoadingState';

export interface GateDecisionDialogProps {
  decision: 'approve' | 'abort';
  tenantCode: string;
  isOpen: boolean;
  isPending: boolean;
  /** Pre-translated message from the last failed attempt, if any. */
  errorMessage?: string;
  onClose: () => void;
  onConfirm: (justification: string) => void;
}

export function GateDecisionDialog({
  decision,
  tenantCode,
  isOpen,
  isPending,
  errorMessage,
  onClose,
  onConfirm,
}: GateDecisionDialogProps) {
  const t = useT();
  const [justification, setJustification] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const abort = decision === 'abort';

  const submit = () => {
    const parsed = adminJustificationSchema.safeParse({ justification });
    if (!parsed.success) {
      setFieldError(t(parsed.error.issues[0]?.message ?? 'validation.required'));
      return;
    }
    setFieldError(undefined);
    onConfirm(parsed.data.justification);
  };

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => (open ? undefined : onClose())}
      isDismissable={!isPending}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <Modal className="w-full max-w-lg rounded-lg border border-cos-dark-outline bg-cos-dark-container p-6 text-cos-dark-text">
        <Dialog className="flex flex-col gap-4 outline-none">
          <Heading slot="title" className="text-h2">
            {t(abort ? 'admin.decision.abortTitle' : 'admin.decision.approveTitle')}
            <span className="ml-2 font-mono text-body text-cos-dark-cyan">{tenantCode}</span>
          </Heading>
          <p className={`text-body ${abort ? 'text-cos-dark-danger' : 'text-cos-dark-muted'}`}>
            {t(abort ? 'admin.decision.abortBody' : 'admin.decision.approveBody')}
          </p>
          <TextInputField
            tone="dark"
            multiline
            rows={3}
            label={t('admin.justification.label')}
            description={t('admin.justification.help')}
            value={justification}
            onChange={setJustification}
            errorMessage={fieldError}
            isDisabled={isPending}
          />
          {errorMessage ? (
            <p role="alert" className="text-small text-cos-dark-danger">
              {errorMessage}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <Button
              onPress={onClose}
              isDisabled={isPending}
              className="rounded border border-cos-dark-outline px-4 py-2 text-small font-medium text-cos-dark-text hover:bg-cos-dark-container-high disabled:opacity-50"
            >
              {t('admin.decision.cancel')}
            </Button>
            <Button
              onPress={submit}
              isDisabled={isPending}
              className={`flex items-center gap-2 rounded px-4 py-2 text-small font-semibold text-white disabled:opacity-50 ${
                abort ? 'bg-cos-dark-danger' : 'bg-cos-blue'
              }`}
            >
              {isPending ? <LoadingState variant="micro" /> : null}
              {t(abort ? 'admin.decision.confirmAbort' : 'admin.decision.confirmApprove')}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
