import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 border-4 border-red-600 rounded-full flex items-center justify-center mb-8 animate-pulse">
            <span className="text-red-600 text-4xl font-black">!</span>
          </div>
          <h1 className="text-white terminal-text text-2xl font-black tracking-widest uppercase mb-4">Neural Link Severed</h1>
          <p className="text-white/40 terminal-text text-xs uppercase mb-8 max-w-md">
            The tactical interface has encountered a critical synchronization failure.
            <br />
            Error: {this.state.error?.message || "Unknown System Fault"}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rhodes-button glow-blue px-12 py-4 bg-rhodes-blue text-black font-black terminal-text text-xs uppercase tracking-widest"
          >
            Reboot Terminal
          </button>
        </div>
      );
    }

    return this.children;
  }
}

export default ErrorBoundary;
