import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ScanScreen from "../screens/ScanScreen";
import ProductScreen from "../screens/ProductScreen";

export type ScanStackParamList = {
  Scan: undefined;
  Product: { barcode: string };
};

const Stack = createNativeStackNavigator<ScanStackParamList>();

export default function ScanStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#0b0f14" },
        headerTintColor: "white",
        contentStyle: { backgroundColor: "#0b0f14" },
      }}
    >
      <Stack.Screen name="Scan" component={ScanScreen} options={{ title: "Scan" }} />
      <Stack.Screen name="Product" component={ProductScreen} options={{ title: "Product" }} />
    </Stack.Navigator>
  );
}
