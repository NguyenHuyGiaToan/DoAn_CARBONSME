import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  message: string;
  title?: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

const ACCENT_COLORS: Record<ToastType, string> = {
  success: 'border-l-[#15803D]',
  error: 'border-l-[#ba1a1a]',
  warning: 'border-l-[#B45309]',
  info: 'border-l-[#18181B]',
};

const ICON_COLORS: Record<ToastType, string> = {
  success: 'text-[#15803D]',
  error: 'text-[#ba1a1a]',
  warning: 'text-[#B45309]',
  info: 'text-[#18181B]',
};

export function Toast({
  message,
  title,
  type = 'success',
  duration = 3000,
  onClose,
}: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onClose();
    }, duration);

    return () => window.clearTimeout(timer);
  }, [duration, onClose]);

  const Icon =
    type === 'success' ? CheckCircle2 : type === 'info' ? Info : AlertCircle;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] bg-[#FFFFFF] border border-[#E4E4E7] border-l-[3px] ${ACCENT_COLORS[type]} rounded-[4px] p-3 flex items-start gap-2.5`}
    >
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${ICON_COLORS[type]}`} />
      <div className="flex-1 min-w-0">
        {title && (
          <div className="text-[12px] font-semibold text-[#09090B] leading-tight mb-0.5">
            {title}
          </div>
        )}
        <p className="text-[12px] text-[#3F3F46] leading-snug break-words">
          {message}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng thông báo"
        className="text-[#71717A] hover:text-[#09090B] p-0.5 rounded-[4px] transition-colors shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

