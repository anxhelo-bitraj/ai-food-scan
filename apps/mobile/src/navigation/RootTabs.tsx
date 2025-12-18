import React from "react";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import ScanScreen from "../screens/ScanScreen";
import InsightsScreen from "../screens/InsightsScreen";
import HistoryScreen from "../screens/HistoryScreen";

export type RootTabParamList = {
  Scan: undefined;
  Insights: undefined;
  History: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export default function RootTabs() {
  return (
    <NavigationContainer theme={DarkTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: true,
          tabBarShowLabel: true,
          tabBarStyle: {
            backgroundColor: "#0b0f14",
            borderTopColor: "#1f2937",
          },
          tabBarActiveTintColor: "#93c5fd",
          tabBarInactiveTintColor: "#9ca3af",
          tabBarIcon: ({ color, size }) => {
            const icon =
              route.name === "Scan"
                ? "scan-outline"
                : route.name === "Insights"
                ? "sparkles-outline"
                : "time-outline";
            return <Ionicons name={icon as any} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Scan" component={ScanScreen} />
        <Tab.Screen name="Insights" component={InsightsScreen} />
        <Tab.Screen name="History" component={HistoryScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
