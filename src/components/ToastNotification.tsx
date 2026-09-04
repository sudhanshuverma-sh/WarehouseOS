import React from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export const ToastNotification: React.FC = () => {
  const { notification, setNotification } = useApp();

  if (!notification) return null;

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />,
    info: <Info className="w-5 h-5 text-indigo-500 shrink-0" />
  };

  const bgStyles = {
    success: 'bg-emerald-950/95 border-emerald-700 text-emerald-100',
    warning: 'bg-amber-950/95 border-amber-700 text-amber-100',
    error: 'bg-rose-950/95 border-rose-700 text-rose-100',
    info: 'bg-indigo-950/95 border-indigo-700 text-indigo-100'
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-md animate-in slide-in-from-bottom-5 fade-in duration-200">
      <div className={`p-4 rounded-xl border shadow-2xl backdrop-blur-md flex items-start gap-3 ${bgStyles[notification.type]}`}>
        {icons[notification.type]}
        <div className="flex-1 text-xs font-medium leading-relaxed">
          {notification.message}
        </div>
        <button
          onClick={() => setNotification(null)}
          className="text-slate-400 hover:text-white p-0.5 rounded transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
