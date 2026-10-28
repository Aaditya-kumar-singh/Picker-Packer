import { createContext, forwardRef, useContext, type ComponentRef } from "react";
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextProps,
  type TextInputProps,
  type TextStyle,
} from "react-native";

const FontContext = createContext({ family: "Poppins", weight: "400" });

function fontStyle(style: TextStyle, inherited: { family: string; weight: string }) {
  const family = style.fontFamily ?? inherited.family;
  const weight = String(style.fontWeight ?? inherited.weight);
  if (family !== "Poppins" && family !== "OpenSans") {
    return { family, weight, resolved: { fontFamily: family, fontWeight: style.fontWeight } };
  }
  const numericWeight = weight === "bold" ? 700 : weight === "normal" ? 400 : Number(weight);
  const clampedWeight = family === "OpenSans"
    ? Math.max(600, Math.min(800, numericWeight))
    : Math.max(300, Math.min(700, numericWeight));
  return {
    family,
    weight,
    // Select the actual font file instead of asking Android to synthesize bold.
    resolved: { fontFamily: `${family}${clampedWeight}`, fontWeight: "normal" as const, includeFontPadding: false },
  };
}

/** All application text shares the same body/heading fonts, including nested text. */
export const Text = forwardRef<ComponentRef<typeof NativeText>, TextProps>(function Text({ style, ...props }, ref) {
  const inherited = useContext(FontContext);
  const font = fontStyle(StyleSheet.flatten(style) ?? {}, inherited);
  return (
    <FontContext.Provider value={{ family: font.family, weight: font.weight }}>
      <NativeText {...props} ref={ref} style={[style, font.resolved]} />
    </FontContext.Provider>
  );
});

// Preserve the native input instance type for focus() and measureInWindow().
export type TextInput = ComponentRef<typeof NativeTextInput>;
export const TextInput = forwardRef<TextInput, TextInputProps>(function TextInput({ style, ...props }, ref) {
  const font = fontStyle(StyleSheet.flatten(style) ?? {}, { family: "Poppins", weight: "400" });
  return <NativeTextInput {...props} ref={ref} style={[style, font.resolved]} />;
});
