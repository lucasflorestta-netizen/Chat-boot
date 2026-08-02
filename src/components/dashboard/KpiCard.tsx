import type { ReactNode } from 'react';

export type KpiCardProps = {
  label: string;
  value: string | number;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
};

export function KpiCard({ label, value, icon, iconBg, iconColor }: KpiCardProps) {
  return (
    <div className="bg-[#151821] border border-[#2A2E3A] rounded-xl p-5 flex flex-col gap-2 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
      <div
        className="w-[44px] h-[44px] rounded-lg flex items-center justify-center"
        style={{ backgroundColor: iconBg, color: iconColor }}
      >
        {icon}
      </div>

      <span className="text-[13px] text-[#9CA3AF] font-medium">{label}</span>

      <p className="text-[36px] font-bold text-white leading-none">{value}</p>
    </div>
  );
}
