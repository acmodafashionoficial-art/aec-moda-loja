import type { LogisticsSettings, PackageTemplate, ShipmentPlan, ShipmentUnit } from "@/lib/logistics-types";

const round = (value: number, decimals = 3) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

function packageVolume(packageItem: PackageTemplate) {
  return packageItem.widthCm * packageItem.heightCm * packageItem.lengthCm;
}

function usablePackageVolume(packageItem: PackageTemplate) {
  return packageVolume(packageItem) * (packageItem.usableVolumePercent / 100);
}

function enabledPackages(settings: LogisticsSettings) {
  return settings.packages
    .filter((item) => item.enabled)
    .sort((a, b) => usablePackageVolume(a) - usablePackageVolume(b));
}

export function createShipmentPlan(units: ShipmentUnit[], settings: LogisticsSettings): ShipmentPlan {
  const totalItems = units.reduce((sum, item) => sum + Math.max(0, Math.floor(item.quantity)), 0);
  if (!totalItems) throw new Error("Não há itens para calcular a embalagem.");

  const productWeightKg = units.reduce((sum, item) => sum + item.unitWeightKg * item.quantity, 0);
  const productVolumeCm3 = units.reduce((sum, item) => sum + item.unitVolumeCm3 * item.quantity, 0);
  const totalInsurance = units.reduce((sum, item) => sum + item.insuranceValue * item.quantity, 0);
  const quotedWeightKg = productWeightKg * (1 + settings.weightSafetyPercent / 100);
  const quotedVolumeCm3 = productVolumeCm3 * (1 + settings.volumeSafetyPercent / 100);
  const packages = enabledPackages(settings);
  if (!packages.length) throw new Error("Cadastre pelo menos uma embalagem ativa no painel.");

  const single = packages.find((packageItem) => (
    quotedVolumeCm3 <= usablePackageVolume(packageItem)
    && quotedWeightKg + packageItem.tareWeightKg <= packageItem.maxWeightKg
  ));

  if (single) {
    return {
      totalItems,
      productWeightKg: round(productWeightKg),
      quotedWeightKg: round(quotedWeightKg + single.tareWeightKg),
      productVolumeCm3: round(productVolumeCm3, 0),
      quotedVolumeCm3: round(quotedVolumeCm3, 0),
      volumes: [{
        packageId: single.id,
        packageName: single.name,
        widthCm: single.widthCm,
        heightCm: single.heightCm,
        lengthCm: single.lengthCm,
        weightKg: round(quotedWeightKg + single.tareWeightKg),
        insuranceValue: round(totalInsurance, 2),
      }],
      warning: totalItems > settings.maxAutomaticItems
        ? `Pedido com ${totalItems} itens. Recomenda-se conferir a embalagem antes de gerar a etiqueta.`
        : undefined,
    };
  }

  const largest = packages[packages.length - 1];
  const capacityByVolume = Math.max(1, usablePackageVolume(largest));
  const capacityByWeight = Math.max(0.1, largest.maxWeightKg - largest.tareWeightKg);
  const volumeCount = Math.ceil(quotedVolumeCm3 / capacityByVolume);
  const weightCount = Math.ceil(quotedWeightKg / capacityByWeight);
  const count = Math.max(2, volumeCount, weightCount);
  const volumes = Array.from({ length: count }, (_, index) => ({
    packageId: largest.id,
    packageName: `${largest.name} ${index + 1}/${count}`,
    widthCm: largest.widthCm,
    heightCm: largest.heightCm,
    lengthCm: largest.lengthCm,
    weightKg: round(quotedWeightKg / count + largest.tareWeightKg),
    insuranceValue: round(totalInsurance / count, 2),
  }));

  return {
    totalItems,
    productWeightKg: round(productWeightKg),
    quotedWeightKg: round(volumes.reduce((sum, volume) => sum + volume.weightKg, 0)),
    productVolumeCm3: round(productVolumeCm3, 0),
    quotedVolumeCm3: round(quotedVolumeCm3, 0),
    volumes,
    warning: `O pedido será calculado em ${count} volumes. Algumas transportadoras podem não aceitar volumes agrupados.`,
  };
}

export function profileUnitVolume(widthCm: number, heightCm: number, lengthCm: number) {
  return Math.max(1, widthCm * heightCm * lengthCm);
}
