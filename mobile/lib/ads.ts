import { Platform } from "react-native";
import { InterstitialAd, RewardedAd, TestIds, AdEventType } from "react-native-google-mobile-ads";

const INTERSTITIAL_ID = Platform.select({
  ios: TestIds.INTERSTITIAL,
  android: TestIds.INTERSTITIAL,
})!;

const REWARDED_ID = Platform.select({
  ios: TestIds.REWARDED,
  android: TestIds.REWARDED,
})!;

let interstitial: InterstitialAd | null = null;
let rewarded: RewardedAd | null = null;

function createInterstitial(): InterstitialAd {
  const ad = InterstitialAd.createForAdRequest(INTERSTITIAL_ID);
  ad.addAdEventListener(AdEventType.ERROR, () => {});
  return ad;
}

function createRewarded(): RewardedAd {
  const ad = RewardedAd.createForAdRequest(REWARDED_ID);
  ad.addAdEventListener(AdEventType.ERROR, () => {});
  return ad;
}

export async function showInterstitial(): Promise<void> {
  if (!interstitial || !interstitial.loaded) {
    interstitial = createInterstitial();
    interstitial.load();
    return;
  }
  try {
    await interstitial.show();
  } catch {}
  interstitial = createInterstitial();
  interstitial.load();
}

export async function showRewarded(): Promise<boolean> {
  if (!rewarded || !rewarded.loaded) {
    rewarded = createRewarded();
    rewarded.load();
    return false;
  }
  return new Promise((resolve) => {
    const onEarned = () => { resolve(true); cleanup(); };
    const onClosed = () => { resolve(false); cleanup(); };
    const onError = () => { resolve(false); cleanup(); };
    const cleanup = () => {
      rewarded?.removeAllListeners();
      rewarded = createRewarded();
      rewarded.load();
    };
    rewarded!.addAdEventListener(AdEventType.REWARDED, onEarned);
    rewarded!.addAdEventListener(AdEventType.CLOSED, onClosed);
    rewarded!.addAdEventListener(AdEventType.ERROR, onError);
    rewarded!.show().catch(() => { resolve(false); cleanup(); });
  });
}
