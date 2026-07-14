/**
 * Top-level crash boundary.
 *
 * Catches render/lifecycle errors from anywhere in the tree and shows a generic
 * recovery screen instead of a white/red crash. It deliberately renders NO
 * error text — a raw message could echo a value the failing screen was showing,
 * and ReloGo never surfaces underlying errors that could reflect input. The
 * sanitized, non-PII diagnostic goes through `reportFatalError` (see
 * lib/errorReporting.ts), never to the UI.
 */
import { Component, type ReactNode } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { reportFatalError } from "@/lib/errorReporting";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    // Only a sanitized record leaves this method; the raw error is discarded.
    reportFatalError(error, "render-boundary");
  }

  handleReset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-8">
        <Text className="text-lg font-semibold text-slate-900">
          Something went wrong
        </Text>
        <Text className="mt-1 text-center text-sm text-slate-500">
          Your saved information on this device is unchanged. Please try again.
        </Text>
        <TouchableOpacity
          onPress={this.handleReset}
          className="mt-6 rounded-xl bg-blue-600 px-8 py-3.5"
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text className="text-base font-bold text-white">Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
