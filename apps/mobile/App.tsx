import "react-native-gesture-handler";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import RootTabs from "./src/navigation/RootTabs";

export default function App() {
  return (
    <SafeAreaProvider>
      <RootTabs />
    </SafeAreaProvider>
  );
}
