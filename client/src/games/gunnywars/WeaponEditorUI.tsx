import { useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  Info,
  Settings2,
  Palette,
  Sparkles,
  Wand2,
} from "lucide-react";
import type {
  CustomWeapon,
  WeaponEffect,
  WeaponEffectType as EffectTypes,
} from "./types";
import { WeaponType, WeaponEffectType } from "./types";
import { TANK_COLORS } from "./constants";
import Portal from "../../components/Portal";
import useLanguage from "../../stores/languageStore";

interface WeaponEditorProps {
  show: boolean;
  onClose: () => void;
  onSave: (weapon: CustomWeapon) => void;
  initialWeapon?: CustomWeapon;
  userId: string;
}

const EFFECT_DISPLAY_NAMES: Record<number, { en: string; vi: string }> = {
  [WeaponEffectType.BOUNCE]: { en: "Bounce", vi: "Nảy" },
  [WeaponEffectType.PIERCE]: { en: "Pierce", vi: "Xuyên thấu" },
  [WeaponEffectType.GRAVITY]: { en: "Gravity Pull", vi: "Hút trọng lực" },
  [WeaponEffectType.GENERATOR]: { en: "Generator", vi: "Máy phát điện" },
  [WeaponEffectType.SPLIT]: { en: "Split on Impact", vi: "Phân mảnh" },
  [WeaponEffectType.HEAL]: { en: "Heal Amount", vi: "Lượng hồi máu" },
  [WeaponEffectType.VAMPIRE]: { en: "Vampire Drain", vi: "Hút máu" },
  [WeaponEffectType.BUILDER]: { en: "Terrain Builder", vi: "Xây địa hình" },
  [WeaponEffectType.DRILL]: { en: "Terrain Drill", vi: "Khoan địa hình" },
};

const EFFECT_DESCRIPTIONS: Record<number, { en: string; vi: string }> = {
  [WeaponEffectType.BOUNCE]: {
    en: "Number of times the bullet bounces on terrain",
    vi: "Số lần đạn nảy trên địa hình",
  },
  [WeaponEffectType.PIERCE]: {
    en: "Layers of terrain the bullet can pass through",
    vi: "Số lớp địa hình đạn có thể xuyên qua",
  },
  [WeaponEffectType.GRAVITY]: {
    en: "Strength of attraction for nearby objects",
    vi: "Sức hút đối với các vật thể xung quanh",
  },
  [WeaponEffectType.GENERATOR]: {
    en: "Interval between spawning mini-projectiles",
    vi: "Khoảng cách giữa các lần tạo đạn con",
  },
  [WeaponEffectType.SPLIT]: {
    en: "Number of fragments created upon impact",
    vi: "Số mảnh vụn tạo ra khi va chạm",
  },
  [WeaponEffectType.HEAL]: {
    en: "Amount of health restored to tanks in blast",
    vi: "Lượng máu hồi phục cho xe tăng trong vùng nổ",
  },
  [WeaponEffectType.VAMPIRE]: {
    en: "Steal health from enemies and heal yourself",
    vi: "Hút máu kẻ thù và hồi máu cho bản thân",
  },
  [WeaponEffectType.BUILDER]: {
    en: "Creates terrain in the explosion radius",
    vi: "Tạo thêm địa hình trong bán kính nổ",
  },
  [WeaponEffectType.DRILL]: {
    en: "Blasts a deep tunnel through terrain",
    vi: "Tạo ra một đường hầm sâu xuyên qua địa hình",
  },
};

