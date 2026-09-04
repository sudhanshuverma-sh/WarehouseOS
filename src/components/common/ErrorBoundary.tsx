import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[300px] flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl border border-rose-200 p-6 sm:p-8 max-w-lg w-full text-center shadow-lg space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-14 h-14 bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
              <AlertTriangle className="w-7 h-7" />
            </div>
            
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900">
                {this.props.fallbackTitle || 'Component Encountered an Issue'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                A rendering exception occurred in this module. You can reload this section or return to the main dashboard.
              </p>
              {this.state.error?.message && (
                <div className="mt-3 p-2.5 bg-rose-50/70 border border-rose-100 rounded-xl text-left font-mono text-[11px] text-rose-800 break-all">
                  {this.state.error.message}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Component</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.reload();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Reload Page</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
