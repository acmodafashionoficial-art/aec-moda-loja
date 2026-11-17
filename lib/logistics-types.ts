export type LogisticsProfile = {
  id: string;
  name: string;
  description: string;
  unitWeightKg: number;
  unitWidthCm: number;
  unitHeightCm: number;
  unitLengthCm: number;
  unitVolumeCm3: number;
  enabled: boolean;
  calibratedAt?: string;
  calibrationQuantity?: number;
};

export type PackageTemplate = {
  id: string;
  name: string;
  widthCm: number;
  heightCm: number;
  lengthCm: number;
  tareWeightKg: number;
  maxWeightKg: number;
  usableVolumePercent: number;
  enabled: boolean;
};

export type LogisticsSettings = {
  weightSafetyPercent: number;
  volumeSafetyPercent: number;
  maxAutomaticItems: number;
  fallbackProfileId: string;
  profiles: LogisticsProfile[];
  packages: PackageTemplate[];
};

export type ShipmentUnit = {
  quantity: number;
  unitWeightKg: number;
  unitVolumeCm3: number;
  insuranceValue: number;
};

export type ShipmentVolume = {
  packageId: string;
  packageName: string;
  widthCm: number;
  heightCm: number;
  lengthCm: number;
  weightKg: number;
  insuranceValue: number;
};

export type ShipmentPlan = {
  totalItems: number;
  productWeightKg: number;
  quotedWeightKg: number;
  productVolumeCm3: number;
  quotedVolumeCm3: number;
  volumes: ShipmentVolume[];
  warning?: string;
};
