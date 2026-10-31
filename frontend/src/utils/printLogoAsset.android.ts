import { Image } from "react-native";

export async function getPrintLogoSource(): Promise<string> {
  const source = Image.resolveAssetSource(require("../../assets/images/yourbuildmart-wordmark.png"));
  if (!source?.uri) throw new Error("Could not load the YourBuildMart logo for printing.");
  return source.uri;
}
