import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ScanScreen from "../screens/ScanScreen";
import ProductScreen from "../screens/ProductScreen";

export type ProductTabKey = "Health" | "Additives" | "Allergens" | "Diet" | "Eco";

export type ScanStackParamList = {
  ScanHome: undefined;
  Product: { barcode: string; initialTab?: ProductTabKey };
};

const Stack = createNativeStackNavigator<ScanStackParamList>();

export default function ScanStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#0b0f14" },
        headerTintColor: "white",
        contentStyle: { backgroundColor: "#0b0f14" },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="ScanHome" component={ScanScreen} options={{ title: "Scan" }} />
      <Stack.Screen name="Product" component={ProductScreen} options={{ title: "Product" }} />
    </Stack.Navigator>
  );
}

