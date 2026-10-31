import { Asset } from "expo-asset";
import { File } from "expo-file-system";

let cachedDataUri: string | null = null;

export async function getPrintLogoSource(): Promise<string> {
  if (cachedDataUri) return cachedDataUri;
  const logoAsset = Asset.fromModule(require("../../assets/images/yourbuildmart-wordmark.png"));
  await logoAsset.downloadAsync();
  if (!logoAsset.localUri) throw new Error("Could not load the YourBuildMart logo for printing.");
  cachedDataUri = `data:image/png;base64,${await new File(logoAsset.localUri).base64()}`;
  return cachedDataUri;
}
