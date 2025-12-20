import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import RoutineScreen from "../screens/RoutineScreen";
import InteractionCheckScreen from "../screens/InteractionCheckScreen";

export type RoutineStackParamList = {
  RoutineHome: undefined;
  InteractionCheck: undefined;
};

const Stack = createNativeStackNavigator<RoutineStackParamList>();

export default function RoutineStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#0b0f14" },
        headerTintColor: "#e5e7eb",
        contentStyle: { backgroundColor: "#0b0f14" },
      }}
    >
      <Stack.Screen name="RoutineHome" component={RoutineScreen} options={{ title: "Routine" }} />
      <Stack.Screen
        name="InteractionCheck"
        component={InteractionCheckScreen}
        options={{ title: "Interaction check" }}
      />
    </Stack.Navigator>
  );
}
