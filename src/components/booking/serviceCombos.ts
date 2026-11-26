export type ServiceZone = 'hands' | 'feet';

interface ComboService {
  id: string;
  name: string;
  categoryId: string | null;
}

interface ComboCategory {
  id: string;
  name: string;
}

interface ComboAddon {
  id: string;
  name: string;
}

const FEET_TOKENS = new Set(['pie', 'pies', 'pedi', 'pedispa', 'pedicure', 'pedicura', 'acripie']);

function conceptTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 || FEET_TOKENS.has(token));
}

export function resolveServiceZone(service: ComboService, categories: readonly ComboCategory[]): ServiceZone {
  const categoryName = categories.find((category) => category.id === service.categoryId)?.name ?? '';
  const tokens = [...conceptTokens(service.name), ...conceptTokens(categoryName)];
  return tokens.some((token) => FEET_TOKENS.has(token) || token.startsWith('pedi')) ? 'feet' : 'hands';
}

function isServiceCoveredByAddon(service: ComboService, addons: readonly ComboAddon[]): boolean {
  const serviceTokens = conceptTokens(service.name);
  if (serviceTokens.length === 0) return false;
  return addons.some((addon) => {
    const addonTokens = new Set(conceptTokens(addon.name));
    return serviceTokens.every((token) => addonTokens.has(token));
  });
}

function isAddonRedundantWithService(addon: ComboAddon, chosen: readonly ComboService[]): boolean {
  return chosen.some((service) => isServiceCoveredByAddon(service, [addon]));
}

export interface ServiceComboOptions<S extends ComboService> {
  extraServices: S[];
  selectedExtraServices: S[];
  zoneById: ReadonlyMap<string, ServiceZone>;
}

export function buildServiceComboOptions<S extends ComboService>(input: {
  primary: S | undefined;
  services: readonly S[];
  categories: readonly ComboCategory[];
  allAddons: readonly ComboAddon[];
  selectedExtraIds: readonly string[];
}): ServiceComboOptions<S> {
  const zoneById = new Map<string, ServiceZone>();
  for (const service of input.services) zoneById.set(service.id, resolveServiceZone(service, input.categories));
  const primary = input.primary;
  if (!primary) return { extraServices: [], selectedExtraServices: [], zoneById };
  const primaryZone = zoneById.get(primary.id) ?? 'hands';
  const extraServices = input.services.filter(
    (service) =>
      service.id !== primary.id &&
      zoneById.get(service.id) !== primaryZone &&
      !isServiceCoveredByAddon(service, input.allAddons),
  );
  const usedZones = new Set<ServiceZone>([primaryZone]);
  const selectedExtraServices: S[] = [];
  for (const id of input.selectedExtraIds) {
    const service = extraServices.find((item) => item.id === id);
    const zone = zoneById.get(id);
    if (!service || !zone || usedZones.has(zone)) continue;
    usedZones.add(zone);
    selectedExtraServices.push(service);
  }
  return { extraServices, selectedExtraServices, zoneById };
}

export function filterRedundantAddons<A extends ComboAddon>(
  addons: readonly A[],
  chosen: readonly ComboService[],
): A[] {
  return addons.filter((addon) => !isAddonRedundantWithService(addon, chosen));
}

export function toggleExtraServiceInZone(input: {
  selectedIds: readonly string[];
  serviceId: string;
  checked: boolean;
  zoneById: ReadonlyMap<string, ServiceZone>;
}): string[] {
  if (!input.checked) return input.selectedIds.filter((id) => id !== input.serviceId);
  const zone = input.zoneById.get(input.serviceId);
  return [...input.selectedIds.filter((id) => input.zoneById.get(id) !== zone), input.serviceId];
}
