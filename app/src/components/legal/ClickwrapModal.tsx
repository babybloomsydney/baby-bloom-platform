'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ConsentCheckboxGroup } from './ConsentCheckboxGroup';
import { recordConsent, recordInformedAction } from '@/lib/legal/record-consent';
import type { CheckpointConfig, AgreementId } from '@/lib/legal/types';
import { Loader2 } from 'lucide-react';

interface ClickwrapModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  checkpoints: CheckpointConfig[];
  buttonText: string;
  agreementId: AgreementId;
  onConfirm: () => void | Promise<void>;
  relatedEntityId?: string;
  loading?: boolean;
  /** Reminder section heading */
  reminderTitle?: string;
  /** Reminder bullet points displayed as readable text (not checkboxes) */
  reminderItems?: string[];
  /** Footer text below reminder items */
  reminderFooter?: string;
  /** Disclosure text shown above the button (for informed action modals with no checkboxes) */
  disclosureText?: string;
  /** "What happens next" text shown below the action button */
  footerText?: string;
  /** Version identifier for the modal content displayed */
  modalContentVersion?: string;
}

export function ClickwrapModal({
  open,
  onClose,
  title,
  subtitle,
  checkpoints,
  buttonText,
  agreementId,
  onConfirm,
  relatedEntityId,
  loading: externalLoading = false,
  reminderTitle,
  reminderItems,
  reminderFooter,
  disclosureText,
  footerText,
  modalContentVersion,
}: ClickwrapModalProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [recording, setRecording] = useState(false);

  const hasCheckpoints = checkpoints.length > 0;
  const allChecked = hasCheckpoints ? checkpoints.every((cp) => checked[cp.id]) : true;
  const isLoading = recording || externalLoading;

  const handleChange = (id: string, value: boolean) => {
    setChecked((prev) => ({ ...prev, [id]: value }));
  };

  const handleConfirm = async () => {
    if (hasCheckpoints && !allChecked) return;
    setRecording(true);

    if (hasCheckpoints) {
      const consentInputs = checkpoints.map((cp) => ({
        agreementId,
        checkpointId: cp.id,
        checkpointText: cp.text,
      }));

      const result = await recordConsent(consentInputs, relatedEntityId, modalContentVersion);
      if (result.success) {
        await onConfirm();
      }
    } else {
      const result = await recordInformedAction({
        agreementId,
        buttonText,
        modalContentVersion: modalContentVersion || '',
        relatedEntityId,
      });
      if (result.success) {
        await onConfirm();
      }
    }

    setRecording(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setChecked({});
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>

        {/* Reminder text section (displayed as readable text, NOT checkboxes) */}
        {reminderItems && reminderItems.length > 0 && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
            {reminderTitle && (
              <p className="text-sm font-semibold text-slate-700 mb-2">{reminderTitle}</p>
            )}
            <ul className="space-y-2">
              {reminderItems.map((item, i) => (
                <li key={i} className="flex gap-2 text-xs text-slate-600 leading-relaxed">
                  <span className="text-slate-400 shrink-0 mt-0.5">&bull;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {reminderFooter && (
              <p className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-200 italic">
                {reminderFooter}
              </p>
            )}
          </div>
        )}

        {/* Checkboxes (only when checkpoints exist) */}
        {hasCheckpoints && (
          <div className="py-2">
            <ConsentCheckboxGroup
              checkpoints={checkpoints}
              checked={checked}
              onChange={handleChange}
            />
          </div>
        )}

        {/* Disclosure text (for informed action modals with no checkboxes) */}
        {!hasCheckpoints && disclosureText && (
          <p className="text-sm text-slate-700 bg-violet-50 border border-violet-200 rounded-lg px-4 py-3">
            {disclosureText}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
            disabled={(hasCheckpoints && !allChecked) || isLoading}
            onClick={handleConfirm}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              buttonText
            )}
          </Button>
        </div>

        {footerText && (
          <p className="text-xs text-slate-400 text-center pt-1">{footerText}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
