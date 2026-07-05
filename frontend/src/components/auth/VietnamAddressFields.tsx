import { useEffect, useMemo, useState } from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import {
  type AdministrativeUnits,
  type Commune,
  type Province,
  findProvinceByAddress,
  loadAdministrativeUnits,
  normalizeLocationText,
  provinceLabel,
} from '../../utils/vietnamAdministrativeUnits';

interface VietnamAddressFieldsProps {
  value?: string;
  onChange: (address: string) => void;
  required?: boolean;
}

function composeAddress(detail: string, communeName: string, provinceName: string) {
  return [detail.trim(), communeName, provinceName].filter(Boolean).join(', ');
}

function isProvincePart(part: string, province: Province) {
  const normalizedPart = normalizeLocationText(part)
    .replace(/^thanh pho\s+/, '')
    .replace(/^tinh\s+/, '')
    .trim();
  const normalizedName = normalizeLocationText(province.name)
    .replace(/^thanh pho\s+/, '')
    .replace(/^tinh\s+/, '')
    .trim();
  return normalizedPart === normalizedName;
}

function inferDetail(address: string, commune: Commune | undefined, province: Province | undefined) {
  if (!address) return '';

  return address
    .split(',')
    .map((part) => part.trim())
    .filter((part) => {
      const normalizedPart = normalizeLocationText(part);
      if (!normalizedPart) return false;
      if (commune && normalizedPart === normalizeLocationText(commune.name)) return false;
      if (province && isProvincePart(part, province)) return false;
      return true;
    })
    .join(', ');
}

export default function VietnamAddressFields({
  value = '',
  onChange,
  required = true,
}: VietnamAddressFieldsProps) {
  const [data, setData] = useState<AdministrativeUnits | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [provinceCode, setProvinceCode] = useState('');
  const [communeCode, setCommuneCode] = useState('');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    let cancelled = false;

    loadAdministrativeUnits()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    if (!value) {
      setProvinceCode('');
      setCommuneCode('');
      setDetail('');
      return;
    }

    const province = findProvinceByAddress(data, value);
    if (!province) {
      setDetail(value);
      return;
    }

    const provinceCommunes = data.communes.filter(
      (commune) => commune.provinceCode === province.code,
    );
    const normalizedAddress = normalizeLocationText(value);
    const commune = provinceCommunes.find((item) => (
      normalizedAddress.includes(normalizeLocationText(item.name))
    ));

    setProvinceCode(province.code);
    setCommuneCode(commune?.code ?? '');
    setDetail(inferDetail(value, commune, province));
  }, [data, value]);

  const selectedProvince = useMemo(
    () => data?.provinces.find((province) => province.code === provinceCode),
    [data, provinceCode],
  );
  const communes = useMemo(
    () => data?.communes.filter((commune) => commune.provinceCode === provinceCode) ?? [],
    [data, provinceCode],
  );
  const selectedCommune = useMemo(
    () => communes.find((commune) => commune.code === communeCode),
    [communes, communeCode],
  );

  const emitAddress = (
    nextDetail: string,
    nextCommune: Commune | undefined,
    nextProvince: Province | undefined,
  ) => {
    onChange(composeAddress(nextDetail, nextCommune?.name ?? '', nextProvince?.name ?? ''));
  };

  if (loadError) {
    return (
      <Input
        label="Địa chỉ/khu vực"
        placeholder="VD: Phường Trà Vinh, Vĩnh Long"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        hint="Không tải được danh mục hành chính; bạn vẫn có thể nhập địa chỉ thủ công."
        required={required}
      />
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border-light bg-surface-secondary/60 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Tỉnh/thành"
          placeholder={data ? 'Chọn tỉnh/thành...' : 'Đang tải danh sách...'}
          options={(data?.provinces ?? []).map((province) => ({
            value: province.code,
            label: provinceLabel(province),
          }))}
          value={provinceCode}
          disabled={!data}
          required={required}
          onChange={(event) => {
            const nextProvince = data?.provinces.find(
              (province) => province.code === event.target.value,
            );
            setProvinceCode(event.target.value);
            setCommuneCode('');
            emitAddress(detail, undefined, nextProvince);
          }}
        />
        <Select
          label="Phường/xã"
          placeholder={provinceCode ? 'Chọn phường/xã...' : 'Chọn tỉnh/thành trước'}
          options={communes.map((commune) => ({
            value: commune.code,
            label: commune.name,
          }))}
          value={communeCode}
          disabled={!provinceCode}
          required={required}
          onChange={(event) => {
            const nextCommune = communes.find((commune) => commune.code === event.target.value);
            setCommuneCode(event.target.value);
            emitAddress(detail, nextCommune, selectedProvince);
          }}
        />
      </div>
      <Input
        label="Địa chỉ chi tiết (tùy chọn)"
        placeholder="Số nhà, tên đường..."
        value={detail}
        onChange={(event) => {
          const nextDetail = event.target.value;
          setDetail(nextDetail);
          emitAddress(nextDetail, selectedCommune, selectedProvince);
        }}
        hint="Danh mục mới từ 01/07/2025 dùng 2 cấp: tỉnh/thành và phường/xã."
      />
    </div>
  );
}
