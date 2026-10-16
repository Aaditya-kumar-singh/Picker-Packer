import { Text, TextInput } from "@/components/Typography";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/navigation/AppProvider";

const features: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string; bg: string }[] = [
  { icon: "cube", label: "Pick\nOrders", color: "#f58012", bg: "#ffead7" },
  { icon: "cube-outline", label: "Pack\nItems", color: "#058bd4", bg: "#d9effd" },
  { icon: "car-outline", label: "Dispatch\nFaster", color: "#09b974", bg: "#d7f7e8" },
  { icon: "stats-chart", label: "Real-time\nTracking", color: "#6636df", bg: "#e8defe" },
];

export function LoginScreen() {
  const { loginWithPassword, requestOtp, loading, error } = useAuth();
  const { height, width } = useWindowDimensions();
  // Android can shrink the window for the keyboard. Keep the page's original layout.
  const fullHeight = useRef(height);
  fullHeight.current = Math.max(fullHeight.current, height);
  const insets = useSafeAreaInsets();
  const availableHeight = fullHeight.current - insets.top - insets.bottom;
  const compact = availableHeight < 850;
  const tiny = availableHeight < 620;
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [measuredViewportHeight, setMeasuredViewportHeight] = useState(availableHeight);
  const scroll = useRef<ScrollView>(null);
  const cardTop = useRef(0);
  const cardHeight = useRef(0);
  const viewportHeight = useRef(availableHeight);
  const keyboardTop = useRef<number | null>(null);
  const passwordInput = useRef<TextInput>(null);
  const keyboardVisible = keyboardHeight > 0 || fullHeight.current - height > 100;
  // Some Android keyboards overlay the window instead of resizing it. Add only
  // the missing inset, so scrollTo has room to reveal the full form in either mode.
  const resizedBy = Math.max(0, availableHeight - measuredViewportHeight);
  const keyboardInset = Math.max(0, keyboardHeight - resizedBy);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [requestingOtp, setRequestingOtp] = useState(false);
  const busy = loading || requestingOtp;
  const showBrand = true;
  const showFeatures = availableHeight >= 720;
  const brandHeight = compact ? 110 : 160;
  const cardStart = Math.min(availableHeight * 0.3,
    availableHeight - (compact ? 430 : 470) - (showFeatures ? (compact ? 99 : 116) : 0) - 12);
  const cardDrop = Math.max(8, cardStart - brandHeight - (compact ? 8 : 18));

  const revealForm = useCallback(() => {
    const visibleHeight = Math.min(viewportHeight.current,
      keyboardTop.current === null ? viewportHeight.current : keyboardTop.current - insets.top);
    const overlap = Math.max(0, cardTop.current + cardHeight.current + 12 - visibleHeight);
    // Move only by the overlap; keep the card title visible if the keyboard is tall.
    const offset = Math.min(Math.max(0, cardTop.current - 8), overlap);
    scroll.current?.scrollTo({ y: offset, animated: true });
  }, [insets.top]);

  useEffect(() => {
    const shown = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hidden = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => {
      keyboardTop.current = null;
      setKeyboardHeight(0);
      scroll.current?.scrollTo({ y: 0, animated: true });
    });
    return () => { shown.remove(); hidden.remove(); };
  }, []);

  useEffect(() => {
    if (!keyboardVisible) return;
    const frame = requestAnimationFrame(revealForm);
    return () => cancelAnimationFrame(frame);
  }, [keyboardVisible, keyboardHeight, keyboardInset, revealForm]);

  async function onContinue() {
    if (!identifier.trim() || !password.trim()) {
      setLocalError("Enter your identifier and password.");
      return;
    }
    Keyboard.dismiss();
    setLocalError(null);
    const success = await loginWithPassword(identifier.trim(), password, rememberMe);
    if (success) router.replace("/");
  }

  async function onOtpLogin() {
    if (!identifier.trim()) {
      setLocalError("Enter your mobile number or identifier to request an OTP.");
      return;
    }
    Keyboard.dismiss();
    setLocalError(null);
    setRequestingOtp(true);
    try {
      const res = await requestOtp(identifier.trim());
      if (res) {
        router.push({
          pathname: "/otp",
          params: {
            pickerId: identifier.trim(),
            expiresIn: String(res.expiresIn),
            masked: res.masked,

          },
        } as never);
      }
    } finally {
      setRequestingOtp(false);
    }
  }

  return (
    <View style={s.root}>
      <Image source={require("../../assets/images/warehouse-picker-background.jpg")} resizeMode="stretch" style={[s.background, { height: fullHeight.current }]} accessible={false} />
      <SafeAreaView style={s.safe}>
        <ScrollView
          ref={scroll}
          style={s.safe}
          scrollEnabled={keyboardVisible}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: keyboardVisible ? keyboardInset + 16 : 0 }}
          onContentSizeChange={() => { if (keyboardVisible) revealForm(); }}
          onLayout={(event) => {
            viewportHeight.current = event.nativeEvent.layout.height;
            setMeasuredViewportHeight(event.nativeEvent.layout.height);
            if (keyboardVisible) revealForm();
          }}
        >
        <View style={[s.content, compact && s.contentCompact, { flex: 0, flexShrink: 0, minHeight: availableHeight, maxWidth: Math.min(width, 540) }]}>
          {showBrand ? (
            <View style={[s.brand, { height: brandHeight }]}>
              <Image source={require("../../assets/images/ybm-app-mark.png")} resizeMode="contain" style={[s.logo, compact && s.logoCompact]} accessibilityLabel="YourBuildMart logo" />
              <Text style={[s.brandTitle, compact && s.brandTitleCompact]} numberOfLines={1} adjustsFontSizeToFit>WAREHOUSE</Text>
              <Text style={[s.brandSubtitle, compact && s.brandSubtitleCompact]}>Warehouse Execution System</Text>
              {!tiny ? <Text style={[s.tagline, compact && s.taglineCompact]}>Pick <Text style={s.dot}>•</Text> Pack <Text style={s.dot}>•</Text> Dispatch</Text> : null}
            </View>
          ) : null}

          <View onLayout={(event) => { cardTop.current = event.nativeEvent.layout.y; cardHeight.current = event.nativeEvent.layout.height; if (keyboardVisible) revealForm(); }} style={[s.card, compact && s.cardCompact, { marginTop: cardDrop }]}>
            <Text style={[s.headingTitle, compact && s.headingTitleCompact]}>Sign In</Text>
            <Text style={[s.headingDesc, compact && s.headingDescCompact]}>Enter your mobile number or identifier to start your shift</Text>

            <Text style={s.label}>Mobile Number / Identifier</Text>
            <View style={s.inputWrap}>
              <Ionicons name="person-outline" size={19} color="#7d8ca0" />
              <TextInput
                style={s.input}
                value={identifier}
                onChangeText={(value) => { setIdentifier(value); setLocalError(null); }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="default"
                textContentType="username"
                placeholder="Mobile number or staff identifier"
                placeholderTextColor="#9ca8b7"
                returnKeyType="next"
                onSubmitEditing={() => passwordInput.current?.focus()}
                submitBehavior="submit"
                editable={!busy}
              />
            </View>

            <Text style={[s.label, s.passwordLabel]}>Password</Text>
            <View style={s.inputWrap}>
              <Ionicons name="lock-closed-outline" size={19} color="#7d8ca0" />
              <TextInput
                ref={passwordInput}
                style={s.input}
                value={password}
                onChangeText={(value) => { setPassword(value); setLocalError(null); }}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPassword}
                textContentType="password"
                placeholder="Enter your shift password"
                placeholderTextColor="#9ca8b7"
                returnKeyType="go"
                onSubmitEditing={onContinue}
                editable={!busy}
              />
              <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? "Hide password" : "Show password"} onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={21} color="#64748b" />
              </Pressable>
            </View>

            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: rememberMe, disabled: busy }} accessibilityLabel="Remember me on this device" onPress={() => setRememberMe((value) => !value)} disabled={busy} style={s.rememberRow}>
              <View style={[s.checkbox, rememberMe && s.checkboxChecked]}>{rememberMe ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}</View>
              <Text style={s.rememberText}>Remember me</Text>
            </Pressable>

            <View style={s.errorSlot}>
              {localError || error ? <Text style={s.error} accessibilityRole="alert" numberOfLines={2}>{localError || error}</Text> : null}
            </View>

            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} onPress={onContinue} disabled={busy} style={({ pressed }) => [s.primaryButton, (pressed || busy) && s.buttonFaded]}>
              <Ionicons name="log-in-outline" size={19} color="#fff" />
              <Text style={s.primaryText}>{loading ? "Signing in…" : "LOG IN WITH PASSWORD"}</Text>
            </Pressable>
            <View style={s.divider}><View style={s.line} /><Text style={s.or}>OR</Text><View style={s.line} /></View>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} onPress={onOtpLogin} disabled={busy} style={({ pressed }) => [s.secondaryButton, (pressed || busy) && s.buttonFaded]}>
              <Ionicons name="phone-portrait-outline" size={18} color="#0875b4" />
              <Text style={s.secondaryText}>{requestingOtp ? "Sending OTP…" : "LOG IN WITH OTP"}</Text>
            </Pressable>
            <View style={s.security}><Ionicons name="shield-checkmark-outline" size={13} color="#748399" /><Text style={s.securityText}>Protected by YBM Enterprise Security</Text></View>
          </View>

          {showFeatures ? (
            <View style={[s.features, compact && s.featuresCompact]}>
              {features.map((feature, index) => (
                <View key={feature.label} style={s.feature}>
                  {index > 0 ? <View style={s.featureDivider} /> : null}
                  <View style={[s.featureIcon, compact && s.featureIconCompact, { backgroundColor: feature.bg }]}><Ionicons name={feature.icon} size={compact ? 20 : 24} color={feature.color} /></View>
                  <Text style={[s.featureLabel, compact && s.featureLabelCompact]}>{feature.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#e7f4fc" },
  background: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, width: "100%", height: "100%" },
  safe: { flex: 1 },
  content: { flex: 1, alignSelf: "center", width: "100%", paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, justifyContent: "flex-start" },
  contentCompact: { paddingTop: 8, paddingBottom: 4, paddingHorizontal: 16 },
  brand: { alignItems: "flex-start" },
  logo: { width: 64, height: 64, marginBottom: 6 },
  logoCompact: { width: 48, height: 48, marginBottom: 4 },
  brandTitle: { fontFamily: "OpenSans", color: "#08274e", fontSize: 25, fontWeight: "400", letterSpacing: -0.7 },
  brandTitleCompact: { fontSize: 20 },
  brandSubtitle: { color: "#6483a1", fontSize: 14, marginTop: 1 },
  brandSubtitleCompact: { fontSize: 11 },
  tagline: { color: "#6685a5", fontSize: 15, marginTop: 9 },
  taglineCompact: { fontSize: 12, marginTop: 4 },
  dot: { color: "#fa8412", fontWeight: "900" },
  card: { backgroundColor: "#fff", borderRadius: 23, paddingHorizontal: 20, paddingTop: 17, paddingBottom: 15, shadowColor: "#102a48", shadowOpacity: 0.13, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  cardCompact: { borderRadius: 20, paddingHorizontal: 16, paddingTop: 13, paddingBottom: 11 },
  headingTitle: { fontFamily: "OpenSans", color: "#0c2142", fontSize: 28, fontWeight: "800", letterSpacing: -0.7 },
  headingTitleCompact: { fontSize: 23 },
  headingDesc: { color: "#6d7d92", fontSize: 13, lineHeight: 18, marginBottom: 11 },
  headingDescCompact: { fontSize: 11, lineHeight: 15, marginBottom: 6 },
  label: { color: "#142544", fontSize: 12, fontWeight: "700", marginBottom: 4 },
  passwordLabel: { marginTop: 8 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 44, borderRadius: 11, borderWidth: 1.3, borderColor: "#d7e0e9", backgroundColor: "#fff", paddingHorizontal: 12 },
  input: { flex: 1, height: 42, paddingVertical: 0, color: "#0d254b", fontSize: 13 },
  rememberRow: { height: 33, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 8, marginTop: 4 },
  checkbox: { width: 19, height: 19, borderRadius: 5, borderWidth: 1.5, borderColor: "#8ca0b3", alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  checkboxChecked: { backgroundColor: "#087ab5", borderColor: "#087ab5" },
  rememberText: { fontSize: 12, color: "#142544", fontWeight: "600" },
  error: { color: "#a32121", fontSize: 11, lineHeight: 14, marginBottom: 3 },
  errorSlot: { height: 31, justifyContent: "center" },
  primaryButton: { height: 45, backgroundColor: "#0877b4", borderRadius: 11, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  primaryText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  secondaryButton: { height: 44, borderColor: "#86bcde", borderWidth: 1.5, backgroundColor: "#fff", borderRadius: 11, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  secondaryText: { color: "#0875b4", fontSize: 13, fontWeight: "800" },
  buttonFaded: { opacity: 0.58 },
  divider: { flexDirection: "row", alignItems: "center", gap: 9, height: 22 },
  line: { height: 1, backgroundColor: "#e1e8ef", flex: 1 },
  or: { color: "#8592a2", fontSize: 11, fontWeight: "600" },
  security: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 10 },
  securityText: { fontSize: 10, color: "#78869a" },
  features: { flexDirection: "row", minHeight: 80, marginTop: 28 },
  featuresCompact: { minHeight: 63, marginTop: 24 },
  feature: { flex: 1, alignItems: "center", justifyContent: "center" },
  featureDivider: { position: "absolute", left: 0, height: 45, width: 1, backgroundColor: "#cfdae5" },
  featureIcon: { width: 43, height: 43, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  featureIconCompact: { width: 32, height: 32, borderRadius: 16, marginBottom: 2 },
  featureLabel: { textAlign: "center", color: "#0d254b", fontSize: 11, lineHeight: 14, fontWeight: "600" },
  featureLabelCompact: { fontSize: 9, lineHeight: 11 },
});
