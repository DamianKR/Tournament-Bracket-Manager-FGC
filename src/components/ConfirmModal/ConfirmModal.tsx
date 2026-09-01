import { useState } from 'react';
import './ConfirmModal.css';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [processing, setProcessing] = useState(false);

  if (!isOpen) return null;

  async function handleConfirm() {
    if (processing) return;
    setProcessing(true);
    try {
      await onConfirm();
    } catch (err) {
      console.error('[ConfirmModal] Error in onConfirm:', err);
    } finally {
      setProcessing(false);
    }
  }

  function handleCancel() {
    if (processing) return;
    onCancel();
  }

  return (
    <div className="confirm-overlay" onClick={handleCancel}>
      <div className="confirm-modal card" onClick={(e) => e.stopPropagation()}>
        <h3 className="confirm-title">{title}</h3>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="btn-outline" onClick={handleCancel} disabled={processing}>
            {cancelText}
          </button>
          <button className="btn-danger" onClick={handleConfirm} disabled={processing}>
            {processing ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
