import { OtpScreen } from "@/screens/OtpScreen";
import { FULFILLMENT_OTP_LOGIN_ENABLED } from "@/config/auth";
import { Redirect } from "expo-router";

export default function Route() {
  return FULFILLMENT_OTP_LOGIN_ENABLED ? <OtpScreen /> : <Redirect href="/login" />;
}
