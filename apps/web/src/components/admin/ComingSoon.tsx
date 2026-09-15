'use client';

/**
 * The SYSTEM_ADMIN panel's "coming soon" dialog (R19, product-owner decision D18, 2026-09-15). A control the Stitch
 * drawings draw but that has no process behind it — Refresh, SSH, Provisioning, New Job, Verify, rotate secrets and the
 * rest — is ENABLED and opens this dialog instead of being disabled: the mobile rule of 2026-09-08 (ADR-099 amendment),
 * applied to the panel.
 *
 * One dialog for the whole panel, rendered by <ComingSoonProvider /> inside <AdminShell />; a control calls
 * `useComingSoon()(label)` with the label it shows. This dialog is the only place the panel SAYS "coming soon" — a drawn
 * VALUE with no source is printed as drawn and marked COMING SOON in a code comment only (lib/adminDrawnFigures.ts).
 */

import { createContext, useCallback, useContext, useState } from 'react';
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { useI18n } from '../../i18n';
import { AdminIcon } from './AdminIcon';

type OpenComingSoon = (feature: string) => void;

const ComingSoonContext = createContext<OpenComingSoon>(() => undefined);

/** Open the "coming soon" dialog for a control, naming it by the label it shows. */
export function useComingSoon(): OpenComingSoon {
  return useContext(ComingSoonContext);
}

export function ComingSoonProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [feature, setFeature] = useState<string | null>(null);
  const open = useCallback<OpenComingSoon>((label) => setFeature(label), []);

  return (
    <ComingSoonContext.Provider value={open}>
      {children}
      <ModalOverlay
        isOpen={feature !== null}
        isDismissable
        onOpenChange={(isOpen) => {
          if (!isOpen) setFeature(null);
        }}
        data-admin-modal=""
        className="fixed inset-0 z-[60] flex items-center justify-center bg-cos-op-container-lowest/70 p-6 backdrop-blur-sm"
      >
        <Modal className="w-full max-w-md overflow-hidden rounded-lg border border-cos-op-outline-variant/60 bg-cos-op-container-low shadow-2xl">
          <Dialog className="outline-none" aria-label={t('admin.comingSoon.title')}>
            <div className="flex items-start gap-3 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-cos-op-secondary/30 bg-cos-op-secondary/10 text-cos-op-secondary">
                <AdminIcon name="schedule" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <Heading
                  slot="title"
                  className="text-op-label font-semibold text-cos-op-on-surface"
                >
                  {t('admin.comingSoon.title')}
                </Heading>
                <p className="mt-1 text-op-body text-cos-op-on-surface-variant">
                  <span className="font-semibold text-cos-op-on-surface">{feature}</span>{' '}
                  {t('admin.comingSoon.body')}
                </p>
              </div>
            </div>
            <div className="flex justify-end border-t border-cos-op-outline-variant/30 bg-cos-op-container px-5 py-3">
              <Button
                onPress={() => setFeature(null)}
                className="rounded-md bg-cos-op-primary-container px-4 py-1.5 text-op-label font-semibold text-cos-op-on-primary-container outline-none hover:brightness-110 data-[focus-visible]:ring-2 data-[focus-visible]:ring-cos-op-primary"
              >
                {t('admin.comingSoon.close')}
              </Button>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </ComingSoonContext.Provider>
  );
}
