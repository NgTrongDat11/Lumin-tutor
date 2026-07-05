export interface Province {
  code: string;
  name: string;
  type: string;
}

export interface Commune {
  provinceCode: string;
  code: string;
  name: string;
}

export interface AdministrativeUnits {
  version: string;
  source: string;
  provinces: Province[];
  communes: Commune[];
}

let administrativeUnitsPromise: Promise<AdministrativeUnits> | null = null;

export function loadAdministrativeUnits() {
  if (!administrativeUnitsPromise) {
    administrativeUnitsPromise = fetch(
      `${import.meta.env.BASE_URL}data/vietnam-administrative-units.json`,
    ).then((response) => {
      if (!response.ok) {
        throw new Error('Không thể tải danh mục địa chỉ.');
      }
      return response.json() as Promise<AdministrativeUnits>;
    });
  }
  return administrativeUnitsPromise;
}

export function provinceLabel(province: Province) {
  return province.name.startsWith('Thành phố') ? province.name : `Tỉnh ${province.name}`;
}

export function normalizeLocationText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function provinceAliases(province: Province) {
  const name = normalizeLocationText(province.name);
  const withoutPrefix = name
    .replace(/^thanh pho\s+/, '')
    .replace(/^tinh\s+/, '')
    .trim();
  return Array.from(new Set([name, withoutPrefix].filter(Boolean))).sort(
    (left, right) => right.length - left.length,
  );
}

export function findProvinceByAddress(data: AdministrativeUnits, address: string) {
  const normalizedAddress = normalizeLocationText(address);
  if (!normalizedAddress) return undefined;

  return data.provinces.find((province) => (
    provinceAliases(province).some((alias) => normalizedAddress.includes(alias))
  ));
}

function findCommuneIndex(communes: Commune[], address: string) {
  const normalizedAddress = normalizeLocationText(address);
  if (!normalizedAddress) return -1;

  return communes.findIndex((commune) => normalizedAddress.includes(normalizeLocationText(commune.name)));
}

function pushUnique(target: Commune[], commune: Commune | undefined) {
  if (!commune) return;
  if (target.some((item) => item.code === commune.code)) return;
  target.push(commune);
}

function communeAddress(commune: Commune, province: Province) {
  return `${commune.name}, ${province.name}`;
}

export function getAreaSuggestions(
  data: AdministrativeUnits,
  referenceAddress: string | null | undefined,
  currentValue: string | null | undefined,
  limit = 8,
) {
  const combinedAddress = [currentValue, referenceAddress].filter(Boolean).join(', ');
  const province = findProvinceByAddress(data, combinedAddress);
  if (!province) return [];

  const communes = data.communes.filter((commune) => commune.provinceCode === province.code);
  if (communes.length === 0) return [];

  const anchorIndex = Math.max(
    findCommuneIndex(communes, currentValue || ''),
    findCommuneIndex(communes, referenceAddress || ''),
  );

  const ordered: Commune[] = [];
  if (anchorIndex >= 0) {
    pushUnique(ordered, communes[anchorIndex]);
    for (let offset = 1; ordered.length < limit && offset < communes.length; offset += 1) {
      pushUnique(ordered, communes[anchorIndex + offset]);
      if (ordered.length >= limit) break;
      pushUnique(ordered, communes[anchorIndex - offset]);
    }
  }

  for (const commune of communes) {
    if (ordered.length >= limit) break;
    pushUnique(ordered, commune);
  }

  return ordered.slice(0, limit).map((commune) => communeAddress(commune, province));
}