export default function WeaponEditorUI({
  show,
  onClose,
  onSave,
  initialWeapon,
  userId,
}: WeaponEditorProps) {
  const { ts } = useLanguage();
  const [weapon, setWeapon] = useState<Partial<CustomWeapon>>({
    id: Math.random().toString(36).slice(2, 9),
    name: "New Custom Weapon",
    type: WeaponType.BASIC,
    damage: 25,
    radius: 40,
    color: TANK_COLORS[0],
    count: 1,
    spread: 5,
    terrainDamageMultiplier: 1,
    description: "A custom legendary weapon.",
    descriptionVi: "Một vũ khí huyền thoại tùy chỉnh.",
    effects: [],
    size: 5,
    creatorId: userId,
    cooldown: 3000,
  });

  useEffect(() => {
    if (initialWeapon) {
      setWeapon(JSON.parse(JSON.stringify(initialWeapon)));
    } else {
      setWeapon({
        id: Math.random().toString(36).slice(2, 9),
        name: "New Custom Weapon",
        type: WeaponType.BASIC,
        damage: 25,
        radius: 40,
        color: TANK_COLORS[0],
        count: 1,
        spread: 5,
        terrainDamageMultiplier: 1,
        description: "A custom legendary weapon.",
        descriptionVi: "Một vũ khí huyền thoại tùy chỉnh.",
        effects: [],
        size: 5,
        creatorId: userId,
        cooldown: 3000,
      });
    }
  }, [initialWeapon, show, userId]);

  if (!show) return null;

  const updateAttr = (key: keyof CustomWeapon, value: any) => {
    setWeapon((prev) => ({ ...prev, [key]: value }));
  };

  const addEffect = (type: number) => {
    if (weapon.effects?.some((e) => e.type === type)) return;
    const newEffect: WeaponEffect = { type: type as EffectTypes, value: 3 };
    setWeapon((prev) => ({
      ...prev,
      effects: [...(prev.effects || []), newEffect],
    }));
  };

  const removeEffect = (type: number) => {
    setWeapon((prev) => ({
      ...prev,
      effects: prev.effects?.filter((e) => e.type !== type),
    }));
  };

  const updateEffectValue = (type: number, value: number) => {
    setWeapon((prev) => ({
      ...prev,
      effects: prev.effects?.map((e) =>
        e.type === type ? { ...e, value } : e,
      ),
    }));
  };

  const handleSave = () => {
    onSave(weapon as CustomWeapon);
    onClose();
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto overflow-x-hidden">
        <div className="bg-gray-900 border border-gray-700/50 rounded-3xl w-full max-w-4xl min-h-[600px] max-h-[85vh] flex flex-col shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-800/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                <Wand2 size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
                  {ts({ en: "Weapon Creator", vi: "Tạo vũ khí" })}
                </h2>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">
                  {ts({
                    en: "Design your ultimate tool of destruction",
                    vi: "Thiết kế vũ khí tối thượng của bạn",
                  })}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700/50 rounded-full transition-colors text-gray-400 hover:text-white"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 md:p-8 no-scrollbar flex flex-col gap-8">
            {/* Row 1: Basic Info & Color */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <section className="space-y-4">
                <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Info size={14} />
                  {ts({ en: "Basic Information", vi: "Thông tin cơ bản" })}
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 ml-1">
                      {ts({ en: "Weapon Name", vi: "Tên vũ khí" })}
                    </label>
                    <input
                      type="text"
                      value={weapon.name}
                      onChange={(e) => updateAttr("name", e.target.value)}
                      placeholder="e.g. Gravity Void"
                      className="w-full bg-gray-800/80 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-bold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 ml-1">
                      {ts({ en: "Description (EN)", vi: "Mô tả (EN)" })}
                    </label>
                    <textarea
                      value={weapon.description}
                      onChange={(e) =>
                        updateAttr("description", e.target.value)
                      }
                      className="w-full bg-gray-800/80 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all min-h-[80px] resize-none"
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Palette size={14} />
                  {ts({ en: "Aesthetics", vi: "Mỹ thuật" })}
                </h3>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 ml-1">
                      {ts({ en: "Projectile Color", vi: "Màu sắc đạn" })}
                    </label>
                    <div className="flex flex-wrap gap-3">
                      {TANK_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => updateAttr("color", c)}
                          className={`w-10 h-10 rounded-full transition-all border-4 ${
                            weapon.color === c
                              ? "border-white scale-110 shadow-lg shadow-white/20"
                              : "border-transparent hover:scale-105"
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 ml-1 flex justify-between">
                      <span>
                        {ts({ en: "Projectile Size", vi: "Kích thước đạn" })}
                      </span>
                      <span className="text-blue-400 font-mono">
                        {weapon.size}px
                      </span>
                    </label>
                    <input
                      type="range"
                      min="2"
                      max="20"
                      value={weapon.size}
                      onChange={(e) =>
                        updateAttr("size", parseInt(e.target.value))
                      }
                      className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>
              </section>
            </div>

            <hr className="border-gray-800" />

            {/* Row 2: Attributes */}
            <section className="space-y-6">
              <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Settings2 size={14} />
                {ts({ en: "Power & Attributes", vi: "Sức mạnh & Thuộc tính" })}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                {/* Damage */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs font-bold uppercase tracking-tighter">
                    <span className="text-gray-400">
                      {ts({ en: "Base Damage", vi: "Sát thương cơ bản" })}
                    </span>
                    <span className="text-red-400 font-mono text-sm">
                      {weapon.damage} HP
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={weapon.damage}
                    onChange={(e) =>
                      updateAttr("damage", parseInt(e.target.value))
                    }
                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-red-500"
                  />
                </div>
                {/* Radius */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs font-bold uppercase tracking-tighter">
                    <span className="text-gray-400">
                      {ts({ en: "Explosion Radius", vi: "Bán kính nổ" })}
                    </span>
                    <span className="text-orange-400 font-mono text-sm">
                      {weapon.radius}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="200"
                    step="10"
                    value={weapon.radius}
                    onChange={(e) =>
                      updateAttr("radius", parseInt(e.target.value))
                    }
                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                </div>
                {/* Count */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs font-bold uppercase tracking-tighter">
                    <span className="text-gray-400">
                      {ts({ en: "Projectile Count", vi: "Số lượng đạn" })}
                    </span>
                    <span className="text-purple-400 font-mono text-sm">
                      {weapon.count}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={weapon.count}
                    onChange={(e) =>
                      updateAttr("count", parseInt(e.target.value))
                    }
                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>
                {/* Spread */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs font-bold uppercase tracking-tighter">
                    <span className="text-gray-400">
                      {ts({ en: "Fire Spread", vi: "Độ tỏa" })}
                    </span>
                    <span className="text-emerald-400 font-mono text-sm">
                      {weapon.spread}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="45"
                    value={weapon.spread}
                    onChange={(e) =>
                      updateAttr("spread", parseInt(e.target.value))
                    }
                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              </div>
            </section>

            <hr className="border-gray-800" />

            {/* Row 3: Effects */}
            <section className="space-y-6">
              <div className="flex justify-between items-end">
                <h3 className="text-sm font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Sparkles size={14} />
                  {ts({ en: "Custom Effects", vi: "Hiệu ứng đặc biệt" })}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(EFFECT_DISPLAY_NAMES).map((typeStr) => {
                    const type = parseInt(typeStr);
                    const isAdded = weapon.effects?.some(
                      (e) => e.type === type,
                    );
                    return (
                      <button
                        key={type}
                        onClick={() => addEffect(type)}
                        disabled={isAdded}
                        className={`text-[10px] font-black uppercase px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all ${
                          isAdded
                            ? "opacity-30 border-gray-800 text-gray-600 bg-transparent cursor-default"
                            : "bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 active:scale-95"
                        }`}
                      >
                        <Plus size={12} />
                        {ts(EFFECT_DISPLAY_NAMES[type])}
                      </button>
                    );
                  })}
                </div>
              </div>

              {weapon.effects?.length === 0 ? (
                <div className="bg-gray-800/30 border border-dashed border-gray-800 rounded-2xl py-12 flex flex-col items-center justify-center text-gray-500 gap-3">
                  <Sparkles size={32} className="opacity-20" />
                  <p className="text-sm font-medium">
                    {ts({
                      en: "No effects added yet. Choose from above!",
                      vi: "Chưa có hiệu ứng. Chọn từ danh sách phía trên!",
                    })}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {weapon.effects?.map((effect) => (
                    <div
                      key={effect.type}
                      className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-4 flex flex-col gap-4 group"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col">
                          <span className="font-black text-xs text-blue-400 uppercase tracking-widest">
                            {ts(EFFECT_DISPLAY_NAMES[effect.type])}
                          </span>
                          <span className="text-[10px] text-gray-400 font-medium leading-tight mt-1">
                            {ts(EFFECT_DESCRIPTIONS[effect.type])}
                          </span>
                        </div>
                        <button
                          onClick={() => removeEffect(effect.type)}
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="flex items-center gap-4">
                        <input
                          type="range"
                          min="1"
                          max="20"
                          value={effect.value}
                          onChange={(e) =>
                            updateEffectValue(
                              effect.type,
                              parseInt(e.target.value),
                            )
                          }
                          className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-400"
                        />
                        <span className="text-sm font-mono font-black text-white w-8 text-right">
                          {effect.value}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-800 flex gap-4 bg-gray-800/30 backdrop-blur-md rounded-b-3xl">
            <button
              onClick={onClose}
              className="flex-1 py-4 px-6 rounded-2xl border border-gray-700 font-black tracking-widest text-xs uppercase hover:bg-gray-700/50 transition-all active:scale-[0.98]"
            >
              {ts({ en: "Cancel", vi: "Hủy" })}
            </button>
            <button
              onClick={handleSave}
              className="flex-2 py-4 px-6 rounded-2xl bg-linear-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 font-black tracking-widest text-xs uppercase text-white shadow-xl shadow-blue-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Sparkles size={16} />
              {ts({ en: "Manifest Weapon", vi: "Triệu hồi vũ khí" })}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
