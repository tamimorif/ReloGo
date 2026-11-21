import AsyncStorage from "@react-native-async-storage/async-storage";
import { PROVINCES, type Province, type TaskStatus } from "@/types/database";

const JOURNEY_KEY = "relogo.journey.v1";
const PROGRESS_KEY_PREFIX = "relogo.progress.v1";
const pendingProgressWrites = new Map<string, Promise<void>>();

export type LocalJourney = {
  originCity: string;
  originProvince: Province;
  destinationCity: string;
  destinationProvince: Province;
  hasVehicle: boolean | null;
  hasSchoolAgeChildren: boolean | null;
  consentVersion: string;
};

function progressKey(origin: Province, destination: Province): string {
  return `${PROGRESS_KEY_PREFIX}:${origin}:${destination}`;
}

function isLocalJourney(value: unknown): value is LocalJourney {
  if (!value || typeof value !== "object") return false;
  const journey = value as Partial<LocalJourney>;
  return (
    typeof journey.originCity === "string" &&
    journey.originCity.trim().length > 0 &&
    typeof journey.destinationCity === "string" &&
    journey.destinationCity.trim().length > 0 &&
    PROVINCES.includes(journey.originProvince as Province) &&
    PROVINCES.includes(journey.destinationProvince as Province) &&
    typeof journey.consentVersion === "string"
  );
}

export async function loadLocalJourney(): Promise<LocalJourney | null> {
  const raw = await AsyncStorage.getItem(JOURNEY_KEY);
  if (!raw) return null;

  try {
    const stored: unknown = JSON.parse(raw);
    if (isLocalJourney(stored)) {
      return {
        originCity: stored.originCity.trim(),
        originProvince: stored.originProvince,
        destinationCity: stored.destinationCity.trim(),
        destinationProvince: stored.destinationProvince,
        hasVehicle:
          typeof stored.hasVehicle === "boolean" ? stored.hasVehicle : null,
        hasSchoolAgeChildren:
          typeof stored.hasSchoolAgeChildren === "boolean"
            ? stored.hasSchoolAgeChildren
            : null,
        consentVersion: stored.consentVersion,
      };
    }
  } catch {
    // Invalid local data is discarded below.
  }
  await AsyncStorage.removeItem(JOURNEY_KEY);
  return null;
}

export async function saveLocalJourney(journey: LocalJourney): Promise<void> {
  await AsyncStorage.setItem(JOURNEY_KEY, JSON.stringify(journey));
}

export async function clearLocalJourney(): Promise<void> {
  await Promise.allSettled(pendingProgressWrites.values());
  const keys = await AsyncStorage.getAllKeys();
  const progressKeys = keys.filter((key) => key.startsWith(PROGRESS_KEY_PREFIX));
  await AsyncStorage.multiRemove([JOURNEY_KEY, ...progressKeys]);
}

export async function loadLocalProgress(
  origin: Province,
  destination: Province,
): Promise<Record<string, TaskStatus>> {
  const raw = await AsyncStorage.getItem(progressKey(origin, destination));
  if (!raw) return {};

  try {
    return JSON.parse(raw) as Record<string, TaskStatus>;
  } catch {
    await AsyncStorage.removeItem(progressKey(origin, destination));
    return {};
  }
}

export async function saveLocalTaskStatus(
  origin: Province,
  destination: Province,
  taskRuleId: string,
  status: TaskStatus,
): Promise<void> {
  const key = progressKey(origin, destination);
  const previousWrite = pendingProgressWrites.get(key) ?? Promise.resolve();
  const write = previousWrite.catch(() => undefined).then(async () => {
    const current = await loadLocalProgress(origin, destination);
    await AsyncStorage.setItem(key, JSON.stringify({ ...current, [taskRuleId]: status }));
  });
  pendingProgressWrites.set(key, write);

  try {
    await write;
  } finally {
    if (pendingProgressWrites.get(key) === write) pendingProgressWrites.delete(key);
  }
}
