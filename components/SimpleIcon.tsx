import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { TextStyle } from "react-native";

interface SimpleIconProps {
  name: string;
  size?: number;
  color?: string;
  style?: TextStyle;
}

export default function SimpleIcon({
  name,
  size = 24,
  color = "#000",
  style,
}: SimpleIconProps) {
  return (
    <Ionicons 
      name={name as any} 
      size={size} 
      color={color} 
      style={style}
    />
  );
}
