"use client";

import React from "react";

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    retryCount: number;
}

const MAX_RETRIES = 3;

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null, retryCount: 0 };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        if (process.env.NODE_ENV !== "production") {
            console.error("ErrorBoundary caught:", error, errorInfo);
        }
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            const exhausted = this.state.retryCount >= MAX_RETRIES;

            return (
                <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
                    <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 max-w-md">
                        <h2 className="text-lg font-semibold text-destructive mb-2">Something went wrong</h2>
                        <p className="text-sm text-muted-foreground mb-4">
                            {this.state.error?.message || "An unexpected error occurred."}
                        </p>
                        {exhausted ? (
                            <button
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                            >
                                Reload Page
                            </button>
                        ) : (
                            <button
                                onClick={() => this.setState({ hasError: false, error: null, retryCount: this.state.retryCount + 1 })}
                                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                            >
                                Try Again
                            </button>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
