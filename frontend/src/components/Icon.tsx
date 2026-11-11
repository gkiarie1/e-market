import React from "react";
import { View, StyleSheet } from "react-native";
import { colors } from "../theme";
export type IconName =
  | "home"
  | "plus"
  | "chart"
  | "message"
  | "cart"
  | "history"
  | "bell"
  | "logout"
  | "account";
export default function Icon({
  name,
  color = colors.brown,
}: {
  name: IconName;
  color?: string;
}) {
  const line = { borderColor: color };
  return (
    <View accessibilityElementsHidden style={s.frame}>
      {name === "account" && (
        <>
          <View
            style={{
              position: "absolute",
              top: 2,
              left: 10,
              width: 11,
              height: 11,
              borderRadius: 6,
              borderWidth: 1.7,
              borderColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              bottom: 1,
              left: 4,
              width: 23,
              height: 11,
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderWidth: 1.7,
              borderColor: color,
            }}
          />
        </>
      )}
      {name === "logout" && (
        <>
          <View
            style={{
              position: "absolute",
              left: 4,
              top: 3,
              width: 12,
              height: 22,
              borderWidth: 1.7,
              borderRightWidth: 0,
              borderRadius: 3,
              borderColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: 12,
              top: 13,
              width: 15,
              height: 1.7,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              right: 3,
              top: 9,
              width: 9,
              height: 9,
              borderRightWidth: 1.7,
              borderTopWidth: 1.7,
              borderColor: color,
              transform: [{ rotate: "45deg" }],
            }}
          />
        </>
      )}
      {name === "home" && (
        <>
          <View style={[s.roof, line]} />
          <View style={[s.house, line]} />
          <View style={[s.door, line]} />
        </>
      )}
      {name === "plus" && (
        <>
          <View style={[s.horizontal, { backgroundColor: color }]} />
          <View style={[s.vertical, { backgroundColor: color }]} />
        </>
      )}
      {name === "chart" && (
        <>
          {[8, 15, 21].map((h, i) => (
            <View
              key={h}
              style={{
                position: "absolute",
                left: 3 + i * 8,
                bottom: 2,
                height: h,
                width: 4,
                borderRadius: 2,
                backgroundColor: color,
              }}
            />
          ))}
        </>
      )}
      {name === "message" && (
        <>
          <View style={[s.message, line]} />
          <View style={[s.tail, line]} />
          {[7, 13, 19].map((left) => (
            <View
              key={left}
              style={{
                position: "absolute",
                top: 11,
                left,
                width: 2,
                height: 2,
                borderRadius: 1,
                backgroundColor: color,
              }}
            />
          ))}
        </>
      )}
      {name === "cart" && (
        <>
          <View style={[s.basket, line]} />
          <View style={[s.handle, line]} />
          {[7, 21].map((left) => (
            <View
              key={left}
              style={{
                position: "absolute",
                bottom: 1,
                left,
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: color,
              }}
            />
          ))}
        </>
      )}
      {name === "history" && (
        <>
          <View style={[s.page, line]} />
          {[8, 13, 18].map((top) => (
            <View
              key={top}
              style={{
                position: "absolute",
                top,
                left: 9,
                width: 10,
                height: 1.5,
                backgroundColor: color,
              }}
            />
          ))}
        </>
      )}
      {name === "bell" && (
        <>
          <View style={[s.bell, line]} />
          <View
            style={{
              position: "absolute",
              left: 5,
              bottom: 6,
              width: 20,
              height: 2,
              borderRadius: 1,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: 13,
              bottom: 2,
              width: 4,
              height: 3,
              borderRadius: 2,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: 14,
              top: 1,
              width: 2,
              height: 3,
              backgroundColor: color,
            }}
          />
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  frame: { width: 30, height: 28 },
  roof: {
    position: "absolute",
    width: 16,
    height: 16,
    borderTopWidth: 1.8,
    borderLeftWidth: 1.8,
    transform: [{ rotate: "45deg" }],
    top: 3,
    left: 7,
  },
  house: {
    position: "absolute",
    width: 19,
    height: 15,
    borderWidth: 1.8,
    borderTopWidth: 0,
    left: 6,
    bottom: 1,
    borderRadius: 2,
  },
  door: {
    position: "absolute",
    width: 6,
    height: 10,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    left: 12,
    bottom: 1,
  },
  horizontal: {
    position: "absolute",
    left: 5,
    top: 13,
    width: 20,
    height: 2,
    borderRadius: 1,
  },
  vertical: {
    position: "absolute",
    left: 14,
    top: 4,
    width: 2,
    height: 20,
    borderRadius: 1,
  },
  message: {
    position: "absolute",
    left: 3,
    top: 3,
    width: 25,
    height: 19,
    borderWidth: 1.7,
    borderRadius: 6,
  },
  tail: {
    position: "absolute",
    left: 7,
    top: 19,
    height: 7,
    width: 6,
    borderLeftWidth: 1.7,
    transform: [{ skewY: "-35deg" }],
  },
  basket: {
    position: "absolute",
    left: 5,
    top: 6,
    width: 23,
    height: 14,
    borderWidth: 1.7,
    borderRadius: 3,
    transform: [{ skewX: "-8deg" }],
  },
  handle: {
    position: "absolute",
    left: 1,
    top: 3,
    width: 6,
    height: 2,
    borderTopWidth: 1.7,
  },
  page: {
    position: "absolute",
    left: 5,
    top: 2,
    width: 20,
    height: 25,
    borderWidth: 1.7,
    borderRadius: 3,
  },
  bell: {
    position: "absolute",
    left: 7,
    top: 4,
    width: 16,
    height: 18,
    borderWidth: 1.7,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
});
